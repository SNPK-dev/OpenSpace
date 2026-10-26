package identity

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"openspace/server-api/internal/serverprofile"
)

var (
	ErrMemberNotFound       = errors.New("member_not_found")
	ErrInvalidRelationship  = errors.New("invalid_relationship")
	ErrRelationshipNotFound = errors.New("relationship_not_found")
)

type PublicProfile struct {
	ID                    string   `json:"id"`
	Username              string   `json:"username"`
	DisplayName           string   `json:"display_name"`
	AvatarURL             *string  `json:"avatar_url"`
	Roles                 []string `json:"roles"`
	Relationship          string   `json:"relationship"`
	RelationshipDirection string   `json:"relationship_direction,omitempty"`
}

type Profile struct {
	ID          string   `json:"id"`
	Username    string   `json:"username"`
	DisplayName string   `json:"display_name"`
	Email       *string  `json:"email"`
	AvatarURL   *string  `json:"avatar_url"`
	Roles       []string `json:"roles"`
}

type Service struct {
	db *pgxpool.Pool
}

func NewService(db *pgxpool.Pool) *Service {
	return &Service{db: db}
}

func (s *Service) GetProfile(ctx context.Context, identityID, serverID string) (*Profile, error) {
	var p Profile
	if err := s.db.QueryRow(ctx,
		`SELECT id, username, COALESCE(display_name, username), email, avatar_url
		 FROM server_identities WHERE id = $1 AND server_id = $2`,
		identityID, serverID,
	).Scan(&p.ID, &p.Username, &p.DisplayName, &p.Email, &p.AvatarURL); err != nil {
		return nil, fmt.Errorf("query identity: %w", err)
	}

	roles, err := s.GetRoles(ctx, identityID, serverID)
	if err != nil {
		return nil, err
	}
	p.Roles = roles
	return &p, nil
}

func (s *Service) GetRoles(ctx context.Context, identityID, serverID string) ([]string, error) {
	rows, err := s.db.Query(ctx,
		`SELECT r.name FROM role_assignments ra
		 JOIN roles r ON r.id = ra.role_id
		 WHERE ra.identity_id = $1 AND ra.server_id = $2`,
		identityID, serverID,
	)
	if err != nil {
		return nil, fmt.Errorf("query roles: %w", err)
	}
	defer rows.Close()

	roles := []string{}
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			return nil, err
		}
		roles = append(roles, name)
	}
	return roles, rows.Err()
}

func (s *Service) UpdateDisplayName(ctx context.Context, identityID, serverID, displayName string) (*Profile, error) {
	if _, err := s.db.Exec(ctx,
		`UPDATE server_identities SET display_name = $1, updated_at = NOW()
		 WHERE id = $2 AND server_id = $3`,
		displayName, identityID, serverID,
	); err != nil {
		return nil, fmt.Errorf("update identity: %w", err)
	}
	return s.GetProfile(ctx, identityID, serverID)
}

func (s *Service) UpdateProfile(ctx context.Context, identityID, serverID, displayName, avatarURL string) (*Profile, error) {
	if _, err := s.db.Exec(ctx,
		`UPDATE server_identities
		 SET display_name = $1, avatar_url = $2, updated_at = NOW()
		 WHERE id = $3 AND server_id = $4`,
		displayName,
		serverprofile.OptionalString(avatarURL),
		identityID,
		serverID,
	); err != nil {
		return nil, fmt.Errorf("update identity profile: %w", err)
	}
	return s.GetProfile(ctx, identityID, serverID)
}

func (s *Service) SearchMembers(ctx context.Context, serverID, callerID, query string, limit int) ([]PublicProfile, error) {
	if limit < 1 || limit > 50 {
		limit = 25
	}
	query = strings.TrimSpace(query)
	rows, err := s.db.Query(ctx, `SELECT id FROM server_identities WHERE server_id=$1 AND is_disabled=FALSE AND id<>$2 AND ($3='' OR username ILIKE '%'||$3||'%' OR COALESCE(display_name,'') ILIKE '%'||$3||'%') ORDER BY COALESCE(display_name,username), username LIMIT $4`, serverID, callerID, query, limit)
	if err != nil {
		return nil, fmt.Errorf("search members: %w", err)
	}
	defer rows.Close()
	out := []PublicProfile{}
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		p, err := s.GetPublicProfile(ctx, serverID, callerID, id)
		if err != nil {
			return nil, err
		}
		out = append(out, *p)
	}
	return out, rows.Err()
}

