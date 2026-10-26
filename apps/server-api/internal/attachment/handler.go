package attachment

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strings"

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

func (h *Handler) roles(r *http.Request) ([]string, error) {
	id := ctxkey.Get(r.Context())
	return h.identitySvc.GetRoles(r.Context(), id.ID, id.ServerID)
}

func writeAttachmentError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, ErrAttachmentNotFound):
		httputil.WriteError(w, http.StatusNotFound, "attachment_not_found")
	case errors.Is(err, ErrUploadNotFound):
		httputil.WriteError(w, http.StatusUnprocessableEntity, "upload_not_found")
	case errors.Is(err, ErrUploadSizeMismatch):
		httputil.WriteError(w, http.StatusUnprocessableEntity, "upload_size_mismatch")
	case errors.Is(err, ErrForbidden):
		httputil.WriteError(w, http.StatusForbidden, "forbidden")
	default:
		slog.Error("attachment error", "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "internal_error")
	}
}

// POST /api/v1/attachments/upload-url
func (h *Handler) RequestUpload(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, 4*1024)

	roles, err := h.roles(r)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "internal_error")
		return
	}
	if !policy.CanAny(roles, policy.AttachFiles) {
		httputil.WriteError(w, http.StatusForbidden, "forbidden")
		return
	}

	var req struct {
		Filename    string `json:"filename"`
		ContentType string `json:"content_type"`
		SizeBytes   int64  `json:"size_bytes"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid_json")
		return
	}

	req.Filename = strings.TrimSpace(req.Filename)
	if len(req.Filename) < 1 || len(req.Filename) > 255 {
		httputil.WriteValidationError(w, "filename")
		return
	}
	req.ContentType = strings.TrimSpace(req.ContentType)
	if len(req.ContentType) < 1 || len(req.ContentType) > 128 {
		httputil.WriteValidationError(w, "content_type")
		return
	}
	if req.SizeBytes < 1 || req.SizeBytes > maxSizeBytes {
		httputil.WriteValidationError(w, "size_bytes")
		return
	}

	id := ctxkey.Get(r.Context())
	result, err := h.svc.RequestUpload(r.Context(), id.ServerID, id.ID, req.Filename, req.ContentType, req.SizeBytes)
	if err != nil {
		writeAttachmentError(w, err)
		return
	}

	httputil.WriteJSON(w, http.StatusOK, map[string]string{
		"attachment_id": result.AttachmentID,
		"upload_url":    result.UploadURL,
		"expires_at":    result.ExpiresAt,
	})
}

// POST /api/v1/attachments/{id}/confirm
func (h *Handler) Confirm(w http.ResponseWriter, r *http.Request) {
	id := ctxkey.Get(r.Context())
	info, err := h.svc.Confirm(r.Context(), id.ServerID, id.ID, r.PathValue("id"))
	if err != nil {
		writeAttachmentError(w, err)
		return
	}
	httputil.WriteJSON(w, http.StatusOK, info)
}
