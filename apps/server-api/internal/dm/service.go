package dm

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
)

var (
	ErrConversationNotFound = errors.New("conversation_not_found")
	ErrInvalidRecipient     = errors.New("invalid_recipient")
	ErrRecipientNotFound    = errors.New("recipient_not_found")
	ErrForbidden            = errors.New("forbidden")
	ErrMessageNotFound      = errors.New("message_not_found")
	ErrInvalidAttachment    = errors.New("invalid_attachment")
	ErrBlocked              = errors.New("blocked")
)

type Sender struct {
	ID          string `json:"id"`
	Username    string `json:"username"`
	DisplayName string `json:"display_name"`
}

type Conversation struct {
	ID            string  `json:"id"`
	Recipient     Sender  `json:"peer"`
	LastMessageAt *string `json:"last_message_at"`
	CreatedAt     string  `json:"created_at"`
}

type DMMessage struct {
	ID             string                     `json:"id"`
	ConversationID string                     `json:"conversation_id"`
	Sender         Sender                     `json:"sender"`
	Content        string                     `json:"content"`
	Attachment     *attachment.AttachmentInfo `json:"attachment,omitempty"`
	CreatedAt      string                     `json:"created_at"`
}

type ListResult struct {
	Messages []DMMessage `json:"messages"`
	HasMore  bool        `json:"has_more"`
}

type Service struct {
	db            *pgxpool.Pool
	publisher     *events.Publisher
	attachmentSvc *attachment.Service
}

func NewService(db *pgxpool.Pool, publisher *events.Publisher, attachmentSvc *attachment.Service) *Service {
	return &Service{db: db, publisher: publisher, attachmentSvc: attachmentSvc}
}

func canonical(a, b string) (string, string) {
	if a < b {
		return a, b
	}
	return b, a
}

func (s *Service) StartConversation(ctx context.Context, serverID, callerID, recipientID string) (*Conversation, bool, error) {
	if callerID == recipientID {
		return nil, false, ErrInvalidRecipient
	}

	var count int
	if err := s.db.QueryRow(ctx,
		`SELECT COUNT(*) FROM server_identities WHERE id = $1 AND server_id = $2 AND is_disabled = FALSE`,
		recipientID, serverID,
	).Scan(&count); err != nil {
		return nil, false, fmt.Errorf("check recipient: %w", err)
	}
	if count == 0 {
		return nil, false, ErrRecipientNotFound
	}
	if err := s.ensureNotBlocked(ctx, serverID, callerID, recipientID); err != nil {
		return nil, false, err
	}

	pa, pb := canonical(callerID, recipientID)

	var convID string
	err := s.db.QueryRow(ctx,
		`INSERT INTO dm_conversations(server_id, participant_a, participant_b)
		 VALUES($1, $2, $3)
		 ON CONFLICT (server_id, participant_a, participant_b) DO NOTHING
		 RETURNING id`,
		serverID, pa, pb,
	).Scan(&convID)

	created := true
	if errors.Is(err, pgx.ErrNoRows) {
		created = false
		if err := s.db.QueryRow(ctx,
			`SELECT id FROM dm_conversations
			 WHERE server_id = $1 AND participant_a = $2 AND participant_b = $3`,
			serverID, pa, pb,
		).Scan(&convID); err != nil {
			return nil, false, fmt.Errorf("get existing conversation: %w", err)
		}
	} else if err != nil {
		return nil, false, fmt.Errorf("create conversation: %w", err)
	}

	recipient, err := s.loadSender(ctx, recipientID)
	if err != nil {
		return nil, false, err
	}

	conv := &Conversation{ID: convID, Recipient: *recipient}
	return conv, created, nil
}