func (s *Service) GetPublicProfile(ctx context.Context, serverID, callerID, targetID string) (*PublicProfile, error) {
	var p PublicProfile
	err := s.db.QueryRow(ctx, `SELECT id, username, COALESCE(display_name,username), avatar_url FROM server_identities WHERE server_id=$1 AND id=$2 AND is_disabled=FALSE`, serverID, targetID).Scan(&p.ID, &p.Username, &p.DisplayName, &p.AvatarURL)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrMemberNotFound
	}
	if err != nil {
		return nil, err
	}
	p.Roles, err = s.GetRoles(ctx, targetID, serverID)
	if err != nil {
		return nil, err
	}
	p.Relationship = "none"
	var requester string
	err = s.db.QueryRow(ctx, `SELECT requester_id, status FROM friendships WHERE server_id=$1 AND ((requester_id=$2 AND addressee_id=$3) OR (requester_id=$3 AND addressee_id=$2))`, serverID, callerID, targetID).Scan(&requester, &p.Relationship)
	if err == nil {
		if requester == callerID {
			p.RelationshipDirection = "outgoing"
		} else {
			p.RelationshipDirection = "incoming"
		}
	}
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return nil, err
	}
	return &p, nil
}

func (s *Service) SetRelationship(ctx context.Context, serverID, callerID, targetID, action string) error {
	if callerID == targetID {
		return ErrInvalidRelationship
	}
	var active bool
	if err := s.db.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM server_identities WHERE server_id=$1 AND id=$2 AND is_disabled=FALSE)`, serverID, targetID).Scan(&active); err != nil || !active {
		return ErrMemberNotFound
	}
	switch action {
	case "request":
		_, err := s.db.Exec(ctx, `INSERT INTO friendships(server_id,requester_id,addressee_id,status) VALUES($1,$2,$3,'pending') ON CONFLICT (server_id, LEAST(requester_id,addressee_id), GREATEST(requester_id,addressee_id)) DO NOTHING`, serverID, callerID, targetID)
		return err
	case "accept":
		result, err := s.db.Exec(ctx, `UPDATE friendships SET status='accepted',updated_at=NOW() WHERE server_id=$1 AND requester_id=$2 AND addressee_id=$3 AND status='pending'`, serverID, targetID, callerID)
		if err != nil {
			return err
		}
		if result.RowsAffected() == 0 {
			return ErrRelationshipNotFound
		}
		return nil
	case "decline":
		result, err := s.db.Exec(ctx, `DELETE FROM friendships WHERE server_id=$1 AND requester_id=$2 AND addressee_id=$3 AND status='pending'`, serverID, targetID, callerID)
		if err != nil {
			return err
		}
		if result.RowsAffected() == 0 {
			return ErrRelationshipNotFound
		}
		return nil
	case "cancel":
		result, err := s.db.Exec(ctx, `DELETE FROM friendships WHERE server_id=$1 AND requester_id=$2 AND addressee_id=$3 AND status='pending'`, serverID, callerID, targetID)
		if err != nil {
			return err
		}
		if result.RowsAffected() == 0 {
			return ErrRelationshipNotFound
		}
		return nil
	case "remove":
		result, err := s.db.Exec(ctx, `DELETE FROM friendships WHERE server_id=$1 AND ((requester_id=$2 AND addressee_id=$3) OR (requester_id=$3 AND addressee_id=$2)) AND status='accepted'`, serverID, callerID, targetID)
		if err != nil {
			return err
		}
		if result.RowsAffected() == 0 {
			return ErrRelationshipNotFound
		}
		return nil
	case "block":
		_, err := s.db.Exec(ctx, `INSERT INTO friendships(server_id,requester_id,addressee_id,status) VALUES($1,$2,$3,'blocked') ON CONFLICT (server_id, LEAST(requester_id,addressee_id), GREATEST(requester_id,addressee_id)) DO UPDATE SET requester_id=EXCLUDED.requester_id,addressee_id=EXCLUDED.addressee_id,status='blocked',updated_at=NOW()`, serverID, callerID, targetID)
		return err
	case "unblock":
		_, err := s.db.Exec(ctx, `DELETE FROM friendships WHERE server_id=$1 AND requester_id=$2 AND addressee_id=$3 AND status='blocked'`, serverID, callerID, targetID)
		return err
	default:
		return ErrInvalidRelationship
	}
}

func (s *Service) ListRelationships(ctx context.Context, serverID, callerID string) ([]PublicProfile, error) {
	rows, err := s.db.Query(ctx, `SELECT CASE WHEN requester_id=$2 THEN addressee_id ELSE requester_id END FROM friendships WHERE server_id=$1 AND (requester_id=$2 OR addressee_id=$2) AND status IN ('pending','accepted') ORDER BY updated_at DESC`, serverID, callerID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []PublicProfile{}
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		p, err := s.GetPublicProfile(ctx, serverID, callerID, id)
		if err != nil {
			return nil, err
		}
		out = append(out, *p)
	}
	return out, rows.Err()
}
