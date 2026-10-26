package message

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"openspace/server-api/internal/attachment"
	"openspace/server-api/internal/events"
	"openspace/server-api/internal/policy"
)

var (
	ErrMessageNotFound   = errors.New("message_not_found")
	ErrNotTextChannel    = errors.New("not_a_text_channel")
	ErrForbidden         = errors.New("forbidden")
	ErrInvalidAttachment = errors.New("invalid_attachment")
)

type Sender struct {
	ID          string `json:"id"`
	Username    string `json:"username"`
	DisplayName string `json:"display_name"`
}

type Message struct {
	ID         string                     `json:"id"`
	ChannelID  string                     `json:"channel_id"`
	Sender     Sender                     `json:"sender"`
	Content    string                     `json:"content"`
	Attachment *attachment.AttachmentInfo `json:"attachment,omitempty"`
	CreatedAt  string                     `json:"created_at"`
}

type ListResult struct {
	Messages []Message `json:"messages"`
	HasMore  bool      `json:"has_more"`
}

type Service struct {
	db            *pgxpool.Pool
	publisher     *events.Publisher
	attachmentSvc *attachment.Service
}

func NewService(db *pgxpool.Pool, publisher *events.Publisher, attachmentSvc *attachment.Service) *Service {
	return &Service{db: db, publisher: publisher, attachmentSvc: attachmentSvc}
}

func (s *Service) Send(ctx context.Context, serverID, channelID, identityID, content string, attachmentID *string) (*Message, error) {
	var chanType string
	err := s.db.QueryRow(ctx,
		`SELECT type FROM channels WHERE id = $1 AND server_id = $2`,
		channelID, serverID,
	).Scan(&chanType)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrMessageNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("query channel: %w", err)
	}
	if chanType != "text" {
		return nil, ErrNotTextChannel
	}

	var attachInfo *attachment.AttachmentInfo
	var attachIDArg *string
	if attachmentID != nil && *attachmentID != "" {
		info, err := s.attachmentSvc.GetReady(ctx, serverID, *attachmentID, identityID)
		if errors.Is(err, attachment.ErrAttachmentNotFound) || errors.Is(err, attachment.ErrForbidden) {
			return nil, ErrInvalidAttachment
		}
		if err != nil {
			return nil, fmt.Errorf("get attachment: %w", err)
		}
		attachInfo = info
		attachIDArg = attachmentID
	}

	var msgID string
	var createdAt time.Time
	if err := s.db.QueryRow(ctx,
		`INSERT INTO messages(server_id, channel_id, identity_id, content, attachment_id)
		 VALUES($1, $2, $3, $4, $5)
		 RETURNING id, created_at`,
		serverID, channelID, identityID, content, attachIDArg,
	).Scan(&msgID, &createdAt); err != nil {
		return nil, fmt.Errorf("insert message: %w", err)
	}

	var sender Sender
	if err := s.db.QueryRow(ctx,
		`SELECT id, username, COALESCE(display_name, username)
		 FROM server_identities WHERE id = $1`,
		identityID,
	).Scan(&sender.ID, &sender.Username, &sender.DisplayName); err != nil {
		return nil, fmt.Errorf("query sender: %w", err)
	}

	msg := &Message{
		ID:         msgID,
		ChannelID:  channelID,
		Sender:     sender,
		Content:    content,
		Attachment: attachInfo,
		CreatedAt:  createdAt.Format(time.RFC3339),
	}

	if err := s.publisher.Publish(ctx, serverID, map[string]any{
		"type":       "message.created",
		"channel_id": channelID,
		"message":    msg,
	}); err != nil {
		slog.Error("publish message.created failed", "error", err)
	}

	return msg, nil
}

func (s *Service) List(ctx context.Context, serverID, channelID string, before *string, limit int) (*ListResult, error) {
	if limit < 1 || limit > 100 {
		limit = 50
	}
	fetch := limit + 1

	rows, err := s.db.Query(ctx,
		`SELECT m.id, m.channel_id, m.content, m.created_at,
		        si.id, si.username, COALESCE(si.display_name, si.username),
		        m.attachment_id
		 FROM messages m
		 JOIN server_identities si ON si.id = m.identity_id
		 WHERE m.channel_id = $1 AND m.server_id = $2
		   AND m.is_deleted = FALSE
		   AND ($3::uuid IS NULL OR m.created_at < (
		         SELECT created_at FROM messages WHERE id = $3 AND channel_id = $1
		       ))
		 ORDER BY m.created_at DESC
		 LIMIT $4`,
		channelID, serverID, before, fetch,
	)
	if err != nil {
		return nil, fmt.Errorf("query messages: %w", err)
	}
	defer rows.Close()

	var msgs []Message
	for rows.Next() {
		var m Message
		var createdAt time.Time
		var attachID *string
		if err := rows.Scan(
			&m.ID, &m.ChannelID, &m.Content, &createdAt,
			&m.Sender.ID, &m.Sender.Username, &m.Sender.DisplayName,
			&attachID,
		); err != nil {
			return nil, err
		}
		m.CreatedAt = createdAt.Format(time.RFC3339)
		if attachID != nil {
			info, err := s.attachmentSvc.GetReady(ctx, serverID, *attachID, m.Sender.ID)
			if err == nil {
				m.Attachment = info
			}
		}
		msgs = append(msgs, m)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	hasMore := len(msgs) > limit
	if hasMore {
		msgs = msgs[:limit]
	}
	if msgs == nil {
		msgs = []Message{}
	}

	return &ListResult{Messages: msgs, HasMore: hasMore}, nil
}

func (s *Service) Delete(ctx context.Context, serverID, channelID, messageID, callerID string, callerRoles []string) error {
	var ownerID string
	err := s.db.QueryRow(ctx,
		`SELECT identity_id FROM messages
		 WHERE id = $1 AND channel_id = $2 AND server_id = $3 AND is_deleted = FALSE`,
		messageID, channelID, serverID,
	).Scan(&ownerID)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrMessageNotFound
	}
	if err != nil {
		return fmt.Errorf("query message: %w", err)
	}

	if ownerID != callerID && !policy.CanAny(callerRoles, policy.ModerateMessages) {
		return ErrForbidden
	}

	if _, err := s.db.Exec(ctx,
		`UPDATE messages SET is_deleted=true, deleted_by=$1, updated_at=NOW()
		 WHERE id=$2`,
		callerID, messageID,
	); err != nil {
		return fmt.Errorf("delete message: %w", err)
	}

	if err := s.publisher.Publish(ctx, serverID, map[string]any{
		"type":       "message.deleted",
		"channel_id": channelID,
		"message_id": messageID,
	}); err != nil {
		slog.Error("publish message.deleted failed", "error", err)
	}

	return nil
}
