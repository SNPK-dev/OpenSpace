package presencehandler

import (
	"log/slog"
	"net/http"

	"openspace/server-api/internal/ctxkey"
	"openspace/server-api/internal/httputil"
	"openspace/server-api/internal/presenceclient"
)

type Handler struct {
	client *presenceclient.Client
}

func NewHandler(c *presenceclient.Client) *Handler {
	return &Handler{client: c}
}

// GET /api/v1/presence
func (h *Handler) GetPresence(w http.ResponseWriter, r *http.Request) {
	id := ctxkey.Get(r.Context())
	online, err := h.client.Online(r.Context(), id.ServerID)
	if err != nil {
		slog.Error("presence read error", "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "internal_error")
		return
	}
	httputil.WriteJSON(w, http.StatusOK, map[string][]string{"online": online})
}
