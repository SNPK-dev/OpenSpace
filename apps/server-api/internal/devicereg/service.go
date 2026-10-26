package devicereg

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"

	"openspace/server-api/internal/cryptoutil"
	"openspace/server-api/internal/sessiontoken"
)

var (
	ErrRegistrationClosed = errors.New("registration_closed")
	ErrInviteRequired     = errors.New("invite_required")
	ErrInvalidInvite      = errors.New("invalid_invite")
	ErrInvalidSignature   = errors.New("invalid_signature")
	ErrChallengeNotFound  = errors.New("challenge_not_found")
	ErrChallengeExpired   = errors.New("challenge_expired")
	ErrNotBootstrapped    = errors.New("server not bootstrapped")
)

type challengeData struct {
	ChallengeID string `json:"challenge_id"`
	ServerID    string `json:"server_id"`
	PublicKey   string `json:"public_key"`
	Nonce       string `json:"nonce"`
	DisplayName string `json:"display_name"`
	InviteCode  string `json:"invite_code,omitempty"`
	ClientType  string `json:"client_type"`
	CreatedAt   int64  `json:"created_at"`
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
	IdentityStatus   string
	AccessToken      *string
}

type Service struct {
	db  *pgxpool.Pool
	rdb *redis.Client
	ttl int
}

func NewService(db *pgxpool.Pool, rdb *redis.Client, sessionTTLDays int) *Service {
	return &Service{db: db, rdb: rdb, ttl: sessionTTLDays}
}

func (s *Service) serverID(ctx context.Context) (string, error) {
	var id string
	err := s.db.QueryRow(ctx, `SELECT id FROM servers LIMIT 1`).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", ErrNotBootstrapped
	}
	return id, err
}

