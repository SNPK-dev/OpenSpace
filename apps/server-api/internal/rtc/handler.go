package rtc

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strings"

	"openspace/server-api/internal/ctxkey"
	"openspace/server-api/internal/httputil"
	"openspace/server-api/internal/identity"
	"openspace/server-api/internal/metrics"
	"openspace/server-api/internal/policy"
)

type voiceStatter interface {
	RoomStats(ctx context.Context) (int, int64, error)
}

type Handler struct {
	svc         *Service
	identitySvc *identity.Service
	voice       voiceStatter
	m           *metrics.Metrics
}

func NewHandler(svc *Service, identitySvc *identity.Service, voice voiceStatter, m *metrics.Metrics) *Handler {
	return &Handler{svc: svc, identitySvc: identitySvc, voice: voice, m: m}
}

func writeRTCError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, ErrChannelNotFound):
		httputil.WriteError(w, http.StatusNotFound, "channel_not_found")
	case errors.Is(err, ErrNotVoiceChannel):
		httputil.WriteError(w, http.StatusBadRequest, "not_a_voice_channel")
	default:
		slog.Error("rtc error", "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "internal_error")
	}
}

// POST /api/v1/rtc/token
func (h *Handler) IssueToken(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, 4*1024)

	id := ctxkey.Get(r.Context())
	roles, err := h.identitySvc.GetRoles(r.Context(), id.ID, id.ServerID)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "internal_error")
		return
	}
	if !policy.CanAny(roles, policy.JoinVoice) {
		httputil.WriteError(w, http.StatusForbidden, "forbidden")
		return
	}

	var req struct {
		ChannelID string   `json:"channel_id"`
		Sources   []string `json:"sources"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid_json")
		return
	}
	req.ChannelID = strings.TrimSpace(req.ChannelID)
	if req.ChannelID == "" {
		httputil.WriteValidationError(w, "channel_id")
		return
	}

	resp, err := h.svc.IssueToken(r.Context(), id.ServerID, req.ChannelID, id.ID, req.Sources)
	if err != nil {
		h.m.TokenFailures.Add(1)
		writeRTCError(w, err)
		return
	}
	httputil.WriteJSON(w, http.StatusOK, resp)
}

// GET /api/v1/rtc/ice-servers
func (h *Handler) IceServers(w http.ResponseWriter, r *http.Request) {
	id := ctxkey.Get(r.Context())
	roles, err := h.identitySvc.GetRoles(r.Context(), id.ID, id.ServerID)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "internal_error")
		return
	}
	if !policy.CanAny(roles, policy.JoinVoice) {
		httputil.WriteError(w, http.StatusForbidden, "forbidden")
		return
	}
	httputil.WriteJSON(w, http.StatusOK, h.svc.IceServers(id.ID))
}

// GET /api/v1/rtc/stats
func (h *Handler) Stats(w http.ResponseWriter, r *http.Request) {
	id := ctxkey.Get(r.Context())
	roles, err := h.identitySvc.GetRoles(r.Context(), id.ID, id.ServerID)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "internal_error")
		return
	}
	if !policy.CanAny(roles, policy.ManageServer) {
		httputil.WriteError(w, http.StatusForbidden, "forbidden")
		return
	}

	activeRooms, totalParticipants, err := h.voice.RoomStats(r.Context())
	if err != nil {
		slog.Error("rtc stats room query failed", "error", err)
		activeRooms = 0
		totalParticipants = 0
	}

	type counters struct {
		TokensIssued    int64 `json:"tokens_issued"`
		IceServed       int64 `json:"ice_served"`
		VoiceJoins      int64 `json:"voice_joins"`
		VoiceLeaves     int64 `json:"voice_leaves"`
		VoiceHeartbeats int64 `json:"voice_heartbeats"`
		VoiceEvictions  int64 `json:"voice_evictions"`
	}
	type statsResponse struct {
		VoiceRoomsActive       int      `json:"voice_rooms_active"`
		VoiceParticipantsTotal int64    `json:"voice_participants_total"`
		Counters               counters `json:"counters"`
	}

	httputil.WriteJSON(w, http.StatusOK, statsResponse{
		VoiceRoomsActive:       activeRooms,
		VoiceParticipantsTotal: totalParticipants,
		Counters: counters{
			TokensIssued:    h.m.TokensIssued.Load(),
			IceServed:       h.m.IceServed.Load(),
			VoiceJoins:      h.m.VoiceJoins.Load(),
			VoiceLeaves:     h.m.VoiceLeaves.Load(),
			VoiceHeartbeats: h.m.VoiceHeartbeats.Load(),
			VoiceEvictions:  h.m.VoiceEvictions.Load(),
		},
	})
}
