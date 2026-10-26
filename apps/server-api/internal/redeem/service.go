package redeem

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"

	"openspace/server-api/internal/cryptoutil"
	"openspace/server-api/internal/sessiontoken"
)

var (
	ErrTokenNotFound     = errors.New("token_not_found")
	ErrTokenExpired      = errors.New("token_expired")
	ErrTokenUsed         = errors.New("token_already_used")
	ErrInvalidSig        = errors.New("invalid_signature")
	ErrChallengeNotFound = errors.New("challenge_not_found")
	ErrChallengeExpired  = errors.New("challenge_expired")
)

type redeemChallenge struct {
	ChallengeID  string `json:"challenge_id"`
	TokenID      string `json:"token_id"`
	IdentityID   string `json:"identity_id"`
	ServerID     string `json:"server_id"`
	NewPublicKey string `json:"new_public_key"`
	Nonce        string `json:"nonce"`
	ClientType   string `json:"client_type"`
	CreatedAt    int64  `json:"created_at"`
}

type ChallengeResult struct {
	ChallengeID string
	ServerID    string
	Nonce       string
	ExpiresAt   time.Time
}

type CompleteResult struct {
	ServerIdentityID string
	DeviceID         string
	AccessToken      string
}

type Service struct {
	db  *pgxpool.Pool
	rdb *redis.Client
	ttl int
}

func NewService(db *pgxpool.Pool, rdb *redis.Client, sessionTTLDays int) *Service {
	return &Service{db: db, rdb: rdb, ttl: sessionTTLDays}
}

func (s *Service) Challenge(ctx context.Context, pairingToken, newPublicKey, clientType string) (*ChallengeResult, error) {
	// Fix 7: token format is "token_id.token_secret" for O(1) lookup
	parts := strings.SplitN(pairingToken, ".", 2)
	if len(parts) != 2 {
		return nil, ErrTokenNotFound
	}
	tokenID, tokenSecret := parts[0], parts[1]
	tokenSecretHash := sha256Hex(tokenSecret)

	var storedHash, tokenRowID, identityID string
	var expiresAt time.Time
	var usedCount, usageLimit int
	var status string

	err := s.db.QueryRow(ctx,
		`SELECT id, token_hash, server_identity_id, expires_at, used_count, usage_limit, status
		 FROM pairing_tokens WHERE token_id = $1`,
		tokenID,
	).Scan(&tokenRowID, &storedHash, &identityID, &expiresAt, &usedCount, &usageLimit, &status)

	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrTokenNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("query token: %w", err)
	}
	// Constant-time rejection: verify hash even on mismatch to avoid timing oracles
	if storedHash != tokenSecretHash {
		return nil, ErrTokenNotFound
	}
	if time.Now().UTC().After(expiresAt) {
		return nil, ErrTokenExpired
	}
	if status != "active" || usedCount >= usageLimit {
		return nil, ErrTokenUsed
	}

	var serverID string
	if err := s.db.QueryRow(ctx,
		`SELECT server_id FROM server_identities WHERE id = $1`, identityID,
	).Scan(&serverID); err != nil {
		return nil, fmt.Errorf("get server_id: %w", err)
	}

	nonce, err := randomHex(32)
	if err != nil {
		return nil, fmt.Errorf("generate nonce: %w", err)
	}
	challengeID, err := randomHex(16)
	if err != nil {
		return nil, fmt.Errorf("generate challenge_id: %w", err)
	}

	createdAt := time.Now().Unix()
	data := redeemChallenge{
		ChallengeID:  challengeID,
		TokenID:      tokenRowID,
		IdentityID:   identityID,
		ServerID:     serverID,
		NewPublicKey: newPublicKey,
		Nonce:        nonce,
		ClientType:   clientType,
		CreatedAt:    createdAt,
	}
	raw, _ := json.Marshal(data)

	if err := s.rdb.Set(ctx, "redeem_challenge:"+challengeID, string(raw), 5*time.Minute).Err(); err != nil {
		return nil, fmt.Errorf("cache challenge: %w", err)
	}

	return &ChallengeResult{
		ChallengeID: challengeID,
		ServerID:    serverID,
		Nonce:       nonce,
		ExpiresAt:   time.Unix(createdAt+300, 0).UTC(),
	}, nil
}

