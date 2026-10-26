package invite

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

// POST /api/v1/invites
func (h *Handler) Create(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, 64*1024)

	id := ctxkey.Get(r.Context())
	roles, err := h.identitySvc.GetRoles(r.Context(), id.ID, id.ServerID)
	if err != nil {
		slog.Error("role check error", "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "internal_error")
		return
	}
	if !policy.CanAny(roles, policy.CreateInvite) {
		httputil.WriteError(w, http.StatusForbidden, "forbidden")
		return
	}

	var req struct {
		MaxUses        *int `json:"max_uses"`
		ExpiresInHours *int `json:"expires_in_hours"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid_json")
		return
	}

	maxUses := 1
	if req.MaxUses != nil && *req.MaxUses > 0 {
		maxUses = *req.MaxUses
	}

	inv, err := h.svc.Create(r.Context(), id.ID, maxUses, req.ExpiresInHours)
	if err != nil {
		slog.Error("create invite error", "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "internal_error")
		return
	}

	slog.Info("invite created", "identity_id", id.ID)
	h.alog.Log(id.ServerID, id.ID, "invite.create", "", "", nil)
	httputil.WriteJSON(w, http.StatusCreated, inv)
}

// GET /api/v1/invites
func (h *Handler) List(w http.ResponseWriter, r *http.Request) {
	id := ctxkey.Get(r.Context())
	roles, err := h.identitySvc.GetRoles(r.Context(), id.ID, id.ServerID)
	if err != nil {
		slog.Error("role check error", "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "internal_error")
		return
	}
	if !policy.CanAny(roles, policy.CreateInvite) {
		httputil.WriteError(w, http.StatusForbidden, "forbidden")
		return
	}

	invites, err := h.svc.List(r.Context())
	if err != nil {
		slog.Error("list invites error", "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "internal_error")
		return
	}

	httputil.WriteJSON(w, http.StatusOK, map[string]any{"invites": invites})
}

// DELETE /api/v1/invites/{code}
func (h *Handler) Revoke(w http.ResponseWriter, r *http.Request) {
	id := ctxkey.Get(r.Context())
	roles, err := h.identitySvc.GetRoles(r.Context(), id.ID, id.ServerID)
	if err != nil {
		slog.Error("role check error", "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "internal_error")
		return
	}
	if !policy.CanAny(roles, policy.CreateInvite) {
		httputil.WriteError(w, http.StatusForbidden, "forbidden")
		return
	}

	code := r.PathValue("code")
	if code == "" {
		httputil.WriteError(w, http.StatusBadRequest, "missing_code")
		return
	}

	if err := h.svc.Revoke(r.Context(), code); err != nil {
		if errors.Is(err, ErrNotFound) {
			httputil.WriteError(w, http.StatusNotFound, "invite_not_found")
			return
		}
		slog.Error("revoke invite error", "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "internal_error")
		return
	}

	h.alog.Log(id.ServerID, id.ID, "invite.revoke", "", "", nil)
	w.WriteHeader(http.StatusNoContent)
}
