package admin

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"openspace/server-api/internal/policy"
	"openspace/server-api/internal/serverprofile"
)

var (
	ErrForbidden        = errors.New("forbidden")
	ErrInvalidRole      = errors.New("invalid_role")
	ErrIdentityNotFound = errors.New("identity_not_found")
	ErrInvalidSettings  = errors.New("invalid_settings")
)

var systemRoles = map[string]bool{
	"owner": true, "admin": true, "moderator": true, "member": true, "guest": true,
}

type IdentitySummary struct {
	ID          string   `json:"id"`
	Username    string   `json:"username"`
	DisplayName string   `json:"display_name"`
	Email       *string  `json:"email"`
	IsDisabled  bool     `json:"is_disabled"`
	Roles       []string `json:"roles"`
}

type ServerSettings struct {
	ServerID    string    `json:"server_id"`
	Name        string    `json:"name"`
	Description *string   `json:"description"`
	PublicURL   *string   `json:"public_url"`
	AvatarURL   *string   `json:"avatar_url"`
	UpdatedAt   time.Time `json:"updated_at"`
}

type UpdateServerSettingsRequest struct {
	Name        string
	Description string
	PublicURL   string
	AvatarURL   string
}

type PermissionSetting struct {
	Key          string   `json:"key"`
	Label        string   `json:"label"`
	Description  string   `json:"description"`
	Roles        []string `json:"roles"`
	DefaultRoles []string `json:"default_roles"`
}

type PermissionSettingsResponse struct {
	SeedRoles []string            `json:"seed_roles"`
	Settings  []PermissionSetting `json:"settings"`
}

type UpdatePermissionSettingsRequest struct {
	Settings map[string][]string
}

type MaintenancePolicy struct {
	MessageRetentionDays, AuditRetentionDays, PushTokenRetentionDays *int      `json:"-"`
	OrphanGraceHours                                                 int       `json:"orphan_grace_hours"`
	UpdatedAt                                                        time.Time `json:"updated_at"`
}

func (p MaintenancePolicy) MarshalJSON() ([]byte, error) {
	return json.Marshal(map[string]any{"message_retention_days": p.MessageRetentionDays, "audit_retention_days": p.AuditRetentionDays, "push_token_retention_days": p.PushTokenRetentionDays, "orphan_grace_hours": p.OrphanGraceHours, "updated_at": p.UpdatedAt})
}

type MaintenanceRun struct {
	JobName, Status, ErrorCategory string
	StartedAt                      time.Time
	FinishedAt                     *time.Time
	Examined, Affected             int64
	Attempt                        int
}

type Service struct {
	db *pgxpool.Pool
}

func NewService(db *pgxpool.Pool) *Service {
	return &Service{db: db}
}

