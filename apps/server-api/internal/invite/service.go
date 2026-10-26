package invite

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"openspace/server-api/internal/auth"
)

var ErrNotFound = errors.New("invite_not_found")

type Invite struct {
	Code      string  `json:"code"`
	ExpiresAt *string `json:"expires_at"`
}

type InviteDetail struct {
	Code      string  `json:"code"`
	MaxUses   int     `json:"max_uses"`
	UseCount  int     `json:"use_count"`
	ExpiresAt *string `json:"expires_at"`
	RevokedAt *string `json:"revoked_at"`
	CreatedAt string  `json:"created_at"`
}

type Service struct {
	db *pgxpool.Pool
}

func NewService(db *pgxpool.Pool) *Service {
	return &Service{db: db}
}

func (s *Service) serverID(ctx context.Context) (string, error) {
	var id string
	err := s.db.QueryRow(ctx, `SELECT id FROM servers LIMIT 1`).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", fmt.Errorf("server not bootstrapped")
	}
	return id, err
}

func (s *Service) Create(ctx context.Context, createdBy string, maxUses int, expiresInHours *int) (*Invite, error) {
	sid, err := s.serverID(ctx)
	if err != nil {
		return nil, err
	}

	code, err := auth.GenerateInviteCode()
	if err != nil {
		return nil, fmt.Errorf("generate code: %w", err)
	}

	var expiresAt *time.Time
	if expiresInHours != nil && *expiresInHours > 0 {
		t := time.Now().UTC().Add(time.Duration(*expiresInHours) * time.Hour)
		expiresAt = &t
	}

	if maxUses < 1 {
		maxUses = 1
	}

	if _, err := s.db.Exec(ctx,
		`INSERT INTO invites(server_id, code, created_by, max_uses, expires_at)
		 VALUES($1, $2, $3, $4, $5)`,
		sid, code, createdBy, maxUses, expiresAt,
	); err != nil {
		return nil, fmt.Errorf("insert invite: %w", err)
	}

	inv := &Invite{Code: code}
	if expiresAt != nil {
		ts := expiresAt.Format(time.RFC3339)
		inv.ExpiresAt = &ts
	}
	return inv, nil
}

func (s *Service) List(ctx context.Context) ([]*InviteDetail, error) {
	sid, err := s.serverID(ctx)
	if err != nil {
		return nil, err
	}

	rows, err := s.db.Query(ctx,
		`SELECT code, max_uses, use_count, expires_at, revoked_at, created_at
		 FROM invites WHERE server_id = $1
		 ORDER BY created_at DESC`,
		sid,
	)
	if err != nil {
		return nil, fmt.Errorf("query invites: %w", err)
	}
	defer rows.Close()

	var result []*InviteDetail
	for rows.Next() {
		var d InviteDetail
		var expiresAt, revokedAt *time.Time
		var createdAt time.Time
		if err := rows.Scan(&d.Code, &d.MaxUses, &d.UseCount, &expiresAt, &revokedAt, &createdAt); err != nil {
			return nil, fmt.Errorf("scan invite: %w", err)
		}
		d.CreatedAt = createdAt.UTC().Format(time.RFC3339)
		if expiresAt != nil {
			ts := expiresAt.UTC().Format(time.RFC3339)
			d.ExpiresAt = &ts
		}
		if revokedAt != nil {
			ts := revokedAt.UTC().Format(time.RFC3339)
			d.RevokedAt = &ts
		}
		result = append(result, &d)
	}
	if result == nil {
		result = []*InviteDetail{}
	}
	return result, rows.Err()
}

func (s *Service) Revoke(ctx context.Context, code string) error {
	sid, err := s.serverID(ctx)
	if err != nil {
		return err
	}

	ct, err := s.db.Exec(ctx,
		`UPDATE invites SET revoked_at = NOW()
		 WHERE code = $1 AND server_id = $2 AND revoked_at IS NULL`,
		code, sid,
	)
	if err != nil {
		return fmt.Errorf("revoke invite: %w", err)
	}
	if ct.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}
