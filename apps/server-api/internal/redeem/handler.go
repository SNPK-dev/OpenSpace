package redeem

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

// POST /api/devices/redeem/challenge
func (h *Handler) Challenge(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, 64*1024)
	var req struct {
		PairingToken    string `json:"pairing_token"`
		NewDevicePubKey string `json:"new_device_public_key"`
		ClientType      string `json:"client_type"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid_json")
		return
	}
	if req.PairingToken == "" || req.NewDevicePubKey == "" {
		httputil.WriteError(w, http.StatusBadRequest, "missing_fields")
		return
	}
	if req.ClientType == "" {
		req.ClientType = "web"
	}

	result, err := h.svc.Challenge(r.Context(), req.PairingToken, req.NewDevicePubKey, req.ClientType)
	if err != nil {
		switch {
		case errors.Is(err, ErrTokenNotFound):
			httputil.WriteError(w, http.StatusNotFound, "token_not_found")
		case errors.Is(err, ErrTokenExpired):
			httputil.WriteError(w, http.StatusBadRequest, "token_expired")
		case errors.Is(err, ErrTokenUsed):
			httputil.WriteError(w, http.StatusBadRequest, "token_already_used")
		default:
			slog.Error("redeem challenge error", "error", err)
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

// POST /api/devices/redeem/complete
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
		case errors.Is(err, ErrInvalidSig):
			httputil.WriteError(w, http.StatusBadRequest, "invalid_signature")
		case errors.Is(err, ErrTokenUsed):
			httputil.WriteError(w, http.StatusBadRequest, "token_already_used")
		default:
			slog.Error("redeem complete error", "error", err)
			httputil.WriteError(w, http.StatusInternalServerError, "internal_error")
		}
		return
	}

	httputil.WriteJSON(w, http.StatusCreated, map[string]string{
		"server_identity_id": result.ServerIdentityID,
		"device_id":          result.DeviceID,
		"access_token":       result.AccessToken,
	})
}
