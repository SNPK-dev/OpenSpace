package device

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// pgx import used for ErrNoRows check.

var (
	ErrDeviceNotFound = errors.New("device_not_found")
	ErrForbidden      = errors.New("forbidden")
)

type Service struct {
	db *pgxpool.Pool
}

func NewService(db *pgxpool.Pool) *Service {
	return &Service{db: db}
}

type PairingTokenResult struct {
	PairingToken string
	ExpiresAt    time.Time
}

func (s *Service) CreatePairingToken(ctx context.Context, identityID string, ttlSeconds int) (*PairingTokenResult, error) {
	if ttlSeconds <= 0 || ttlSeconds > 7200 {
		ttlSeconds = 1800
	}

	// Find the caller's active device credential
	var deviceID string
	err := s.db.QueryRow(ctx,
		`SELECT id FROM device_credentials
		 WHERE server_identity_id = $1 AND device_status = 'active'
		 ORDER BY created_at DESC LIMIT 1`,
		identityID,
	).Scan(&deviceID)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, fmt.Errorf("no active device credential for identity")
	}
	if err != nil {
		return nil, fmt.Errorf("find device: %w", err)
	}

	// Fix 7: token_id.token_secret format — lookup is O(1) by token_id, secret is hashed
	tokenID, err := randomHex(16)
	if err != nil {
		return nil, fmt.Errorf("generate token_id: %w", err)
	}
	tokenSecret, err := randomHex(32)
	if err != nil {
		return nil, fmt.Errorf("generate token_secret: %w", err)
	}

	hash := sha256Hex(tokenSecret)
	expiresAt := time.Now().UTC().Add(time.Duration(ttlSeconds) * time.Second)

	_, err = s.db.Exec(ctx,
		`INSERT INTO pairing_tokens(token_id, token_hash, server_identity_id, created_by_device_id, expires_at)
		 VALUES($1, $2, $3, $4, $5)`,
		tokenID, hash, identityID, deviceID, expiresAt,
	)
	if err != nil {
		return nil, fmt.Errorf("insert pairing_token: %w", err)
	}

	return &PairingTokenResult{PairingToken: tokenID + "." + tokenSecret, ExpiresAt: expiresAt}, nil
}

func (s *Service) RevokeDevice(ctx context.Context, callerIdentityID, deviceID string) error {
	var ownerIdentityID string
	err := s.db.QueryRow(ctx,
		`SELECT server_identity_id FROM device_credentials WHERE id = $1`, deviceID,
	).Scan(&ownerIdentityID)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrDeviceNotFound
	}
	if err != nil {
		return fmt.Errorf("query device: %w", err)
	}

	if ownerIdentityID != callerIdentityID {
		var isAdmin bool
		_ = s.db.QueryRow(ctx,
			`SELECT EXISTS(
			   SELECT 1 FROM role_assignments ra
			   JOIN roles r ON r.id = ra.role_id
			   WHERE ra.identity_id = $1 AND r.name IN ('owner','admin')
			 )`, callerIdentityID,
		).Scan(&isAdmin)
		if !isAdmin {
			return ErrForbidden
		}
	}

	_, err = s.db.Exec(ctx,
		`UPDATE device_credentials SET device_status = 'revoked', revoked_at = NOW() WHERE id = $1`,
		deviceID,
	)
	return err
}

func randomHex(bytes int) (string, error) {
	b := make([]byte, bytes)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

func sha256Hex(s string) string {
	h := sha256.Sum256([]byte(s))
	return hex.EncodeToString(h[:])
}
