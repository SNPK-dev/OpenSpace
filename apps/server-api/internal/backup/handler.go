package backup

import (
	"log/slog"
	"net/http"

	"openspace/server-api/internal/ctxkey"
	"openspace/server-api/internal/httputil"
	"openspace/server-api/internal/identity"
	"openspace/server-api/internal/policy"
)

type Handler struct {
	svc         *Service
	identitySvc *identity.Service
}

func NewHandler(svc *Service, identitySvc *identity.Service) *Handler {
	return &Handler{svc: svc, identitySvc: identitySvc}
}

func (h *Handler) requireAdmin(r *http.Request) bool {
	id := ctxkey.Get(r.Context())
	roles, err := h.identitySvc.GetRoles(r.Context(), id.ID, id.ServerID)
	if err != nil {
		return false
	}
	return policy.CanAny(roles, policy.ManageIdentities)
}

// GET /api/v1/admin/backup
func (h *Handler) ListBackups(w http.ResponseWriter, r *http.Request) {
	if !h.requireAdmin(r) {
		httputil.WriteError(w, http.StatusForbidden, "forbidden")
		return
	}

	entries, err := h.svc.ListBackups(r.Context())
	if err != nil {
		slog.Error("list backups error", "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "internal_error")
		return
	}
	httputil.WriteJSON(w, http.StatusOK, entries)
}

// GET /api/v1/admin/migrations
func (h *Handler) ListMigrations(w http.ResponseWriter, r *http.Request) {
	if !h.requireAdmin(r) {
		httputil.WriteError(w, http.StatusForbidden, "forbidden")
		return
	}

	entries, err := h.svc.ListMigrations(r.Context())
	if err != nil {
		slog.Error("list migrations error", "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "internal_error")
		return
	}
	httputil.WriteJSON(w, http.StatusOK, entries)
}
