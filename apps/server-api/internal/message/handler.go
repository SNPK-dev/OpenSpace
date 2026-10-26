package message

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

func writeMessageError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, ErrMessageNotFound):
		httputil.WriteError(w, http.StatusNotFound, "message_not_found")
	case errors.Is(err, ErrNotTextChannel):
		httputil.WriteError(w, http.StatusBadRequest, "not_a_text_channel")
	case errors.Is(err, ErrForbidden):
		httputil.WriteError(w, http.StatusForbidden, "forbidden")
	case errors.Is(err, ErrInvalidAttachment):
		httputil.WriteError(w, http.StatusBadRequest, "invalid_attachment")
	default:
		slog.Error("message error", "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "internal_error")
	}
}

// POST /api/v1/rooms/{room_id}/channels/{channel_id}/messages
func (h *Handler) Send(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, 16*1024)

	roles, err := h.roles(r)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "internal_error")
		return
	}
	if !policy.CanAny(roles, policy.SendMessages) {
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
	msg, err := h.svc.Send(r.Context(), id.ServerID, r.PathValue("channel_id"), id.ID, req.Content, req.AttachmentID)
	if err != nil {
		writeMessageError(w, err)
		return
	}
	httputil.WriteJSON(w, http.StatusCreated, msg)
}

// GET /api/v1/rooms/{room_id}/channels/{channel_id}/messages
func (h *Handler) List(w http.ResponseWriter, r *http.Request) {
	roles, err := h.roles(r)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "internal_error")
		return
	}
	if !policy.CanAny(roles, policy.ReadMessages) {
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
	result, err := h.svc.List(r.Context(), id.ServerID, r.PathValue("channel_id"), before, limit)
	if err != nil {
		writeMessageError(w, err)
		return
	}
	httputil.WriteJSON(w, http.StatusOK, result)
}

// DELETE /api/v1/rooms/{room_id}/channels/{channel_id}/messages/{id}
func (h *Handler) Delete(w http.ResponseWriter, r *http.Request) {
	roles, err := h.roles(r)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "internal_error")
		return
	}
	if !policy.CanAny(roles, policy.SendMessages) {
		httputil.WriteError(w, http.StatusForbidden, "forbidden")
		return
	}

	id := ctxkey.Get(r.Context())
	if err := h.svc.Delete(
		r.Context(), id.ServerID,
		r.PathValue("channel_id"), r.PathValue("id"),
		id.ID, roles,
	); err != nil {
		writeMessageError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
