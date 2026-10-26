package devicereg

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"

	"openspace/server-api/internal/httputil"
)

type Handler struct {
	svc *Service
}

func NewHandler(svc *Service) *Handler {
	return &Handler{svc: svc}
}

// POST /api/auth/device-registration/challenge
func (h *Handler) Challenge(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, 64*1024)
	var req struct {
		DevicePublicKey string `json:"device_public_key"`
		DisplayName     string `json:"display_name"`
		InviteCode      string `json:"invite_code"`
		ClientType      string `json:"client_type"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid_json")
		return
	}
	if req.DevicePublicKey == "" || req.DisplayName == "" {
		httputil.WriteError(w, http.StatusBadRequest, "missing_fields")
		return
	}
	if req.ClientType == "" {
		req.ClientType = "web"
	}

	result, err := h.svc.Challenge(r.Context(), req.DevicePublicKey, req.DisplayName, req.InviteCode, req.ClientType)
	if err != nil {
		switch {
		case errors.Is(err, ErrRegistrationClosed):
			httputil.WriteError(w, http.StatusForbidden, "registration_closed")
		case errors.Is(err, ErrInviteRequired):
			httputil.WriteError(w, http.StatusBadRequest, "invite_required")
		case errors.Is(err, ErrInvalidInvite):
			httputil.WriteError(w, http.StatusBadRequest, "invalid_invite")
		case errors.Is(err, ErrNotBootstrapped):
			httputil.WriteError(w, http.StatusServiceUnavailable, "server_not_bootstrapped")
		default:
			slog.Error("device reg challenge error", "error", err)
			httputil.WriteError(w, http.StatusInternalServerError, "internal_error")
		}
		return
	}

	httputil.WriteJSON(w, http.StatusOK, map[string]string{
		"challenge_id": result.ChallengeID,
		"server_id":    result.ServerID,
		"nonce":        result.Nonce,
		"expires_at":   result.ExpiresAt.Format("2006-01-02T15:04:05Z"),
	})
}

// POST /api/auth/device-registration/complete
func (h *Handler) Complete(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, 16*1024)
	var req struct {
		ChallengeID string `json:"challenge_id"`
		Signature   string `json:"signature"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid_json")
		return
	}
	if req.ChallengeID == "" || req.Signature == "" {
		httputil.WriteError(w, http.StatusBadRequest, "missing_fields")
		return
	}

	result, err := h.svc.Complete(r.Context(), req.ChallengeID, req.Signature)
	if err != nil {
		switch {
		case errors.Is(err, ErrChallengeNotFound):
			httputil.WriteError(w, http.StatusNotFound, "challenge_not_found")
		case errors.Is(err, ErrChallengeExpired):
			httputil.WriteError(w, http.StatusBadRequest, "challenge_expired")
		case errors.Is(err, ErrInvalidSignature):
			httputil.WriteError(w, http.StatusBadRequest, "invalid_signature")
		default:
			slog.Error("device reg complete error", "error", err)
			httputil.WriteError(w, http.StatusInternalServerError, "internal_error")
		}
		return
	}

	httputil.WriteJSON(w, http.StatusCreated, map[string]any{
		"server_identity_id": result.ServerIdentityID,
		"device_id":          result.DeviceID,
		"identity_status":    result.IdentityStatus,
		"access_token":       result.AccessToken,
	})
}
