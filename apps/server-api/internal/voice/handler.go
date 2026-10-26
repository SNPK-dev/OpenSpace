package voice

import (
	"encoding/json"
	"errors"
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

func (h *Handler) requireJoinVoice(r *http.Request) (bool, error) {
	id := ctxkey.Get(r.Context())
	roles, err := h.identitySvc.GetRoles(r.Context(), id.ID, id.ServerID)
	if err != nil {
		return false, err
	}
	return policy.CanAny(roles, policy.JoinVoice), nil
}

func writeVoiceError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, ErrChannelNotFound):
		httputil.WriteError(w, http.StatusNotFound, "channel_not_found")
	case errors.Is(err, ErrNotVoiceChannel):
		httputil.WriteError(w, http.StatusBadRequest, "not_a_voice_channel")
	case errors.Is(err, ErrNotInRoom):
		httputil.WriteError(w, http.StatusBadRequest, "not_in_room")
	default:
		slog.Error("voice error", "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "internal_error")
	}
}

// POST /api/v1/rtc/rooms/{channel_id}/join
func (h *Handler) Join(w http.ResponseWriter, r *http.Request) {
	ok, err := h.requireJoinVoice(r)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "internal_error")
		return
	}
	if !ok {
		httputil.WriteError(w, http.StatusForbidden, "forbidden")
		return
	}

	id := ctxkey.Get(r.Context())
	resp, err := h.svc.Join(r.Context(), id.ServerID, r.PathValue("channel_id"), id.ID)
	if err != nil {
		h.svc.RecordJoinFailure()
		writeVoiceError(w, err)
		return
	}
	httputil.WriteJSON(w, http.StatusOK, resp)
}

// POST /api/v1/rtc/rooms/{channel_id}/leave
func (h *Handler) Leave(w http.ResponseWriter, r *http.Request) {
	ok, err := h.requireJoinVoice(r)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "internal_error")
		return
	}
	if !ok {
		httputil.WriteError(w, http.StatusForbidden, "forbidden")
		return
	}

	id := ctxkey.Get(r.Context())
	if err := h.svc.Leave(r.Context(), id.ServerID, r.PathValue("channel_id"), id.ID); err != nil {
		writeVoiceError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// PATCH /api/v1/rtc/rooms/{channel_id}/state
func (h *Handler) UpdateState(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, 4*1024)

	ok, err := h.requireJoinVoice(r)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "internal_error")
		return
	}
	if !ok {
		httputil.WriteError(w, http.StatusForbidden, "forbidden")
		return
	}

	var req struct {
		Muted         *bool `json:"muted"`
		Deafened      *bool `json:"deafened"`
		CameraEnabled *bool `json:"camera_enabled"`
		ScreenSharing *bool `json:"screen_sharing"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid_json")
		return
	}

	id := ctxkey.Get(r.Context())
	if _, err := h.svc.UpdateState(r.Context(), id.ServerID, r.PathValue("channel_id"), id.ID, req.Muted, req.Deafened, req.CameraEnabled, req.ScreenSharing); err != nil {
		writeVoiceError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// POST /api/v1/rtc/rooms/{channel_id}/heartbeat
func (h *Handler) Heartbeat(w http.ResponseWriter, r *http.Request) {
	ok, err := h.requireJoinVoice(r)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "internal_error")
		return
	}
	if !ok {
		httputil.WriteError(w, http.StatusForbidden, "forbidden")
		return
	}

	id := ctxkey.Get(r.Context())
	if err := h.svc.Heartbeat(r.Context(), id.ServerID, r.PathValue("channel_id"), id.ID); err != nil {
		writeVoiceError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// GET /api/v1/rtc/rooms/{channel_id}/participants
func (h *Handler) ListParticipants(w http.ResponseWriter, r *http.Request) {
	ok, err := h.requireJoinVoice(r)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "internal_error")
		return
	}
	if !ok {
		httputil.WriteError(w, http.StatusForbidden, "forbidden")
		return
	}

	id := ctxkey.Get(r.Context())
	list, err := h.svc.ListParticipants(r.Context(), id.ServerID, r.PathValue("channel_id"))
	if err != nil {
		writeVoiceError(w, err)
		return
	}
	if list == nil {
		list = []Participant{}
	}
	httputil.WriteJSON(w, http.StatusOK, map[string]any{"participants": list})
}
