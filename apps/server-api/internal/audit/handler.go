package audit

import (
	"log/slog"
	"net/http"
	"strconv"

	"openspace/server-api/internal/ctxkey"
	"openspace/server-api/internal/httputil"
	"openspace/server-api/internal/identity"
	"openspace/server-api/internal/policy"
)

type Handler struct {
	logger      *Logger
	identitySvc *identity.Service
}

func NewHandler(logger *Logger, identitySvc *identity.Service) *Handler {
	return &Handler{logger: logger, identitySvc: identitySvc}
}

func (h *Handler) requireAdmin(r *http.Request) bool {
	id := ctxkey.Get(r.Context())
	roles, err := h.identitySvc.GetRoles(r.Context(), id.ID, id.ServerID)
	if err != nil {
		return false
	}
	return policy.CanAny(roles, policy.ManageIdentities)
}

// GET /api/v1/admin/audit
func (h *Handler) List(w http.ResponseWriter, r *http.Request) {
	if !h.requireAdmin(r) {
		httputil.WriteError(w, http.StatusForbidden, "forbidden")
		return
	}

	id := ctxkey.Get(r.Context())

	limit := 50
	if v := r.URL.Query().Get("limit"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			limit = n
		}
	}

	var before *int64
	if v := r.URL.Query().Get("before"); v != "" {
		if n, err := strconv.ParseInt(v, 10, 64); err == nil {
			before = &n
		}
	}

	entries, err := h.logger.List(r.Context(), id.ServerID, limit, before)
	if err != nil {
		slog.Error("audit list error", "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "internal_error")
		return
	}
	httputil.WriteJSON(w, http.StatusOK, entries)
}
