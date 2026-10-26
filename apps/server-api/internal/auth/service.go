package auth

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"

	"openspace/server-api/internal/sessiontoken"
)

// dummyHash equalizes login timing for unknown usernames.
var dummyHash, _ = bcrypt.GenerateFromPassword([]byte("dummy-timing-placeholder"), 12)

var (
	ErrInvalidCredentials = errors.New("invalid_credentials")
	ErrAccountDisabled    = errors.New("account_disabled")
	ErrInviteNotFound     = errors.New("invite_not_found")
	ErrInviteExpired      = errors.New("invite_expired")
	ErrInviteExhausted    = errors.New("invite_exhausted")
	ErrUsernameTaken      = errors.New("username_taken")
	ErrNotBootstrapped    = errors.New("server not bootstrapped")
	ErrSessionNotFound    = errors.New("session_not_found")
)

type Service struct {
	db             *pgxpool.Pool
	sessionTTLDays int
}

func NewService(db *pgxpool.Pool, sessionTTLDays int) *Service {
	return &Service{db: db, sessionTTLDays: sessionTTLDays}
}

func (s *Service) serverID(ctx context.Context) (string, error) {
	var id string
	err := s.db.QueryRow(ctx, `SELECT id FROM servers LIMIT 1`).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", ErrNotBootstrapped
	}
	return id, err
}

func (s *Service) ServerID(ctx context.Context) (string, error) { return s.serverID(ctx) }

type LoginResult struct {
	Token      string
	IdentityID string
}

func (s *Service) Login(ctx context.Context, username, password string) (*LoginResult, error) {
	sid, err := s.serverID(ctx)
	if err != nil {
		return nil, err
	}

	var id, authMethod string
	var hash *string
	var disabled bool

	err = s.db.QueryRow(ctx,
		`SELECT id, password_hash, auth_method, is_disabled
		 FROM server_identities WHERE server_id = $1 AND username = $2`,
		sid, username,
	).Scan(&id, &hash, &authMethod, &disabled)

	if errors.Is(err, pgx.ErrNoRows) {
		bcrypt.CompareHashAndPassword(dummyHash, []byte(password)) //nolint:errcheck
		return nil, ErrInvalidCredentials
	}
	if err != nil {
		return nil, fmt.Errorf("query identity: %w", err)
	}

	// Device-credential identities have no password — reject immediately with constant-time guard
	if authMethod != "legacy_password" || hash == nil {
		bcrypt.CompareHashAndPassword(dummyHash, []byte(password)) //nolint:errcheck
		return nil, ErrInvalidCredentials
	}

	if err := bcrypt.CompareHashAndPassword([]byte(*hash), []byte(password)); err != nil {
		return nil, ErrInvalidCredentials
	}
	if disabled {
		return nil, ErrAccountDisabled
	}

	token, err := sessiontoken.New()
	if err != nil {
		return nil, fmt.Errorf("generate token: %w", err)
	}

	expiresAt := time.Now().UTC().AddDate(0, 0, s.sessionTTLDays)
	if _, err := s.db.Exec(ctx,
		`INSERT INTO sessions(server_id, identity_id, token_hash, expires_at) VALUES($1, $2, $3, $4)`,
		sid, id, sessiontoken.Digest(token), expiresAt,
	); err != nil {
		return nil, fmt.Errorf("insert session: %w", err)
	}

	return &LoginResult{Token: token, IdentityID: id}, nil
}

func (s *Service) Logout(ctx context.Context, token string) error {
	_, err := s.db.Exec(ctx, `DELETE FROM sessions WHERE token_hash = $1`, sessiontoken.Digest(token))
	return err
}

type Session struct {
	ID        string    `json:"id"`
	CreatedAt time.Time `json:"created_at"`
	ExpiresAt time.Time `json:"expires_at"`
	Current   bool      `json:"current"`
}

func (s *Service) ListSessions(ctx context.Context, identityID, currentSessionID string) ([]Session, error) {
	rows, err := s.db.Query(ctx, `SELECT id, created_at, expires_at FROM sessions WHERE identity_id=$1 AND expires_at > NOW() ORDER BY created_at DESC LIMIT 100`, identityID)
	if err != nil {
		return nil, fmt.Errorf("list sessions: %w", err)
	}
	defer rows.Close()
	result := make([]Session, 0)
	for rows.Next() {
		var item Session
		if err := rows.Scan(&item.ID, &item.CreatedAt, &item.ExpiresAt); err != nil {
			return nil, fmt.Errorf("scan session: %w", err)
		}
		item.Current = item.ID == currentSessionID
		result = append(result, item)
	}
	return result, rows.Err()
}

