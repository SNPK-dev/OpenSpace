package relay

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

// POST /api/relay/transfers
func (h *Handler) Upload(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, 512*1024) // 512 KB max for encrypted bundle
	var req struct {
		EncryptedBundle  string `json:"encrypted_bundle"`
		ExpiresInSeconds int    `json:"expires_in_seconds"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid_json")
		return
	}
	if req.EncryptedBundle == "" {
		httputil.WriteError(w, http.StatusBadRequest, "missing_encrypted_bundle")
		return
	}

	result, err := h.svc.Upload(r.Context(), req.EncryptedBundle, req.ExpiresInSeconds)
	if err != nil {
		slog.Error("relay upload error", "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "internal_error")
		return
	}

	httputil.WriteJSON(w, http.StatusCreated, map[string]string{
		"transfer_id": result.TransferID,
	})
}

// GET /api/relay/transfers/{transfer_id}
func (h *Handler) Download(w http.ResponseWriter, r *http.Request) {
	transferID := r.PathValue("transfer_id")
	if transferID == "" {
		httputil.WriteError(w, http.StatusBadRequest, "missing_transfer_id")
		return
	}

	bundle, err := h.svc.Download(r.Context(), transferID)
	if err != nil {
		switch {
		case errors.Is(err, ErrNotFound):
			httputil.WriteError(w, http.StatusNotFound, "transfer_not_found")
		case errors.Is(err, ErrExpired):
			httputil.WriteError(w, http.StatusNotFound, "transfer_expired")
		case errors.Is(err, ErrUsed):
			httputil.WriteError(w, http.StatusNotFound, "transfer_already_used")
		default:
			slog.Error("relay download error", "error", err)
			httputil.WriteError(w, http.StatusInternalServerError, "internal_error")
		}
		return
	}

	httputil.WriteJSON(w, http.StatusOK, map[string]string{
		"encrypted_bundle": bundle,
	})
}
