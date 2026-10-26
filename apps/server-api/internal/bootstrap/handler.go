package bootstrap

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"regexp"
	"strings"

	"openspace/server-api/internal/audit"
	"openspace/server-api/internal/httputil"
	"openspace/server-api/internal/serverprofile"
)

var usernameRe = regexp.MustCompile(`^[a-zA-Z0-9_]{1,50}$`)

type Handler struct {
	svc  *Service
	alog *audit.Logger
}

func NewHandler(svc *Service, alog *audit.Logger) *Handler {
	return &Handler{svc: svc, alog: alog}
}

type statusResponse struct {
	Bootstrapped bool `json:"bootstrapped"`
}

func (h *Handler) Status(w http.ResponseWriter, r *http.Request) {
	bootstrapped, err := h.svc.IsBootstrapped(r.Context())
	if err != nil {
		slog.Error("bootstrap status check failed", "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "internal_error")
		return
	}
	httputil.WriteJSON(w, http.StatusOK, statusResponse{Bootstrapped: bootstrapped})
}

type bootstrapRequest struct {
	ServerName        string `json:"server_name"`
	ServerDescription string `json:"server_description"`
	ServerPublicURL   string `json:"server_public_url"`
	ServerAvatarURL   string `json:"server_avatar_url"`
	AdminUsername     string `json:"admin_username"`
	AdminEmail        string `json:"admin_email"`
	AdminPassword     string `json:"admin_password"`
}

type bootstrapResponse struct {
	ServerID   string `json:"server_id"`
	IdentityID string `json:"identity_id"`
	Token      string `json:"token"`
}

func (h *Handler) Bootstrap(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, 1024*1024)
	var req bootstrapRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid_json")
		return
	}

	if field := validateBootstrapRequest(req); field != "" {
		httputil.WriteValidationError(w, field)
		return
	}

	bootstrapped, err := h.svc.IsBootstrapped(r.Context())
	if err != nil {
		slog.Error("bootstrap check failed", "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "internal_error")
		return
	}
	if bootstrapped {
		httputil.WriteError(w, http.StatusConflict, "already_bootstrapped")
		return
	}

	result, err := h.svc.Bootstrap(r.Context(), BootstrapRequest{
		ServerName:        strings.TrimSpace(req.ServerName),
		ServerDescription: strings.TrimSpace(req.ServerDescription),
		ServerPublicURL:   strings.TrimSpace(req.ServerPublicURL),
		ServerAvatarURL:   strings.TrimSpace(req.ServerAvatarURL),
		AdminUsername:     strings.TrimSpace(req.AdminUsername),
		AdminEmail:        strings.TrimSpace(req.AdminEmail),
		AdminPassword:     req.AdminPassword,
	})
	if err != nil {
		slog.Error("bootstrap failed", "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "internal_error")
		return
	}

	slog.Info("server bootstrapped", "server_id", result.ServerID, "identity_id", result.IdentityID)
	h.alog.Log(result.ServerID, result.IdentityID, "server.bootstrap", result.ServerID, "server", nil)
	httputil.WriteJSON(w, http.StatusCreated, bootstrapResponse{
		ServerID:   result.ServerID,
		IdentityID: result.IdentityID,
		Token:      result.Token,
	})
}

func validateBootstrapRequest(req bootstrapRequest) string {
	if !serverprofile.ValidateName(req.ServerName) {
		return "server_name"
	}
	if !serverprofile.ValidateDescription(req.ServerDescription) {
		return "server_description"
	}
	if !serverprofile.ValidatePublicURL(req.ServerPublicURL) {
		return "server_public_url"
	}
	if !serverprofile.ValidateAvatarURL(req.ServerAvatarURL) {
		return "server_avatar_url"
	}
	if !usernameRe.MatchString(strings.TrimSpace(req.AdminUsername)) {
		return "admin_username"
	}
	if len(req.AdminPassword) < 8 {
		return "admin_password"
	}
	return ""
}