func validRetention(value *int, minimum int) bool { return value == nil || *value >= minimum }
func (s *Service) GetMaintenancePolicy(ctx context.Context) (*MaintenancePolicy, error) {
	var p MaintenancePolicy
	err := s.db.QueryRow(ctx, `SELECT message_retention_days,audit_retention_days,push_token_retention_days,orphan_grace_hours,updated_at FROM maintenance_policy WHERE singleton=TRUE`).Scan(&p.MessageRetentionDays, &p.AuditRetentionDays, &p.PushTokenRetentionDays, &p.OrphanGraceHours, &p.UpdatedAt)
	return &p, err
}
func (s *Service) UpdateMaintenancePolicy(ctx context.Context, callerID string, p MaintenancePolicy) (*MaintenancePolicy, error) {
	if !validRetention(p.MessageRetentionDays, 30) || !validRetention(p.AuditRetentionDays, 90) || !validRetention(p.PushTokenRetentionDays, 30) || p.OrphanGraceHours < 24 {
		return nil, ErrInvalidSettings
	}
	_, err := s.db.Exec(ctx, `UPDATE maintenance_policy SET message_retention_days=$1,audit_retention_days=$2,push_token_retention_days=$3,orphan_grace_hours=$4,updated_at=NOW(),updated_by=$5 WHERE singleton=TRUE`, p.MessageRetentionDays, p.AuditRetentionDays, p.PushTokenRetentionDays, p.OrphanGraceHours, callerID)
	if err != nil {
		return nil, err
	}
	return s.GetMaintenancePolicy(ctx)
}
func (s *Service) ListMaintenanceRuns(ctx context.Context) ([]MaintenanceRun, error) {
	rows, err := s.db.Query(ctx, `SELECT job_name,status,error_category,started_at,finished_at,examined,affected,attempt FROM maintenance_runs ORDER BY started_at DESC LIMIT 100`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []MaintenanceRun{}
	for rows.Next() {
		var r MaintenanceRun
		if err := rows.Scan(&r.JobName, &r.Status, &r.ErrorCategory, &r.StartedAt, &r.FinishedAt, &r.Examined, &r.Affected, &r.Attempt); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

func (s *Service) LoadPermissionOverrides(ctx context.Context) error {
	rows, err := s.db.Query(ctx, `SELECT action, roles FROM permission_settings`)
	if err != nil {
		return fmt.Errorf("query permission settings: %w", err)
	}
	defer rows.Close()

	settings := map[string][]string{}
	for rows.Next() {
		var action string
		var roles []string
		if err := rows.Scan(&action, &roles); err != nil {
			return err
		}
		settings[action] = roles
	}
	if err := rows.Err(); err != nil {
		return err
	}
	policy.ReplaceOverrides(settings)
	return nil
}

func (s *Service) GetPermissionSettings(ctx context.Context) (*PermissionSettingsResponse, error) {
	if err := s.LoadPermissionOverrides(ctx); err != nil {
		return nil, err
	}

	snapshot := policy.SnapshotSettings()
	defs := policy.Definitions()
	settings := make([]PermissionSetting, 0, len(defs))
	for _, def := range defs {
		settings = append(settings, PermissionSetting{
			Key:          def.Key,
			Label:        def.Label,
			Description:  def.Description,
			Roles:        snapshot[def.Key],
			DefaultRoles: append([]string{}, def.DefaultRoles...),
		})
	}
	return &PermissionSettingsResponse{
		SeedRoles: policy.SeedRoles(),
		Settings:  settings,
	}, nil
}

func (s *Service) UpdatePermissionSettings(ctx context.Context, req UpdatePermissionSettingsRequest) (*PermissionSettingsResponse, error) {
	for action, roles := range req.Settings {
		if !policy.IsKnownAction(action) {
			return nil, ErrInvalidSettings
		}
		seen := map[string]bool{}
		for _, role := range roles {
			if !policy.IsSeedRole(role) || seen[role] {
				return nil, ErrInvalidRole
			}
			seen[role] = true
		}
		if (action == "server.manage" || action == "server.delete") && !seen["owner"] {
			return nil, ErrInvalidSettings
		}
	}

	tx, err := s.db.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("begin permission settings: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	for action, roles := range req.Settings {
		if _, err := tx.Exec(ctx,
			`INSERT INTO permission_settings(action, roles)
			 VALUES($1, $2)
			 ON CONFLICT (action) DO UPDATE SET roles = EXCLUDED.roles, updated_at = NOW()`,
			action, roles,
		); err != nil {
			return nil, fmt.Errorf("upsert permission setting: %w", err)
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("commit permission settings: %w", err)
	}

	policy.ReplaceOverrides(req.Settings)
	return s.GetPermissionSettings(ctx)
}

func (s *Service) ListIdentities(ctx context.Context, serverID string) ([]IdentitySummary, error) {
	rows, err := s.db.Query(ctx,
		`SELECT id, username, COALESCE(display_name, username), email, is_disabled
		 FROM server_identities WHERE server_id = $1 ORDER BY username`,
		serverID,
	)
	if err != nil {
		return nil, fmt.Errorf("query identities: %w", err)
	}
	defer rows.Close()

	var list []IdentitySummary
	for rows.Next() {
		var item IdentitySummary
		if err := rows.Scan(&item.ID, &item.Username, &item.DisplayName, &item.Email, &item.IsDisabled); err != nil {
			return nil, err
		}
		item.Roles = []string{}
		list = append(list, item)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	for i := range list {
		roles, err := s.loadRoles(ctx, list[i].ID, serverID)
		if err != nil {
			return nil, err
		}
		list[i].Roles = roles
	}

	if list == nil {
		list = []IdentitySummary{}
	}
	return list, nil
}

func (s *Service) GetServerSettings(ctx context.Context, serverID string) (*ServerSettings, error) {
	var settings ServerSettings
	if err := s.db.QueryRow(ctx,
		`SELECT server_id, name, description, public_url, avatar_url, updated_at
		 FROM server_settings WHERE server_id = $1`,
		serverID,
	).Scan(&settings.ServerID, &settings.Name, &settings.Description, &settings.PublicURL, &settings.AvatarURL, &settings.UpdatedAt); err != nil {
		return nil, fmt.Errorf("query server settings: %w", err)
	}
	return &settings, nil
}

func (s *Service) UpdateServerSettings(ctx context.Context, serverID string, req UpdateServerSettingsRequest) (*ServerSettings, error) {
	if !serverprofile.ValidateName(req.Name) ||
		!serverprofile.ValidateDescription(req.Description) ||
		!serverprofile.ValidatePublicURL(req.PublicURL) ||
		!serverprofile.ValidateAvatarURL(req.AvatarURL) {
		return nil, ErrInvalidSettings
	}

	if _, err := s.db.Exec(ctx,
		`UPDATE server_settings
		 SET name = $2,
		     description = $3,
		     public_url = $4,
		     avatar_url = $5,
		     updated_at = NOW()
		 WHERE server_id = $1`,
		serverID,
		strings.TrimSpace(req.Name),
		serverprofile.OptionalString(req.Description),
		serverprofile.OptionalString(req.PublicURL),
		serverprofile.OptionalString(req.AvatarURL),
	); err != nil {
		return nil, fmt.Errorf("update server settings: %w", err)
	}

	return s.GetServerSettings(ctx, serverID)
}

func (s *Service) AssignRole(ctx context.Context, serverID, callerID string, callerRoles []string, targetID, role string) error {
	if !systemRoles[role] {
		return ErrInvalidRole
	}
	if role == "owner" && !policy.CanAny(callerRoles, policy.DeleteServer) {
		return ErrForbidden
	}

	if err := s.ensureIdentityExists(ctx, serverID, targetID); err != nil {
		return err
	}

	var roleID string
	if err := s.db.QueryRow(ctx,
		`SELECT id FROM roles WHERE server_id = $1 AND name = $2`, serverID, role,
	).Scan(&roleID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrInvalidRole
		}
		return fmt.Errorf("query role: %w", err)
	}

	if _, err := s.db.Exec(ctx,
		`INSERT INTO role_assignments(server_id, identity_id, role_id) VALUES($1, $2, $3)
		 ON CONFLICT DO NOTHING`,
		serverID, targetID, roleID,
	); err != nil {
		return fmt.Errorf("assign role: %w", err)
	}
	return nil
}

func (s *Service) RevokeRole(ctx context.Context, serverID, callerID string, callerRoles []string, targetID, role string) error {
	if role == "owner" {
		return ErrForbidden
	}
	if !systemRoles[role] {
		return ErrInvalidRole
	}

	if err := s.ensureIdentityExists(ctx, serverID, targetID); err != nil {
		return err
	}

	if _, err := s.db.Exec(ctx,
		`DELETE FROM role_assignments
		 WHERE identity_id = $1 AND server_id = $2
		   AND role_id = (SELECT id FROM roles WHERE server_id = $2 AND name = $3)`,
		targetID, serverID, role,
	); err != nil {
		return fmt.Errorf("revoke role: %w", err)
	}
	if err := s.ensureGuestRoleIfEmpty(ctx, serverID, targetID); err != nil {
		return err
	}
	return nil
}

func (s *Service) DisableIdentity(ctx context.Context, serverID, callerID string, callerRoles []string, targetID string) error {
	if callerID == targetID {
		return ErrForbidden
	}

	targetRoles, err := s.loadRoles(ctx, targetID, serverID)
	if err != nil {
		return err
	}
	if policy.CanAny(targetRoles, policy.DeleteServer) {
		return ErrForbidden
	}

	tag, err := s.db.Exec(ctx,
		`UPDATE server_identities SET is_disabled = true, updated_at = NOW()
		 WHERE id = $1 AND server_id = $2`,
		targetID, serverID,
	)
	if err != nil {
		return fmt.Errorf("disable identity: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrIdentityNotFound
	}

	if _, err := s.db.Exec(ctx,
		`DELETE FROM sessions WHERE identity_id = $1`, targetID,
	); err != nil {
		return fmt.Errorf("delete sessions: %w", err)
	}
	return nil
}

func (s *Service) EnableIdentity(ctx context.Context, serverID, callerID string, callerRoles []string, targetID string) error {
	tag, err := s.db.Exec(ctx,
		`UPDATE server_identities SET is_disabled = false, updated_at = NOW()
		 WHERE id = $1 AND server_id = $2`,
		targetID, serverID,
	)
	if err != nil {
		return fmt.Errorf("enable identity: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrIdentityNotFound
	}
	return nil
}

func (s *Service) loadRoles(ctx context.Context, identityID, serverID string) ([]string, error) {
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

func (s *Service) ensureGuestRoleIfEmpty(ctx context.Context, serverID, identityID string) error {
	var count int
	if err := s.db.QueryRow(ctx,
		`SELECT COUNT(*) FROM role_assignments WHERE identity_id = $1 AND server_id = $2`,
		identityID, serverID,
	).Scan(&count); err != nil {
		return fmt.Errorf("count identity roles: %w", err)
	}
	if count > 0 {
		return nil
	}

	if _, err := s.db.Exec(ctx,
		`INSERT INTO role_assignments(server_id, identity_id, role_id)
		 SELECT $1, $2, id FROM roles WHERE server_id = $1 AND name = 'guest'
		 ON CONFLICT DO NOTHING`,
		serverID, identityID,
	); err != nil {
		return fmt.Errorf("assign guest fallback: %w", err)
	}
	return nil
}

func (s *Service) ensureIdentityExists(ctx context.Context, serverID, identityID string) error {
	var count int
	if err := s.db.QueryRow(ctx,
		`SELECT COUNT(*) FROM server_identities WHERE id = $1 AND server_id = $2`,
		identityID, serverID,
	).Scan(&count); err != nil {
		return fmt.Errorf("check identity: %w", err)
	}
	if count == 0 {
		return ErrIdentityNotFound
	}
	return nil
}
