package bootstrap

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"

	"openspace/server-api/internal/sessiontoken"
)

const bcryptCost = 12

var seedRoles = []string{"owner", "admin", "moderator", "member", "guest"}

type Service struct {
	db             *pgxpool.Pool
	sessionTTLDays int
}

func NewService(db *pgxpool.Pool, sessionTTLDays int) *Service {
	return &Service{db: db, sessionTTLDays: sessionTTLDays}
}

func (s *Service) IsBootstrapped(ctx context.Context) (bool, error) {
	var count int
	err := s.db.QueryRow(ctx, `SELECT COUNT(*) FROM servers`).Scan(&count)
	if err != nil {
		return false, err
	}
	return count > 0, nil
}

type BootstrapRequest struct {
	ServerName        string
	ServerDescription string
	ServerPublicURL   string
	ServerAvatarURL   string
	AdminUsername     string
	AdminEmail        string
	AdminPassword     string
}

type BootstrapResult struct {
	ServerID   string
	IdentityID string
	Token      string
}

func (s *Service) Bootstrap(ctx context.Context, req BootstrapRequest) (*BootstrapResult, error) {
	hash, err := bcrypt.GenerateFromPassword([]byte(req.AdminPassword), bcryptCost)
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

	var serverID string
	if err := tx.QueryRow(ctx,
		`INSERT INTO servers DEFAULT VALUES RETURNING id`,
	).Scan(&serverID); err != nil {
		return nil, fmt.Errorf("insert server: %w", err)
	}

	if _, err := tx.Exec(ctx,
		`INSERT INTO server_settings(server_id, name, description, public_url, avatar_url)
		 VALUES($1, $2, $3, $4, $5)`,
		serverID, req.ServerName, optionalString(req.ServerDescription), optionalString(req.ServerPublicURL), optionalString(req.ServerAvatarURL),
	); err != nil {
		return nil, fmt.Errorf("insert server_settings: %w", err)
	}

	roleIDs := make(map[string]string, len(seedRoles))
	for _, name := range seedRoles {
		var roleID string
		if err := tx.QueryRow(ctx,
			`INSERT INTO roles(server_id, name, is_system_role) VALUES($1, $2, true) RETURNING id`,
			serverID, name,
		).Scan(&roleID); err != nil {
			return nil, fmt.Errorf("insert role %s: %w", name, err)
		}
		roleIDs[name] = roleID
	}

	var identityID string
	var emailArg *string
	if req.AdminEmail != "" {
		emailArg = &req.AdminEmail
	}
	if err := tx.QueryRow(ctx,
		`INSERT INTO server_identities(server_id, username, email, password_hash, display_name)
		 VALUES($1, $2, $3, $4, $5) RETURNING id`,
		serverID, req.AdminUsername, emailArg, string(hash), req.AdminUsername,
	).Scan(&identityID); err != nil {
		return nil, fmt.Errorf("insert identity: %w", err)
	}

	if _, err := tx.Exec(ctx,
		`INSERT INTO role_assignments(server_id, identity_id, role_id) VALUES($1, $2, $3)`,
		serverID, identityID, roleIDs["owner"],
	); err != nil {
		return nil, fmt.Errorf("insert role_assignment: %w", err)
	}

	if err := createDefaultConversationStructure(ctx, tx, serverID); err != nil {
		return nil, err
	}

	expiresAt := time.Now().UTC().AddDate(0, 0, s.sessionTTLDays)
	if _, err := tx.Exec(ctx,
		`INSERT INTO sessions(server_id, identity_id, token_hash, expires_at) VALUES($1, $2, $3, $4)`,
		serverID, identityID, sessiontoken.Digest(token), expiresAt,
	); err != nil {
		return nil, fmt.Errorf("insert session: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("commit: %w", err)
	}

	return &BootstrapResult{
		ServerID:   serverID,
		IdentityID: identityID,
		Token:      token,
	}, nil
}

type txExecutor interface {
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
	Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error)
}

func createDefaultConversationStructure(ctx context.Context, tx txExecutor, serverID string) error {
	defaults := []struct {
		channelName string
		roomType    string
		position    int
	}{
		{channelName: "Text", roomType: "text", position: 0},
		{channelName: "Audio", roomType: "voice", position: 1},
	}

	for _, item := range defaults {
		var groupID string
		if err := tx.QueryRow(ctx,
			`INSERT INTO rooms(server_id, name, description, position, room_type)
			 VALUES($1, $2, NULL, $3, $4)
			 RETURNING id`,
			serverID, item.channelName, item.position, item.roomType,
		).Scan(&groupID); err != nil {
			return fmt.Errorf("insert default channel group %s: %w", item.channelName, err)
		}
		if _, err := tx.Exec(ctx,
			`INSERT INTO channels(server_id, room_id, name, type, position)
			 VALUES($1, $2, 'general', $3, 0)`,
			serverID, groupID, item.roomType,
		); err != nil {
			return fmt.Errorf("insert default room for %s: %w", item.channelName, err)
		}
	}
	return nil
}

func optionalString(value string) *string {
	if value == "" {
		return nil
	}
	return &value
}
