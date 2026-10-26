package admin

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"

	"openspace/server-api/internal/audit"
	"openspace/server-api/internal/ctxkey"
	"openspace/server-api/internal/httputil"
	"openspace/server-api/internal/identity"
	"openspace/server-api/internal/policy"
)

type Handler struct {
	svc         *Service
	identitySvc *identity.Service
	alog        *audit.Logger
}

func NewHandler(svc *Service, identitySvc *identity.Service, alog *audit.Logger) *Handler {
	return &Handler{svc: svc, identitySvc: identitySvc, alog: alog}
}

func (h *Handler) requireAdmin(r *http.Request) (callerID string, callerRoles []string, serverID string, ok bool) {
	id := ctxkey.Get(r.Context())
	roles, err := h.identitySvc.GetRoles(r.Context(), id.ID, id.ServerID)
	if err != nil {
		return "", nil, "", false
	}
	if !policy.CanAny(roles, policy.ManageIdentities) {
		return "", nil, "", false
	}
	return id.ID, roles, id.ServerID, true
}

func (h *Handler) requireManageServer(r *http.Request) (callerID string, serverID string, ok bool) {
	id := ctxkey.Get(r.Context())
	roles, err := h.identitySvc.GetRoles(r.Context(), id.ID, id.ServerID)
	if err != nil {
		return "", "", false
	}
	if !policy.CanAny(roles, policy.ManageServer) {
		return "", "", false
	}
	return id.ID, id.ServerID, true
}

func (h *Handler) requireOwner(r *http.Request) (string, string, bool) {
	id := ctxkey.Get(r.Context())
	roles, err := h.identitySvc.GetRoles(r.Context(), id.ID, id.ServerID)
	if err != nil || !policy.CanAny(roles, policy.DeleteServer) {
		return "", "", false
	}
	return id.ID, id.ServerID, true
}

func (h *Handler) GetMaintenance(w http.ResponseWriter, r *http.Request) {
	if _, _, ok := h.requireManageServer(r); !ok {
		httputil.WriteError(w, http.StatusForbidden, "forbidden")
		return
	}
	runs, err := h.svc.ListMaintenanceRuns(r.Context())
	if err != nil {
		h.writeServiceError(w, err)
		return
	}
	policyValue, err := h.svc.GetMaintenancePolicy(r.Context())
	if err != nil {
		h.writeServiceError(w, err)
		return
	}
	httputil.WriteJSON(w, http.StatusOK, map[string]any{"policy": policyValue, "runs": runs})
}
func (h *Handler) UpdateMaintenancePolicy(w http.ResponseWriter, r *http.Request) {
	callerID, serverID, ok := h.requireOwner(r)
	if !ok {
		httputil.WriteError(w, http.StatusForbidden, "forbidden")
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 16*1024)
	var req struct {
		MessageRetentionDays, AuditRetentionDays, PushTokenRetentionDays *int `json:"-"`
		OrphanGraceHours                                                 int  `json:"orphan_grace_hours"`
	}
	var raw map[string]json.RawMessage
	if json.NewDecoder(r.Body).Decode(&raw) != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid_json")
		return
	}
	decode := func(key string, dst **int) {
		if value, exists := raw[key]; exists && string(value) != "null" {
			var n int
			if json.Unmarshal(value, &n) == nil {
				*dst = &n
			}
		}
	}
	decode("message_retention_days", &req.MessageRetentionDays)
	decode("audit_retention_days", &req.AuditRetentionDays)
	decode("push_token_retention_days", &req.PushTokenRetentionDays)
	json.Unmarshal(raw["orphan_grace_hours"], &req.OrphanGraceHours)
	updated, err := h.svc.UpdateMaintenancePolicy(r.Context(), callerID, MaintenancePolicy{MessageRetentionDays: req.MessageRetentionDays, AuditRetentionDays: req.AuditRetentionDays, PushTokenRetentionDays: req.PushTokenRetentionDays, OrphanGraceHours: req.OrphanGraceHours})
	if err != nil {
		h.writeServiceError(w, err)
		return
	}
	h.alog.Log(serverID, callerID, "maintenance.policy.update", serverID, "server", map[string]any{"content_retention_enabled": req.MessageRetentionDays != nil, "audit_retention_enabled": req.AuditRetentionDays != nil})
	httputil.WriteJSON(w, http.StatusOK, updated)
}