func (s *Service) ListConversations(ctx context.Context, serverID, callerID string) ([]Conversation, error) {
	rows, err := s.db.Query(ctx,
		`SELECT dc.id, dc.last_message_at, dc.created_at,
		        si.id, si.username, COALESCE(si.display_name, si.username)
		 FROM dm_conversations dc
		 JOIN server_identities si ON si.id = CASE
		     WHEN dc.participant_a = $1 THEN dc.participant_b
		     ELSE dc.participant_a
		 END
		 WHERE dc.server_id = $2 AND (dc.participant_a = $1 OR dc.participant_b = $1)
		 ORDER BY COALESCE(dc.last_message_at, dc.created_at) DESC`,
		callerID, serverID,
	)
	if err != nil {
		return nil, fmt.Errorf("query conversations: %w", err)
	}
	defer rows.Close()

	var list []Conversation
	for rows.Next() {
		var c Conversation
		var lastMsgAt *time.Time
		var createdAt time.Time
		if err := rows.Scan(&c.ID, &lastMsgAt, &createdAt,
			&c.Recipient.ID, &c.Recipient.Username, &c.Recipient.DisplayName,
		); err != nil {
			return nil, err
		}
		c.CreatedAt = createdAt.Format(time.RFC3339)
		if lastMsgAt != nil {
			s := lastMsgAt.Format(time.RFC3339)
			c.LastMessageAt = &s
		}
		list = append(list, c)
	}
	if list == nil {
		list = []Conversation{}
	}
	return list, rows.Err()
}

func (s *Service) SendDM(ctx context.Context, serverID, conversationID, callerID, content string, attachmentID *string) (*DMMessage, error) {
	if err := s.ensureParticipant(ctx, serverID, conversationID, callerID); err != nil {
		return nil, err
	}
	var peerID string
	if err := s.db.QueryRow(ctx, `SELECT CASE WHEN participant_a=$3 THEN participant_b ELSE participant_a END FROM dm_conversations WHERE id=$1 AND server_id=$2 AND (participant_a=$3 OR participant_b=$3)`, conversationID, serverID, callerID).Scan(&peerID); err != nil {
		return nil, ErrConversationNotFound
	}
	if err := s.ensureNotBlocked(ctx, serverID, callerID, peerID); err != nil {
		return nil, err
	}

	var attachInfo *attachment.AttachmentInfo
	var attachIDArg *string
	if attachmentID != nil && *attachmentID != "" {
		info, err := s.attachmentSvc.GetReady(ctx, serverID, *attachmentID, callerID)
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
		`INSERT INTO direct_messages(server_id, conversation_id, sender_id, content, attachment_id)
		 VALUES($1, $2, $3, $4, $5)
		 RETURNING id, created_at`,
		serverID, conversationID, callerID, content, attachIDArg,
	).Scan(&msgID, &createdAt); err != nil {
		return nil, fmt.Errorf("insert dm: %w", err)
	}

	s.db.Exec(ctx, //nolint:errcheck
		`UPDATE dm_conversations SET last_message_at = NOW() WHERE id = $1`, conversationID,
	)

	sender, err := s.loadSender(ctx, callerID)
	if err != nil {
		return nil, err
	}

	msg := &DMMessage{
		ID:             msgID,
		ConversationID: conversationID,
		Sender:         *sender,
		Content:        content,
		Attachment:     attachInfo,
		CreatedAt:      createdAt.Format(time.RFC3339),
	}

	if err := s.publisher.Publish(ctx, serverID, map[string]any{
		"type":            "dm.created",
		"conversation_id": conversationID,
		"message":         msg,
	}); err != nil {
		slog.Error("publish dm.created failed", "error", err)
	}

	return msg, nil
}

