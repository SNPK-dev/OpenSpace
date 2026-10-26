package identity

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strconv"
	"strings"

	"openspace/server-api/internal/ctxkey"
	"openspace/server-api/internal/httputil"
	"openspace/server-api/internal/policy"
	"openspace/server-api/internal/serverprofile"
)

type Handler struct {
	svc *Service
}

func NewHandler(svc *Service) *Handler {
	return &Handler{svc: svc}
}

func (h *Handler) require(r *http.Request, action policy.Action) bool {
	id := ctxkey.Get(r.Context())
	roles, err := h.svc.GetRoles(r.Context(), id.ID, id.ServerID)
	return err == nil && policy.CanAny(roles, action)
}

func writeSocialError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, ErrMemberNotFound):
		httputil.WriteError(w, http.StatusNotFound, "member_not_found")
	case errors.Is(err, ErrInvalidRelationship):
		httputil.WriteError(w, http.StatusBadRequest, "invalid_relationship")
	case errors.Is(err, ErrRelationshipNotFound):
		httputil.WriteError(w, http.StatusConflict, "relationship_not_found")
	default:
		slog.Error("social error", "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "internal_error")
	}
}

// GET /api/v1/members?q=&limit=
func (h *Handler) SearchMembers(w http.ResponseWriter, r *http.Request) {
	if !h.require(r, policy.SearchMembers) {
		httputil.WriteError(w, http.StatusForbidden, "forbidden")
		return
	}
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	id := ctxkey.Get(r.Context())
	members, err := h.svc.SearchMembers(r.Context(), id.ServerID, id.ID, r.URL.Query().Get("q"), limit)
	if err != nil {
		writeSocialError(w, err)
		return
	}
	httputil.WriteJSON(w, http.StatusOK, map[string]any{"members": members})
}

// GET /api/v1/members/{id}
func (h *Handler) GetMember(w http.ResponseWriter, r *http.Request) {
	if !h.require(r, policy.ViewProfiles) {
		httputil.WriteError(w, http.StatusForbidden, "forbidden")
		return
	}
	id := ctxkey.Get(r.Context())
	p, err := h.svc.GetPublicProfile(r.Context(), id.ServerID, id.ID, r.PathValue("id"))
	if err != nil {
		writeSocialError(w, err)
		return
	}
	httputil.WriteJSON(w, http.StatusOK, p)
}

// GET /api/v1/friends
func (h *Handler) ListFriends(w http.ResponseWriter, r *http.Request) {
	if !h.require(r, policy.RequestFriends) {
		httputil.WriteError(w, http.StatusForbidden, "forbidden")
		return
	}
	id := ctxkey.Get(r.Context())
	items, err := h.svc.ListRelationships(r.Context(), id.ServerID, id.ID)
	if err != nil {
		writeSocialError(w, err)
		return
	}
	httputil.WriteJSON(w, http.StatusOK, map[string]any{"relationships": items})
}

// POST /api/v1/friends/{id}/{action}
func (h *Handler) ChangeFriendship(w http.ResponseWriter, r *http.Request) {
	if !h.require(r, policy.RequestFriends) {
		httputil.WriteError(w, http.StatusForbidden, "forbidden")
		return
	}
	id := ctxkey.Get(r.Context())
	if err := h.svc.SetRelationship(r.Context(), id.ServerID, id.ID, r.PathValue("id"), r.PathValue("action")); err != nil {
		writeSocialError(w, err)
		return
	}
	p, err := h.svc.GetPublicProfile(r.Context(), id.ServerID, id.ID, r.PathValue("id"))
	if err != nil {
		writeSocialError(w, err)
		return
	}
	httputil.WriteJSON(w, http.StatusOK, p)
}

// GET /api/v1/me
func (h *Handler) GetMe(w http.ResponseWriter, r *http.Request) {
	id := ctxkey.Get(r.Context())
	profile, err := h.svc.GetProfile(r.Context(), id.ID, id.ServerID)
	if err != nil {
		slog.Error("get profile error", "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "internal_error")
		return
	}
	httputil.WriteJSON(w, http.StatusOK, profile)
}

// GET /api/v1/me/permissions
func (h *Handler) GetPermissions(w http.ResponseWriter, r *http.Request) {
	id := ctxkey.Get(r.Context())
	roles, err := h.svc.GetRoles(r.Context(), id.ID, id.ServerID)
	if err != nil {
		slog.Error("get permissions roles error", "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "internal_error")
		return
	}
	httputil.WriteJSON(w, http.StatusOK, map[string]any{
		"permissions": policy.EffectiveKeys(roles),
	})
}

// PATCH /api/v1/me
func (h *Handler) UpdateMe(w http.ResponseWriter, r *http.Request) {
	// A 256 KiB image becomes roughly 342 KiB after base64 encoding.
	// Keep the request bounded while allowing the validated avatar data URL.
	r.Body = http.MaxBytesReader(w, r.Body, 512*1024)
	var req struct {
		DisplayName *string `json:"display_name"`
		AvatarURL   *string `json:"avatar_url"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid_json")
		return
	}
	if req.DisplayName == nil {
		httputil.WriteValidationError(w, "display_name")
		return
	}
	dn := strings.TrimSpace(*req.DisplayName)
	if dn == "" || len(dn) > 100 {
		httputil.WriteValidationError(w, "display_name")
		return
	}
	avatarURL := ""
	if req.AvatarURL != nil {
		avatarURL = strings.TrimSpace(*req.AvatarURL)
	}
	if !serverprofile.ValidateAvatarURL(avatarURL) {
		httputil.WriteValidationError(w, "avatar_url")
		return
	}

	id := ctxkey.Get(r.Context())
	profile, err := h.svc.UpdateProfile(r.Context(), id.ID, id.ServerID, dn, avatarURL)
	if err != nil {
		slog.Error("update profile error", "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "internal_error")
		return
	}
	httputil.WriteJSON(w, http.StatusOK, profile)
}
