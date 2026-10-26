package wsticket

import (
	"log/slog"
	"net/http"

	"openspace/server-api/internal/ctxkey"
	"openspace/server-api/internal/httputil"
)

type Handler struct{ service *Service }

func NewHandler(service *Service) *Handler { return &Handler{service: service} }

func (h *Handler) Issue(w http.ResponseWriter, r *http.Request) {
	identity := ctxkey.Get(r.Context())
	if identity == nil {
		httputil.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	ticket, err := h.service.Issue(r.Context(), identity.ID, identity.ServerID)
	if err != nil {
		slog.Error("realtime ticket issue failed", "error", err)
		httputil.WriteError(w, http.StatusServiceUnavailable, "realtime_unavailable")
		return
	}
	httputil.WriteJSON(w, http.StatusOK, map[string]any{"ticket": ticket, "expires_in": int(TTL.Seconds())})
}
