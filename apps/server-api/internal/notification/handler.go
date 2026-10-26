package notification

import (
	"encoding/json"
	"net/http"

	"openspace/server-api/internal/ctxkey"
	"openspace/server-api/internal/httputil"
)

// Handler handles push token registration/unregistration.
type Handler struct {
	svc *Service
}

func NewHandler(svc *Service) *Handler {
	return &Handler{svc: svc}
}

func (h *Handler) RegisterToken(w http.ResponseWriter, r *http.Request) {
	id := ctxkey.Get(r.Context())
	if id == nil {
		httputil.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	var req struct {
		Platform string `json:"platform"`
		Token    string `json:"token"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid_json")
		return
	}
	if req.Token == "" {
		httputil.WriteValidationError(w, "token")
		return
	}
	if req.Platform != "ios" && req.Platform != "android" && req.Platform != "web" {
		httputil.WriteValidationError(w, "platform")
		return
	}

	if err := h.svc.RegisterToken(r.Context(), id.ID, req.Platform, req.Token); err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "internal_error")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) UnregisterToken(w http.ResponseWriter, r *http.Request) {
	id := ctxkey.Get(r.Context())
	if id == nil {
		httputil.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	var req struct {
		Token string `json:"token"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Token == "" {
		httputil.WriteValidationError(w, "token")
		return
	}

	if err := h.svc.UnregisterToken(r.Context(), id.ID, req.Token); err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "internal_error")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