func (s *Service) Challenge(ctx context.Context, publicKey, displayName, inviteCode, clientType string) (*ChallengeResult, error) {
	sid, err := s.serverID(ctx)
	if err != nil {
		return nil, err
	}

	var policy string
	_ = s.db.QueryRow(ctx,
		`SELECT registration_policy FROM server_settings WHERE server_id = $1`, sid,
	).Scan(&policy)
	if policy == "" {
		policy = "invite_code_only"
	}

	switch policy {
	case "closed":
		return nil, ErrRegistrationClosed
	case "invite_code_only":
		if inviteCode == "" {
			return nil, ErrInviteRequired
		}
		if err := s.validateInvite(ctx, sid, inviteCode); err != nil {
			return nil, err
		}
	case "approval_required", "open":
		// no pre-check needed
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
	data := challengeData{
		ChallengeID: challengeID,
		ServerID:    sid,
		PublicKey:   publicKey,
		Nonce:       nonce,
		DisplayName: displayName,
		InviteCode:  inviteCode,
		ClientType:  clientType,
		CreatedAt:   createdAt,
	}
	raw, _ := json.Marshal(data)

	key := "device_reg_challenge:" + challengeID
	if err := s.rdb.Set(ctx, key, string(raw), 5*time.Minute).Err(); err != nil {
		return nil, fmt.Errorf("cache challenge: %w", err)
	}

	return &ChallengeResult{
		ChallengeID: challengeID,
		ServerID:    sid,
		Nonce:       nonce,
		ExpiresAt:   time.Unix(createdAt+300, 0).UTC(),
	}, nil
}

func (s *Service) Complete(ctx context.Context, challengeID, signature string) (*CompleteResult, error) {
	key := "device_reg_challenge:" + challengeID
	raw, err := s.rdb.Get(ctx, key).Bytes()
	if errors.Is(err, redis.Nil) {
		return nil, ErrChallengeNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("get challenge: %w", err)
	}

	var data challengeData
	if err := json.Unmarshal(raw, &data); err != nil {
		return nil, ErrChallengeNotFound
	}

	if time.Now().Unix()-data.CreatedAt > 300 {
		s.rdb.Del(ctx, key) //nolint:errcheck
		return nil, ErrChallengeExpired
	}

	// Build the exact payload the client must have signed (prevents replay/substitution)
	expiresAt := time.Unix(data.CreatedAt+300, 0).UTC().Format(time.RFC3339)
	payload := map[string]string{
		"op":                "device_registration",
		"server_id":         data.ServerID,
		"challenge_id":      data.ChallengeID,
		"nonce":             data.Nonce,
		"device_public_key": data.PublicKey,
		"client_type":       data.ClientType,
		"expires_at":        expiresAt,
	}
	payloadJSON, _ := json.Marshal(payload)

	if err := cryptoutil.VerifyECDSA(data.PublicKey, string(payloadJSON), signature); err != nil {
		s.rdb.Del(ctx, key) //nolint:errcheck
		return nil, ErrInvalidSignature
	}

	s.rdb.Del(ctx, key) //nolint:errcheck

	sid := data.ServerID

	var policy string
	_ = s.db.QueryRow(ctx,
		`SELECT registration_policy FROM server_settings WHERE server_id = $1`, sid,
	).Scan(&policy)

	identityStatus := "active"
	deviceStatus := "active"
	if policy == "approval_required" {
		identityStatus = "pending"
		deviceStatus = "pending"
	}

	tx, err := s.db.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	usernameID, _ := randomHex(8)
	var identityID string
	err = tx.QueryRow(ctx,
		`INSERT INTO server_identities(server_id, username, display_name, identity_status, auth_method)
		 VALUES($1, $2, $3, $4, 'device_credential') RETURNING id`,
		sid, "dev_"+usernameID, data.DisplayName, identityStatus,
	).Scan(&identityID)
	if err != nil {
		return nil, fmt.Errorf("insert identity: %w", err)
	}

	var memberRoleID string
	if err := tx.QueryRow(ctx,
		`SELECT id FROM roles WHERE server_id = $1 AND name = 'member'`, sid,
	).Scan(&memberRoleID); err == nil {
		tx.Exec(ctx, //nolint:errcheck
			`INSERT INTO role_assignments(server_id, identity_id, role_id) VALUES($1, $2, $3)`,
			sid, identityID, memberRoleID,
		)
	}

	if data.InviteCode != "" {
		tx.Exec(ctx, //nolint:errcheck
			`UPDATE invites SET use_count = use_count + 1 WHERE code = $1 AND server_id = $2`,
			data.InviteCode, sid,
		)
	}

	var deviceID string
	err = tx.QueryRow(ctx,
		`INSERT INTO device_credentials(server_identity_id, device_public_key, device_status, client_type)
		 VALUES($1, $2, $3, $4) RETURNING id`,
		identityID, data.PublicKey, deviceStatus, data.ClientType,
	).Scan(&deviceID)
	if err != nil {
		return nil, fmt.Errorf("insert device_credential: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("commit: %w", err)
	}

	var accessToken *string
	if identityStatus == "active" {
		token, err := sessiontoken.New()
		if err == nil {
			expiresAt := time.Now().UTC().AddDate(0, 0, s.ttl)
			if _, err := s.db.Exec(ctx,
				`INSERT INTO sessions(server_id, identity_id, token_hash, expires_at) VALUES($1, $2, $3, $4)`,
				sid, identityID, sessiontoken.Digest(token), expiresAt,
			); err == nil {
				accessToken = &token
			}
		}
	}

	return &CompleteResult{
		ServerIdentityID: identityID,
		DeviceID:         deviceID,
		IdentityStatus:   identityStatus,
		AccessToken:      accessToken,
	}, nil
}

func (s *Service) validateInvite(ctx context.Context, serverID, code string) error {
	var maxUses, useCount int
	var expiresAt, revokedAt *time.Time
	err := s.db.QueryRow(ctx,
		`SELECT max_uses, use_count, expires_at, revoked_at FROM invites WHERE code = $1 AND server_id = $2`,
		code, serverID,
	).Scan(&maxUses, &useCount, &expiresAt, &revokedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrInvalidInvite
	}
	if err != nil {
		return fmt.Errorf("query invite: %w", err)
	}
	if revokedAt != nil {
		return ErrInvalidInvite
	}
	if expiresAt != nil && time.Now().UTC().After(*expiresAt) {
		return ErrInvalidInvite
	}
	if useCount >= maxUses {
		return ErrInvalidInvite
	}
	return nil
}

func randomHex(bytes int) (string, error) {
	b := make([]byte, bytes)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}