func (s *Service) Complete(ctx context.Context, challengeID, signature string) (*CompleteResult, error) {
	raw, err := s.rdb.Get(ctx, "redeem_challenge:"+challengeID).Bytes()
	if errors.Is(err, redis.Nil) {
		return nil, ErrChallengeNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("get challenge: %w", err)
	}

	var data redeemChallenge
	if err := json.Unmarshal(raw, &data); err != nil {
		return nil, ErrChallengeNotFound
	}
	if time.Now().Unix()-data.CreatedAt > 300 {
		s.rdb.Del(ctx, "redeem_challenge:"+challengeID) //nolint:errcheck
		return nil, ErrChallengeExpired
	}

	// Build the exact payload the client must have signed (prevents replay between ops)
	expiresAt := time.Unix(data.CreatedAt+300, 0).UTC().Format(time.RFC3339)
	payload := map[string]string{
		"op":                "device_pairing_redeem",
		"server_id":         data.ServerID,
		"challenge_id":      data.ChallengeID,
		"nonce":             data.Nonce,
		"device_public_key": data.NewPublicKey,
		"client_type":       data.ClientType,
		"expires_at":        expiresAt,
	}
	payloadJSON, _ := json.Marshal(payload)

	if err := cryptoutil.VerifyECDSA(data.NewPublicKey, string(payloadJSON), signature); err != nil {
		s.rdb.Del(ctx, "redeem_challenge:"+challengeID) //nolint:errcheck
		s.db.Exec(ctx,                                  //nolint:errcheck
			`UPDATE pairing_tokens SET status = 'suspicious' WHERE id = $1`, data.TokenID,
		)
		return nil, ErrInvalidSig
	}

	s.rdb.Del(ctx, "redeem_challenge:"+challengeID) //nolint:errcheck

	tx, err := s.db.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	res, err := tx.Exec(ctx,
		`UPDATE pairing_tokens SET used_count = used_count + 1, status = 'used'
		 WHERE id = $1 AND status = 'active' AND used_count < usage_limit`,
		data.TokenID,
	)
	if err != nil {
		return nil, fmt.Errorf("mark token used: %w", err)
	}
	if res.RowsAffected() == 0 {
		return nil, ErrTokenUsed
	}

	var deviceID string
	err = tx.QueryRow(ctx,
		`INSERT INTO device_credentials(server_identity_id, device_public_key, device_status, client_type)
		 VALUES($1, $2, 'active', $3) RETURNING id`,
		data.IdentityID, data.NewPublicKey, data.ClientType,
	).Scan(&deviceID)
	if err != nil {
		return nil, fmt.Errorf("insert device_credential: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("commit: %w", err)
	}

	token, err := sessiontoken.New()
	if err != nil {
		return nil, fmt.Errorf("generate token: %w", err)
	}
	sessionExpiry := time.Now().UTC().AddDate(0, 0, s.ttl)
	if _, err := s.db.Exec(ctx,
		`INSERT INTO sessions(server_id, identity_id, token_hash, expires_at) VALUES($1, $2, $3, $4)`,
		data.ServerID, data.IdentityID, sessiontoken.Digest(token), sessionExpiry,
	); err != nil {
		return nil, fmt.Errorf("insert session: %w", err)
	}

	return &CompleteResult{
		ServerIdentityID: data.IdentityID,
		DeviceID:         deviceID,
		AccessToken:      token,
	}, nil
}

func sha256Hex(s string) string {
	h := sha256.Sum256([]byte(s))
	return hex.EncodeToString(h[:])
}

func randomHex(bytes int) (string, error) {
	b := make([]byte, bytes)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}