// GET /api/v1/admin/identities
func (h *Handler) ListIdentities(w http.ResponseWriter, r *http.Request) {
	callerID, callerRoles, serverID, ok := h.requireAdmin(r)
	_ = callerID
	_ = callerRoles
	if !ok {
		httputil.WriteError(w, http.StatusForbidden, "forbidden")
		return
	}

	list, err := h.svc.ListIdentities(r.Context(), serverID)
	if err != nil {
		slog.Error("list identities error", "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "internal_error")
		return
	}
	httputil.WriteJSON(w, http.StatusOK, list)
}

// GET /api/v1/admin/server-settings
func (h *Handler) GetServerSettings(w http.ResponseWriter, r *http.Request) {
	_, serverID, ok := h.requireManageServer(r)
	if !ok {
		httputil.WriteError(w, http.StatusForbidden, "forbidden")
		return
	}

	settings, err := h.svc.GetServerSettings(r.Context(), serverID)
	if err != nil {
		slog.Error("get server settings error", "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "internal_error")
		return
	}
	httputil.WriteJSON(w, http.StatusOK, settings)
}

// PATCH /api/v1/admin/server-settings
func (h *Handler) UpdateServerSettings(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, 1024*1024)

	callerID, serverID, ok := h.requireManageServer(r)
	if !ok {
		httputil.WriteError(w, http.StatusForbidden, "forbidden")
		return
	}

	var req struct {
		Name        string `json:"name"`
		Description string `json:"description"`
		PublicURL   string `json:"public_url"`
		AvatarURL   string `json:"avatar_url"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid_json")
		return
	}

	settings, err := h.svc.UpdateServerSettings(r.Context(), serverID, UpdateServerSettingsRequest{
		Name:        req.Name,
		Description: req.Description,
		PublicURL:   req.PublicURL,
		AvatarURL:   req.AvatarURL,
	})
	if err != nil {
		h.writeServiceError(w, err)
		return
	}

	h.alog.Log(serverID, callerID, "server.settings.update", serverID, "server", nil)
	httputil.WriteJSON(w, http.StatusOK, settings)
}

// GET /api/v1/admin/permission-settings
func (h *Handler) GetPermissionSettings(w http.ResponseWriter, r *http.Request) {
	_, _, ok := h.requireManageServer(r)
	if !ok {
		httputil.WriteError(w, http.StatusForbidden, "forbidden")
		return
	}

	settings, err := h.svc.GetPermissionSettings(r.Context())
	if err != nil {
		slog.Error("get permission settings error", "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "internal_error")
		return
	}
	httputil.WriteJSON(w, http.StatusOK, settings)
}

// PATCH /api/v1/admin/permission-settings
func (h *Handler) UpdatePermissionSettings(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, 128*1024)

	callerID, serverID, ok := h.requireManageServer(r)
	if !ok {
		httputil.WriteError(w, http.StatusForbidden, "forbidden")
		return
	}

	var req struct {
		Settings map[string][]string `json:"settings"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid_json")
		return
	}
	if req.Settings == nil {
		httputil.WriteValidationError(w, "settings")
		return
	}

	settings, err := h.svc.UpdatePermissionSettings(r.Context(), UpdatePermissionSettingsRequest{Settings: req.Settings})
	if err != nil {
		h.writeServiceError(w, err)
		return
	}

	h.alog.Log(serverID, callerID, "permission.settings.update", serverID, "server", nil)
	httputil.WriteJSON(w, http.StatusOK, settings)
}

// POST /api/v1/admin/identities/{id}/roles
func (h *Handler) AssignRole(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, 4*1024)

	callerID, callerRoles, serverID, ok := h.requireAdmin(r)
	if !ok {
		httputil.WriteError(w, http.StatusForbidden, "forbidden")
		return
	}

	targetID := r.PathValue("id")

	var req struct {
		Role string `json:"role"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid_json")
		return
	}

	if err := h.svc.AssignRole(r.Context(), serverID, callerID, callerRoles, targetID, req.Role); err != nil {
		h.writeServiceError(w, err)
		return
	}
	h.alog.Log(serverID, callerID, "role.assign", targetID, "identity", map[string]any{"role": req.Role})
	w.WriteHeader(http.StatusNoContent)
}

// DELETE /api/v1/admin/identities/{id}/roles/{role}
func (h *Handler) RevokeRole(w http.ResponseWriter, r *http.Request) {
	callerID, callerRoles, serverID, ok := h.requireAdmin(r)
	if !ok {
		httputil.WriteError(w, http.StatusForbidden, "forbidden")
		return
	}

	targetID := r.PathValue("id")
	role := r.PathValue("role")

	if err := h.svc.RevokeRole(r.Context(), serverID, callerID, callerRoles, targetID, role); err != nil {
		h.writeServiceError(w, err)
		return
	}
	h.alog.Log(serverID, callerID, "role.revoke", targetID, "identity", map[string]any{"role": role})
	w.WriteHeader(http.StatusNoContent)
}

// POST /api/v1/admin/identities/{id}/disable
func (h *Handler) DisableIdentity(w http.ResponseWriter, r *http.Request) {
	callerID, callerRoles, serverID, ok := h.requireAdmin(r)
	if !ok {
		httputil.WriteError(w, http.StatusForbidden, "forbidden")
		return
	}

	targetID := r.PathValue("id")

	if err := h.svc.DisableIdentity(r.Context(), serverID, callerID, callerRoles, targetID); err != nil {
		h.writeServiceError(w, err)
		return
	}
	h.alog.Log(serverID, callerID, "identity.disable", targetID, "identity", nil)
	w.WriteHeader(http.StatusNoContent)
}

// POST /api/v1/admin/identities/{id}/enable
func (h *Handler) EnableIdentity(w http.ResponseWriter, r *http.Request) {
	callerID, callerRoles, serverID, ok := h.requireAdmin(r)
	if !ok {
		httputil.WriteError(w, http.StatusForbidden, "forbidden")
		return
	}

	targetID := r.PathValue("id")

	if err := h.svc.EnableIdentity(r.Context(), serverID, callerID, callerRoles, targetID); err != nil {
		h.writeServiceError(w, err)
		return
	}
	h.alog.Log(serverID, callerID, "identity.enable", targetID, "identity", nil)
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) writeServiceError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, ErrForbidden):
		httputil.WriteError(w, http.StatusForbidden, "forbidden")
	case errors.Is(err, ErrInvalidRole):
		httputil.WriteError(w, http.StatusBadRequest, "invalid_role")
	case errors.Is(err, ErrInvalidSettings):
		httputil.WriteError(w, http.StatusBadRequest, "invalid_settings")
	case errors.Is(err, ErrIdentityNotFound):
		httputil.WriteError(w, http.StatusNotFound, "identity_not_found")
	default:
		slog.Error("admin error", "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "internal_error")
	}
}
