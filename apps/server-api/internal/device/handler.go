package device

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"

	"openspace/server-api/internal/ctxkey"
	"openspace/server-api/internal/httputil"
)

type Handler struct {
	svc *Service
}

func NewHandler(svc *Service) *Handler {
	return &Handler{svc: svc}
}

// POST /api/devices/pairing-token
func (h *Handler) CreatePairingToken(w http.ResponseWriter, r *http.Request) {
	id := ctxkey.Get(r.Context())
	r.Body = http.MaxBytesReader(w, r.Body, 4*1024)
	var req struct {
		TTLSeconds int `json:"ttl_seconds"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid_json")
		return
	}

	result, err := h.svc.CreatePairingToken(r.Context(), id.ID, req.TTLSeconds)
	if err != nil {
		slog.Error("create pairing token error", "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "internal_error")
		return
	}

	httputil.WriteJSON(w, http.StatusCreated, map[string]any{
		"pairing_token": result.PairingToken,
		"expires_at":    result.ExpiresAt.Format("2006-01-02T15:04:05Z07:00"),
	})
}

// DELETE /api/devices/{device_id}
func (h *Handler) RevokeDevice(w http.ResponseWriter, r *http.Request) {
	id := ctxkey.Get(r.Context())
	deviceID := r.PathValue("device_id")
	if deviceID == "" {
		httputil.WriteError(w, http.StatusBadRequest, "missing_device_id")
		return
	}

	if err := h.svc.RevokeDevice(r.Context(), id.ID, deviceID); err != nil {
		switch {
		case errors.Is(err, ErrDeviceNotFound):
			httputil.WriteError(w, http.StatusNotFound, "device_not_found")
		case errors.Is(err, ErrForbidden):
			httputil.WriteError(w, http.StatusForbidden, "forbidden")
		default:
			slog.Error("revoke device error", "error", err)
			httputil.WriteError(w, http.StatusInternalServerError, "internal_error")
		}
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
