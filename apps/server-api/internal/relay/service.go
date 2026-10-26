package relay

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var (
	ErrNotFound = errors.New("transfer_not_found")
	ErrExpired  = errors.New("transfer_expired")
	ErrUsed     = errors.New("transfer_already_used")
)

type UploadResult struct {
	TransferID string
}

type Service struct {
	db *pgxpool.Pool
}

func NewService(db *pgxpool.Pool) *Service {
	return &Service{db: db}
}

func (s *Service) Upload(ctx context.Context, encryptedBundle string, expiresInSeconds int) (*UploadResult, error) {
	if expiresInSeconds <= 0 || expiresInSeconds > 86400 {
		expiresInSeconds = 1800
	}
	expiresAt := time.Now().UTC().Add(time.Duration(expiresInSeconds) * time.Second)

	var id string
	err := s.db.QueryRow(ctx,
		`INSERT INTO relay_transfers(encrypted_bundle, expires_at) VALUES($1, $2) RETURNING id`,
		encryptedBundle, expiresAt,
	).Scan(&id)
	if err != nil {
		return nil, fmt.Errorf("insert relay_transfer: %w", err)
	}
	return &UploadResult{TransferID: id}, nil
}

// Download atomically claims and returns the bundle in a single UPDATE...RETURNING.
// This eliminates the SELECT→UPDATE TOCTOU window.
func (s *Service) Download(ctx context.Context, transferID string) (string, error) {
	var bundle string
	err := s.db.QueryRow(ctx,
		`UPDATE relay_transfers
		 SET used_at = NOW()
		 WHERE id = $1 AND used_at IS NULL AND expires_at > NOW()
		 RETURNING encrypted_bundle`,
		transferID,
	).Scan(&bundle)

	if errors.Is(err, pgx.ErrNoRows) {
		// Determine specific error for better client feedback
		var expiresAt time.Time
		var usedAt *time.Time
		err2 := s.db.QueryRow(ctx,
			`SELECT expires_at, used_at FROM relay_transfers WHERE id = $1`, transferID,
		).Scan(&expiresAt, &usedAt)
		if errors.Is(err2, pgx.ErrNoRows) {
			return "", ErrNotFound
		}
		if usedAt != nil {
			return "", ErrUsed
		}
		return "", ErrExpired
	}
	if err != nil {
		return "", fmt.Errorf("consume relay_transfer: %w", err)
	}
	return bundle, nil
}
