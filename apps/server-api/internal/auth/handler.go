package auth

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"regexp"
	"strings"

	"openspace/server-api/internal/audit"
	"openspace/server-api/internal/ctxkey"
	"openspace/server-api/internal/httputil"
	"openspace/server-api/internal/identity"
)

var usernameRe = regexp.MustCompile(`^[a-zA-Z0-9_]{1,50}$`)

type Handler struct {
	svc         *Service
	identitySvc *identity.Service
	alog        *audit.Logger
}

func NewHandler(svc *Service, identitySvc *identity.Service, alog *audit.Logger) *Handler {
	return &Handler{svc: svc, identitySvc: identitySvc, alog: alog}
}

// POST /api/v1/auth/login
func (h *Handler) Login(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, 64*1024)
	var req struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid_json")
		return
	}
	if req.Username == "" || req.Password == "" {
		httputil.WriteError(w, http.StatusBadRequest, "validation_error")
		return
	}

	result, err := h.svc.Login(r.Context(), strings.TrimSpace(req.Username), req.Password)
	if err != nil {
		switch {
		case errors.Is(err, ErrInvalidCredentials):
			h.alog.Log("", "", "auth.login_failed", "", "", map[string]any{
				"ip": httputil.ExtractIP(r), "username": req.Username,
			})
			httputil.WriteError(w, http.StatusUnauthorized, "invalid_credentials")
		case errors.Is(err, ErrAccountDisabled):
			h.alog.Log("", "", "auth.login_failed", "", "", map[string]any{
				"ip": httputil.ExtractIP(r), "username": req.Username,
			})
			httputil.WriteError(w, http.StatusForbidden, "account_disabled")
		default:
			slog.Error("login error", "error", err)
			httputil.WriteError(w, http.StatusInternalServerError, "internal_error")
		}
		return
	}

	serverID, _ := h.svc.ServerID(r.Context())
	profile, err := h.identitySvc.GetProfile(r.Context(), result.IdentityID, serverID)
	if err != nil {
		slog.Error("login profile error", "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "internal_error")
		return
	}

	slog.Info("login", "identity_id", result.IdentityID)
	h.alog.Log("", result.IdentityID, "auth.login", "", "", map[string]any{
		"ip": httputil.ExtractIP(r), "username": req.Username,
	})
	httputil.WriteJSON(w, http.StatusOK, map[string]any{
		"token":    result.Token,
		"identity": profile,
	})
}

// POST /api/v1/auth/logout
func (h *Handler) Logout(w http.ResponseWriter, r *http.Request) {
	token := extractBearer(r)
	id := ctxkey.Get(r.Context())
	if err := h.svc.Logout(r.Context(), token); err != nil {
		slog.Error("logout error", "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "internal_error")
		return
	}
	slog.Info("logout", "identity_id", id.ID)
	h.alog.Log(id.ServerID, id.ID, "auth.logout", "", "", nil)
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) ListSessions(w http.ResponseWriter, r *http.Request) {
	identity := ctxkey.Get(r.Context())
	sessions, err := h.svc.ListSessions(r.Context(), identity.ID, identity.SessionID)
	if err != nil {
		slog.Error("list sessions error", "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "internal_error")
		return
	}
	httputil.WriteJSON(w, http.StatusOK, map[string]any{"sessions": sessions})
}

func (h *Handler) RotateSession(w http.ResponseWriter, r *http.Request) {
	identity := ctxkey.Get(r.Context())
	token, err := h.svc.RotateSession(r.Context(), identity.ID, identity.SessionID)
	if errors.Is(err, ErrSessionNotFound) {
		httputil.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	if err != nil {
		slog.Error("rotate session error", "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "internal_error")
		return
	}
	h.alog.Log(identity.ServerID, identity.ID, "auth.session_rotate", "session", identity.SessionID, nil)
	httputil.WriteJSON(w, http.StatusOK, map[string]string{"token": token})
}

func (h *Handler) RevokeSession(w http.ResponseWriter, r *http.Request) {
	identity := ctxkey.Get(r.Context())
	sessionID := r.PathValue("id")
	if err := h.svc.RevokeSession(r.Context(), identity.ID, sessionID); err != nil {
		slog.Error("revoke session error", "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "internal_error")
		return
	}
	h.alog.Log(identity.ServerID, identity.ID, "auth.session_revoke", "session", sessionID, nil)
	w.WriteHeader(http.StatusNoContent)
}

// POST /api/v1/auth/register
func (h *Handler) Register(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, 64*1024)
	var req struct {
		InviteCode  string  `json:"invite_code"`
		Username    string  `json:"username"`
		DisplayName string  `json:"display_name"`
		Email       *string `json:"email"`
		Password    string  `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid_json")
		return
	}

	if req.InviteCode == "" {
		httputil.WriteValidationError(w, "invite_code")
		return
	}
	if !usernameRe.MatchString(strings.TrimSpace(req.Username)) {
		httputil.WriteValidationError(w, "username")
		return
	}
	if len(req.Password) < 8 {
		httputil.WriteValidationError(w, "password")
		return
	}

	result, err := h.svc.Register(r.Context(), req.InviteCode, strings.TrimSpace(req.Username), req.Email, req.Password)
	if err != nil {
		switch {
		case errors.Is(err, ErrInviteNotFound):
			httputil.WriteError(w, http.StatusNotFound, "invite_not_found")
		case errors.Is(err, ErrInviteExpired):
			httputil.WriteError(w, http.StatusBadRequest, "invite_expired")
		case errors.Is(err, ErrInviteExhausted):
			httputil.WriteError(w, http.StatusBadRequest, "invite_exhausted")
		case errors.Is(err, ErrUsernameTaken):
			httputil.WriteError(w, http.StatusConflict, "username_taken")
		default:
			slog.Error("register error", "error", err)
			httputil.WriteError(w, http.StatusInternalServerError, "internal_error")
		}
		return
	}

	// Apply display_name if provided
	serverID, _ := h.svc.ServerID(r.Context())
	if dn := strings.TrimSpace(req.DisplayName); dn != "" && dn != req.Username {
		_, _ = h.identitySvc.UpdateDisplayName(r.Context(), result.IdentityID, serverID, dn)
	}

	profile, err := h.identitySvc.GetProfile(r.Context(), result.IdentityID, serverID)
	if err != nil {
		slog.Error("register profile error", "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "internal_error")
		return
	}

	slog.Info("registered", "identity_id", result.IdentityID)
	h.alog.Log("", result.IdentityID, "auth.register", "", "", map[string]any{
		"username": req.Username,
	})
	httputil.WriteJSON(w, http.StatusCreated, map[string]any{
		"token":    result.Token,
		"identity": profile,
	})
}