func (s *Service) ListDMs(ctx context.Context, serverID, conversationID, callerID string, before *string, limit int) (*ListResult, error) {
	if err := s.ensureParticipant(ctx, serverID, conversationID, callerID); err != nil {
		return nil, err
	}
	if limit < 1 || limit > 100 {
		limit = 50
	}
	fetch := limit + 1

	rows, err := s.db.Query(ctx,
		`SELECT dm.id, dm.conversation_id, dm.content, dm.created_at,
		        si.id, si.username, COALESCE(si.display_name, si.username),
		        dm.attachment_id
		 FROM direct_messages dm
		 JOIN server_identities si ON si.id = dm.sender_id
		 WHERE dm.conversation_id = $1 AND dm.server_id = $2
		   AND dm.is_deleted = FALSE
		   AND ($3::uuid IS NULL OR dm.created_at < (
		         SELECT created_at FROM direct_messages WHERE id = $3 AND conversation_id = $1
		       ))
		 ORDER BY dm.created_at DESC
		 LIMIT $4`,
		conversationID, serverID, before, fetch,
	)
	if err != nil {
		return nil, fmt.Errorf("query dms: %w", err)
	}
	defer rows.Close()

	var msgs []DMMessage
	for rows.Next() {
		var m DMMessage
		var createdAt time.Time
		var attachID *string
		if err := rows.Scan(
			&m.ID, &m.ConversationID, &m.Content, &createdAt,
			&m.Sender.ID, &m.Sender.Username, &m.Sender.DisplayName,
			&attachID,
		); err != nil {
			return nil, err
		}
		m.CreatedAt = createdAt.Format(time.RFC3339)
		if attachID != nil {
			if info, err := s.attachmentSvc.GetReady(ctx, serverID, *attachID, m.Sender.ID); err == nil {
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
		msgs = []DMMessage{}
	}
	return &ListResult{Messages: msgs, HasMore: hasMore}, nil
}

func (s *Service) DeleteDM(ctx context.Context, serverID, conversationID, messageID, callerID string) error {
	if err := s.ensureParticipant(ctx, serverID, conversationID, callerID); err != nil {
		return err
	}

	var senderID string
	err := s.db.QueryRow(ctx,
		`SELECT sender_id FROM direct_messages
		 WHERE id = $1 AND conversation_id = $2 AND server_id = $3 AND is_deleted = FALSE`,
		messageID, conversationID, serverID,
	).Scan(&senderID)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrMessageNotFound
	}
	if err != nil {
		return fmt.Errorf("query dm: %w", err)
	}
	if senderID != callerID {
		return ErrForbidden
	}

	if _, err := s.db.Exec(ctx,
		`UPDATE direct_messages SET is_deleted=true, deleted_by=$1, updated_at=NOW() WHERE id=$2`,
		callerID, messageID,
	); err != nil {
		return fmt.Errorf("delete dm: %w", err)
	}

	if err := s.publisher.Publish(ctx, serverID, map[string]any{
		"type":            "dm.deleted",
		"conversation_id": conversationID,
		"message_id":      messageID,
	}); err != nil {
		slog.Error("publish dm.deleted failed", "error", err)
	}
	return nil
}

func (s *Service) ensureParticipant(ctx context.Context, serverID, conversationID, callerID string) error {
	var count int
	if err := s.db.QueryRow(ctx,
		`SELECT COUNT(*) FROM dm_conversations
		 WHERE id = $1 AND server_id = $2 AND (participant_a = $3 OR participant_b = $3)`,
		conversationID, serverID, callerID,
	).Scan(&count); err != nil {
		return fmt.Errorf("check participant: %w", err)
	}
	if count == 0 {
		return ErrConversationNotFound
	}
	return nil
}

func (s *Service) ensureNotBlocked(ctx context.Context, serverID, callerID, peerID string) error {
	var blocked bool
	if err := s.db.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM friendships WHERE server_id=$1 AND status='blocked' AND ((requester_id=$2 AND addressee_id=$3) OR (requester_id=$3 AND addressee_id=$2)))`, serverID, callerID, peerID).Scan(&blocked); err != nil {
		return fmt.Errorf("check block: %w", err)
	}
	if blocked {
		return ErrBlocked
	}
	return nil
}

func (s *Service) loadSender(ctx context.Context, identityID string) (*Sender, error) {
	var sender Sender
	if err := s.db.QueryRow(ctx,
		`SELECT id, username, COALESCE(display_name, username) FROM server_identities WHERE id = $1`,
		identityID,
	).Scan(&sender.ID, &sender.Username, &sender.DisplayName); err != nil {
		return nil, fmt.Errorf("query sender: %w", err)
	}
	return &sender, nil
}