func (s *Service) RevokeSession(ctx context.Context, identityID, sessionID string) error {
	_, err := s.db.Exec(ctx, `DELETE FROM sessions WHERE id=$1 AND identity_id=$2`, sessionID, identityID)
	return err
}

func (s *Service) RotateSession(ctx context.Context, identityID, sessionID string) (string, error) {
	token, err := sessiontoken.New()
	if err != nil {
		return "", fmt.Errorf("generate session: %w", err)
	}
	result, err := s.db.Exec(ctx, `UPDATE sessions SET token_hash=$1 WHERE id=$2 AND identity_id=$3 AND expires_at > NOW()`, sessiontoken.Digest(token), sessionID, identityID)
	if err != nil {
		return "", fmt.Errorf("rotate session: %w", err)
	}
	if result.RowsAffected() != 1 {
		return "", ErrSessionNotFound
	}
	return token, nil
}

type RegisterResult struct {
	Token      string
	IdentityID string
}

func (s *Service) Register(ctx context.Context, inviteCode, username string, email *string, password string) (*RegisterResult, error) {
	sid, err := s.serverID(ctx)
	if err != nil {
		return nil, err
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(password), 12)
	if err != nil {
		return nil, fmt.Errorf("hash password: %w", err)
	}
	token, err := sessiontoken.New()
	if err != nil {
		return nil, fmt.Errorf("generate token: %w", err)
	}

	tx, err := s.db.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	var inviteID string
	var maxUses, useCount int
	var expiresAt *time.Time

	err = tx.QueryRow(ctx,
		`SELECT id, max_uses, use_count, expires_at
		 FROM invites WHERE code = $1 AND server_id = $2 FOR UPDATE`,
		inviteCode, sid,
	).Scan(&inviteID, &maxUses, &useCount, &expiresAt)

	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrInviteNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("query invite: %w", err)
	}
	if expiresAt != nil && time.Now().UTC().After(*expiresAt) {
		return nil, ErrInviteExpired
	}
	if useCount >= maxUses {
		return nil, ErrInviteExhausted
	}

	var memberRoleID string
	if err := tx.QueryRow(ctx,
		`SELECT id FROM roles WHERE server_id = $1 AND name = 'member'`, sid,
	).Scan(&memberRoleID); err != nil {
		return nil, fmt.Errorf("find member role: %w", err)
	}

	var identityID string
	err = tx.QueryRow(ctx,
		`INSERT INTO server_identities(server_id, username, email, password_hash, display_name)
		 VALUES($1, $2, $3, $4, $5) RETURNING id`,
		sid, username, email, string(hash), username,
	).Scan(&identityID)
	if err != nil {
		if isUniqueViolation(err) {
			return nil, ErrUsernameTaken
		}
		return nil, fmt.Errorf("insert identity: %w", err)
	}

	if _, err := tx.Exec(ctx,
		`INSERT INTO role_assignments(server_id, identity_id, role_id) VALUES($1, $2, $3)`,
		sid, identityID, memberRoleID,
	); err != nil {
		return nil, fmt.Errorf("insert role_assignment: %w", err)
	}

	if _, err := tx.Exec(ctx,
		`UPDATE invites SET use_count = use_count + 1 WHERE id = $1`, inviteID,
	); err != nil {
		return nil, fmt.Errorf("update invite: %w", err)
	}

	sessionExpiry := time.Now().UTC().AddDate(0, 0, s.sessionTTLDays)
	if _, err := tx.Exec(ctx,
		`INSERT INTO sessions(server_id, identity_id, token_hash, expires_at) VALUES($1, $2, $3, $4)`,
		sid, identityID, sessiontoken.Digest(token), sessionExpiry,
	); err != nil {
		return nil, fmt.Errorf("insert session: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("commit: %w", err)
	}

	return &RegisterResult{Token: token, IdentityID: identityID}, nil
}

func generateToken(bytes int) (string, error) {
	b := make([]byte, bytes)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

// GenerateInviteCode returns a 16-byte random hex string (128-bit entropy).
func GenerateInviteCode() (string, error) {
	return generateToken(16)
}

func isUniqueViolation(err error) bool {
	type pgErr interface{ SQLState() string }
	var pe pgErr
	if errors.As(err, &pe) {
		return pe.SQLState() == "23505"
	}
	return false
}
