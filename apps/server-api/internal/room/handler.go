package room

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strings"

	"openspace/server-api/internal/ctxkey"
	"openspace/server-api/internal/events"
	"openspace/server-api/internal/httputil"
	"openspace/server-api/internal/identity"
	"openspace/server-api/internal/policy"
)

type Handler struct {
	svc         *Service
	identitySvc *identity.Service
	pub         *events.Publisher
}

func NewHandler(svc *Service, identitySvc *identity.Service, pub *events.Publisher) *Handler {
	return &Handler{svc: svc, identitySvc: identitySvc, pub: pub}
}

func (h *Handler) roles(r *http.Request) ([]string, error) {
	id := ctxkey.Get(r.Context())
	return h.identitySvc.GetRoles(r.Context(), id.ID, id.ServerID)
}

func writeRoomError(w http.ResponseWriter, err error) {
	if errors.Is(err, ErrRoomNotFound) {
		httputil.WriteError(w, http.StatusNotFound, "room_not_found")
		return
	}
	slog.Error("room error", "error", err)
	httputil.WriteError(w, http.StatusInternalServerError, "internal_error")
}

// POST /api/v1/rooms
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
		Name            string  `json:"name"`
		Description     *string `json:"description"`
		RoomType        string  `json:"room_type"`
		DefaultRoomType string  `json:"default_room_type"`
		DefaultRoomName string  `json:"default_room_name"`
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
	defaultRoomType := req.DefaultRoomType
	if defaultRoomType == "" {
		defaultRoomType = req.RoomType
	}
	defaultRoomName := strings.TrimSpace(req.DefaultRoomName)
	rm, err := h.svc.Create(r.Context(), id.ServerID, req.Name, defaultRoomType, req.Description, defaultRoomName)
	if err != nil {
		writeRoomError(w, err)
		return
	}
	httputil.WriteJSON(w, http.StatusCreated, rm)

	if h.pub != nil {
		if err := h.pub.Publish(r.Context(), id.ServerID, map[string]any{
			"type": "room.created",
			"room": rm,
		}); err != nil {
			slog.Warn("publish room.created failed", "error", err)
		}
	}
}

// GET /api/v1/rooms
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
	list, err := h.svc.List(r.Context(), id.ServerID)
	if err != nil {
		writeRoomError(w, err)
		return
	}
	httputil.WriteJSON(w, http.StatusOK, map[string]any{"rooms": list})
}

// GET /api/v1/rooms/{id}
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
	rm, err := h.svc.Get(r.Context(), id.ServerID, r.PathValue("id"))
	if err != nil {
		writeRoomError(w, err)
		return
	}
	httputil.WriteJSON(w, http.StatusOK, rm)
}

// PATCH /api/v1/rooms/{id}
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
		Name        *string  `json:"name"`
		Description **string `json:"description"`
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
	rm, err := h.svc.Update(r.Context(), id.ServerID, r.PathValue("id"), req.Name, req.Description)
	if err != nil {
		writeRoomError(w, err)
		return
	}
	httputil.WriteJSON(w, http.StatusOK, rm)
}

// DELETE /api/v1/rooms/{id}
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
	if err := h.svc.Delete(r.Context(), id.ServerID, r.PathValue("id")); err != nil {
		writeRoomError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
