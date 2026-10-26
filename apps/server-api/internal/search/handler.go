package search

import (
	"errors"
	"log/slog"
	"net/http"
	"strconv"
	"strings"

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

func (h *Handler) roles(r *http.Request) ([]string, error) {
	id := ctxkey.Get(r.Context())
	return h.identitySvc.GetRoles(r.Context(), id.ID, id.ServerID)
}

func writeSearchError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, ErrInvalidQuery):
		httputil.WriteError(w, http.StatusBadRequest, "invalid_query")
	default:
		slog.Error("search error", "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "internal_error")
	}
}

func parseSearchParams(r *http.Request) (query string, before *string, limit int) {
	query = strings.TrimSpace(r.URL.Query().Get("q"))
	limit = 50
	if b := r.URL.Query().Get("before"); b != "" {
		before = &b
	}
	if l := r.URL.Query().Get("limit"); l != "" {
		if n, err := strconv.Atoi(l); err == nil && n >= 1 && n <= 100 {
			limit = n
		}
	}
	return
}

// GET /api/v1/search/messages?q=&channel_id=&before=&limit=
func (h *Handler) SearchMessages(w http.ResponseWriter, r *http.Request) {
	roles, err := h.roles(r)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "internal_error")
		return
	}
	if !policy.CanAny(roles, policy.ReadMessages) {
		httputil.WriteError(w, http.StatusForbidden, "forbidden")
		return
	}

	query, before, limit := parseSearchParams(r)

	var channelID *string
	if ch := r.URL.Query().Get("channel_id"); ch != "" {
		channelID = &ch
	}

	id := ctxkey.Get(r.Context())
	result, err := h.svc.SearchMessages(r.Context(), id.ServerID, query, channelID, before, limit)
	if err != nil {
		writeSearchError(w, err)
		return
	}
	httputil.WriteJSON(w, http.StatusOK, result)
}

// GET /api/v1/search/dm?q=&conversation_id=&before=&limit=
func (h *Handler) SearchDMs(w http.ResponseWriter, r *http.Request) {
	roles, err := h.roles(r)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "internal_error")
		return
	}
	if !policy.CanAny(roles, policy.SendDirectMessages) {
		httputil.WriteError(w, http.StatusForbidden, "forbidden")
		return
	}

	query, before, limit := parseSearchParams(r)

	var conversationID *string
	if conv := r.URL.Query().Get("conversation_id"); conv != "" {
		conversationID = &conv
	}

	id := ctxkey.Get(r.Context())
	result, err := h.svc.SearchDMs(r.Context(), id.ServerID, id.ID, query, conversationID, before, limit)
	if err != nil {
		writeSearchError(w, err)
		return
	}
	httputil.WriteJSON(w, http.StatusOK, result)
}
