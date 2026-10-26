package dm

import (
	"encoding/json"
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

func writeDMError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, ErrConversationNotFound):
		httputil.WriteError(w, http.StatusNotFound, "conversation_not_found")
	case errors.Is(err, ErrInvalidRecipient):
		httputil.WriteError(w, http.StatusBadRequest, "invalid_recipient")
	case errors.Is(err, ErrRecipientNotFound):
		httputil.WriteError(w, http.StatusNotFound, "recipient_not_found")
	case errors.Is(err, ErrForbidden):
		httputil.WriteError(w, http.StatusForbidden, "forbidden")
	case errors.Is(err, ErrMessageNotFound):
		httputil.WriteError(w, http.StatusNotFound, "message_not_found")
	case errors.Is(err, ErrInvalidAttachment):
		httputil.WriteError(w, http.StatusBadRequest, "invalid_attachment")
	case errors.Is(err, ErrBlocked):
		httputil.WriteError(w, http.StatusForbidden, "blocked")
	default:
		slog.Error("dm error", "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "internal_error")
	}
}

// POST /api/v1/dm/conversations
func (h *Handler) StartConversation(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, 4*1024)

	roles, err := h.roles(r)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "internal_error")
		return
	}
	if !policy.CanAny(roles, policy.CreateDirectMessages) {
		httputil.WriteError(w, http.StatusForbidden, "forbidden")
		return
	}

	var req struct {
		RecipientID string `json:"recipient_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid_json")
		return
	}
	req.RecipientID = strings.TrimSpace(req.RecipientID)
	if req.RecipientID == "" {
		httputil.WriteValidationError(w, "recipient_id")
		return
	}

	id := ctxkey.Get(r.Context())
	conv, created, err := h.svc.StartConversation(r.Context(), id.ServerID, id.ID, req.RecipientID)
	if err != nil {
		writeDMError(w, err)
		return
	}

	status := http.StatusOK
	if created {
		status = http.StatusCreated
	}
	httputil.WriteJSON(w, status, conv)
}

// GET /api/v1/dm/conversations
func (h *Handler) ListConversations(w http.ResponseWriter, r *http.Request) {
	roles, err := h.roles(r)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "internal_error")
		return
	}
	if !policy.CanAny(roles, policy.SendDirectMessages) {
		httputil.WriteError(w, http.StatusForbidden, "forbidden")
		return
	}

	id := ctxkey.Get(r.Context())
	list, err := h.svc.ListConversations(r.Context(), id.ServerID, id.ID)
	if err != nil {
		writeDMError(w, err)
		return
	}
	httputil.WriteJSON(w, http.StatusOK, map[string]any{"conversations": list})
}

// POST /api/v1/dm/conversations/{id}/messages
func (h *Handler) SendDM(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, 16*1024)

	roles, err := h.roles(r)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "internal_error")
		return
	}
	if !policy.CanAny(roles, policy.SendDirectMessages) {
		httputil.WriteError(w, http.StatusForbidden, "forbidden")
		return
	}

	var req struct {
		Content      string  `json:"content"`
		AttachmentID *string `json:"attachment_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid_json")
		return
	}
	req.Content = strings.TrimSpace(req.Content)
	if len(req.Content) < 1 || len(req.Content) > 4000 {
		httputil.WriteValidationError(w, "content")
		return
	}

	id := ctxkey.Get(r.Context())
	msg, err := h.svc.SendDM(r.Context(), id.ServerID, r.PathValue("id"), id.ID, req.Content, req.AttachmentID)
	if err != nil {
		writeDMError(w, err)
		return
	}
	httputil.WriteJSON(w, http.StatusCreated, msg)
}

// GET /api/v1/dm/conversations/{id}/messages
func (h *Handler) ListDMs(w http.ResponseWriter, r *http.Request) {
	roles, err := h.roles(r)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "internal_error")
		return
	}
	if !policy.CanAny(roles, policy.SendDirectMessages) {
		httputil.WriteError(w, http.StatusForbidden, "forbidden")
		return
	}

	var before *string
	if b := r.URL.Query().Get("before"); b != "" {
		before = &b
	}
	limit := 50
	if l := r.URL.Query().Get("limit"); l != "" {
		if n, err := strconv.Atoi(l); err == nil && n >= 1 && n <= 100 {
			limit = n
		}
	}

	id := ctxkey.Get(r.Context())
	result, err := h.svc.ListDMs(r.Context(), id.ServerID, r.PathValue("id"), id.ID, before, limit)
	if err != nil {
		writeDMError(w, err)
		return
	}
	httputil.WriteJSON(w, http.StatusOK, result)
}

// DELETE /api/v1/dm/conversations/{id}/messages/{msg_id}
func (h *Handler) DeleteDM(w http.ResponseWriter, r *http.Request) {
	roles, err := h.roles(r)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "internal_error")
		return
	}
	if !policy.CanAny(roles, policy.SendDirectMessages) {
		httputil.WriteError(w, http.StatusForbidden, "forbidden")
		return
	}

	id := ctxkey.Get(r.Context())
	if err := h.svc.DeleteDM(
		r.Context(), id.ServerID, r.PathValue("id"), r.PathValue("msg_id"), id.ID,
	); err != nil {
		writeDMError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
