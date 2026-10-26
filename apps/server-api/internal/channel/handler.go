package channel

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strings"

	"openspace/server-api/internal/ctxkey"
	"openspace/server-api/internal/httputil"
	"openspace/server-api/internal/identity"
	"openspace/server-api/internal/policy"
	"openspace/server-api/internal/room"
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

func writeChannelError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, ErrChannelNotFound):
		httputil.WriteError(w, http.StatusNotFound, "channel_not_found")
	case errors.Is(err, ErrInvalidChannelType):
		httputil.WriteError(w, http.StatusBadRequest, "invalid_channel_type")
	case errors.Is(err, ErrInvalidOrder):
		httputil.WriteError(w, http.StatusBadRequest, "invalid_order")
	case errors.Is(err, room.ErrRoomNotFound):
		httputil.WriteError(w, http.StatusNotFound, "room_not_found")
	default:
		slog.Error("channel error", "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "internal_error")
	}
}

// POST /api/v1/rooms/{room_id}/channels
func (h *Handler) Create(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, 64*1024)

	roles, err := h.roles(r)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "internal_error")
		return
	}
	if !policy.CanAny(roles, policy.ManageChannels) {
		httputil.WriteError(w, http.StatusForbidden, "forbidden")
		return
	}

	var req struct {
		Name string `json:"name"`
		Type string `json:"type"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid_json")
		return
	}
	req.Name = strings.TrimSpace(req.Name)
	if len(req.Name) < 1 || len(req.Name) > 100 {
		httputil.WriteValidationError(w, "name")
		return
	}

	id := ctxkey.Get(r.Context())
	ch, err := h.svc.Create(r.Context(), id.ServerID, r.PathValue("room_id"), req.Name, req.Type)
	if err != nil {
		writeChannelError(w, err)
		return
	}
	httputil.WriteJSON(w, http.StatusCreated, ch)
}

// GET /api/v1/rooms/{room_id}/channels
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

	id := ctxkey.Get(r.Context())
	list, err := h.svc.List(r.Context(), id.ServerID, r.PathValue("room_id"))
	if err != nil {
		writeChannelError(w, err)
		return
	}
	httputil.WriteJSON(w, http.StatusOK, map[string]any{"channels": list})
}

// GET /api/v1/rooms/{room_id}/channels/{id}
func (h *Handler) Get(w http.ResponseWriter, r *http.Request) {
	roles, err := h.roles(r)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "internal_error")
		return
	}
	if !policy.CanAny(roles, policy.ReadMessages) {
		httputil.WriteError(w, http.StatusForbidden, "forbidden")
		return
	}

	id := ctxkey.Get(r.Context())
	ch, err := h.svc.Get(r.Context(), id.ServerID, r.PathValue("room_id"), r.PathValue("id"))
	if err != nil {
		writeChannelError(w, err)
		return
	}
	httputil.WriteJSON(w, http.StatusOK, ch)
}

// PATCH /api/v1/rooms/{room_id}/channels/{id}
func (h *Handler) Update(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, 64*1024)

	roles, err := h.roles(r)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "internal_error")
		return
	}
	if !policy.CanAny(roles, policy.ManageChannels) {
		httputil.WriteError(w, http.StatusForbidden, "forbidden")
		return
	}

	var req struct {
		Name *string `json:"name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid_json")
		return
	}
	if req.Name != nil {
		*req.Name = strings.TrimSpace(*req.Name)
		if len(*req.Name) < 1 || len(*req.Name) > 100 {
			httputil.WriteValidationError(w, "name")
			return
		}
	}

	id := ctxkey.Get(r.Context())
	ch, err := h.svc.Update(r.Context(), id.ServerID, r.PathValue("room_id"), r.PathValue("id"), req.Name)
	if err != nil {
		writeChannelError(w, err)
		return
	}
	httputil.WriteJSON(w, http.StatusOK, ch)
}

// DELETE /api/v1/rooms/{room_id}/channels/{id}
func (h *Handler) Delete(w http.ResponseWriter, r *http.Request) {
	roles, err := h.roles(r)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "internal_error")
		return
	}
	if !policy.CanAny(roles, policy.ManageChannels) {
		httputil.WriteError(w, http.StatusForbidden, "forbidden")
		return
	}

	id := ctxkey.Get(r.Context())
	if err := h.svc.Delete(r.Context(), id.ServerID, r.PathValue("room_id"), r.PathValue("id")); err != nil {
		writeChannelError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// PUT /api/v1/rooms/{room_id}/channels/order
func (h *Handler) Reorder(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, 64*1024)

	roles, err := h.roles(r)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "internal_error")
		return
	}
	if !policy.CanAny(roles, policy.ManageChannels) {
		httputil.WriteError(w, http.StatusForbidden, "forbidden")
		return
	}

	var req struct {
		Order []string `json:"order"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid_json")
		return
	}

	id := ctxkey.Get(r.Context())
	list, err := h.svc.Reorder(r.Context(), id.ServerID, r.PathValue("room_id"), req.Order)
	if err != nil {
		writeChannelError(w, err)
		return
	}
	httputil.WriteJSON(w, http.StatusOK, list)
}
