package attachment

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"

	"openspace/server-api/internal/storage"
)

const (
	maxSizeBytes   = 50 * 1024 * 1024
	uploadURLTTL   = 5 * time.Minute
	downloadURLTTL = 24 * time.Hour
)

var (
	ErrAttachmentNotFound = errors.New("attachment_not_found")
	ErrUploadNotFound     = errors.New("upload_not_found")
	ErrUploadSizeMismatch = errors.New("upload_size_mismatch")
	ErrForbidden          = errors.New("forbidden")
)

type AttachmentInfo struct {
	ID          string `json:"id"`
	Filename    string `json:"filename"`
	ContentType string `json:"content_type"`
	SizeBytes   int64  `json:"size_bytes"`
	URL         string `json:"url"`
}

type UploadRequest struct {
	AttachmentID string
	UploadURL    string
	ExpiresAt    string
}

type Service struct {
	db      *pgxpool.Pool
	storage *storage.Client
}

func NewService(db *pgxpool.Pool, store *storage.Client) *Service {
	return &Service{db: db, storage: store}
}

func (s *Service) RequestUpload(ctx context.Context, serverID, identityID, filename, contentType string, sizeBytes int64) (*UploadRequest, error) {
	if sizeBytes < 1 || sizeBytes > maxSizeBytes {
		return nil, fmt.Errorf("size_bytes out of range")
	}

	var id string
	if err := s.db.QueryRow(ctx,
		`INSERT INTO attachments(server_id, identity_id, filename, content_type, size_bytes, object_key)
		 VALUES($1, $2, $3, $4, $5, 'pending')
		 RETURNING id`,
		serverID, identityID, filename, contentType, sizeBytes,
	).Scan(&id); err != nil {
		return nil, fmt.Errorf("insert attachment: %w", err)
	}

	objectKey := fmt.Sprintf("attachments/%s/%s", serverID, id)

	if _, err := s.db.Exec(ctx,
		`UPDATE attachments SET object_key = $1 WHERE id = $2`, objectKey, id,
	); err != nil {
		return nil, fmt.Errorf("update object_key: %w", err)
	}

	uploadURL, err := s.storage.PresignPut(ctx, objectKey, contentType, sizeBytes, uploadURLTTL)
	if err != nil {
		return nil, fmt.Errorf("presign put: %w", err)
	}

	expiresAt := time.Now().UTC().Add(uploadURLTTL).Format(time.RFC3339)
	return &UploadRequest{AttachmentID: id, UploadURL: uploadURL, ExpiresAt: expiresAt}, nil
}

func (s *Service) Confirm(ctx context.Context, serverID, identityID, attachmentID string) (*AttachmentInfo, error) {
	var filename, contentType, objectKey string
	var sizeBytes int64
	var status string

	err := s.db.QueryRow(ctx,
		`SELECT filename, content_type, size_bytes, object_key, status
		 FROM attachments WHERE id = $1 AND server_id = $2`,
		attachmentID, serverID,
	).Scan(&filename, &contentType, &sizeBytes, &objectKey, &status)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrAttachmentNotFound
	}
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "22P02" {
			return nil, ErrAttachmentNotFound
		}
		return nil, fmt.Errorf("query attachment: %w", err)
	}

	var ownerID string
	s.db.QueryRow(ctx, `SELECT identity_id FROM attachments WHERE id = $1`, attachmentID).Scan(&ownerID) //nolint:errcheck
	if ownerID != identityID {
		return nil, ErrForbidden
	}

	if status == "ready" {
		url, err := s.storage.PresignGet(ctx, objectKey, filename, downloadURLTTL)
		if err != nil {
			return nil, fmt.Errorf("presign get: %w", err)
		}
		return &AttachmentInfo{ID: attachmentID, Filename: filename, ContentType: contentType, SizeBytes: sizeBytes, URL: url}, nil
	}

	exists, actualSize, err := s.storage.Head(ctx, objectKey)
	if err != nil {
		return nil, fmt.Errorf("head object: %w", err)
	}
	if !exists {
		return nil, ErrUploadNotFound
	}
	if actualSize != sizeBytes || actualSize > maxSizeBytes {
		return nil, ErrUploadSizeMismatch
	}

	if _, err := s.db.Exec(ctx,
		`UPDATE attachments SET status = 'ready' WHERE id = $1`, attachmentID,
	); err != nil {
		return nil, fmt.Errorf("confirm attachment: %w", err)
	}

	downloadURL, err := s.storage.PresignGet(ctx, objectKey, filename, downloadURLTTL)
	if err != nil {
		return nil, fmt.Errorf("presign get: %w", err)
	}

	return &AttachmentInfo{ID: attachmentID, Filename: filename, ContentType: contentType, SizeBytes: sizeBytes, URL: downloadURL}, nil
}

func (s *Service) GetReady(ctx context.Context, serverID, attachmentID, identityID string) (*AttachmentInfo, error) {
	var filename, contentType, objectKey, ownerID string
	var sizeBytes int64

	err := s.db.QueryRow(ctx,
		`SELECT filename, content_type, size_bytes, object_key, identity_id
		 FROM attachments WHERE id = $1 AND server_id = $2 AND status = 'ready'`,
		attachmentID, serverID,
	).Scan(&filename, &contentType, &sizeBytes, &objectKey, &ownerID)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrAttachmentNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("query attachment: %w", err)
	}
	if ownerID != identityID {
		return nil, ErrForbidden
	}

	url, err := s.storage.PresignGet(ctx, objectKey, filename, downloadURLTTL)
	if err != nil {
		return nil, fmt.Errorf("presign get: %w", err)
	}

	return &AttachmentInfo{ID: attachmentID, Filename: filename, ContentType: contentType, SizeBytes: sizeBytes, URL: url}, nil
}
