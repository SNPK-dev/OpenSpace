package search

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

var ErrInvalidQuery = errors.New("invalid_query")

type Sender struct {
	ID          string `json:"id"`
	Username    string `json:"username"`
	DisplayName string `json:"display_name"`
}

type MessageResult struct {
	ID          string `json:"id"`
	ChannelID   string `json:"channel_id"`
	ChannelName string `json:"channel_name"`
	Sender      Sender `json:"sender"`
	Content     string `json:"content"`
	CreatedAt   string `json:"created_at"`
}

type DMResult struct {
	ID             string `json:"id"`
	ConversationID string `json:"conversation_id"`
	Sender         Sender `json:"sender"`
	Content        string `json:"content"`
	CreatedAt      string `json:"created_at"`
}

type MessageSearchResult struct {
	Results []MessageResult `json:"results"`
	HasMore bool            `json:"has_more"`
}

type DMSearchResult struct {
	Results []DMResult `json:"results"`
	HasMore bool       `json:"has_more"`
}

type Service struct {
	db *pgxpool.Pool
}

func NewService(db *pgxpool.Pool) *Service {
	return &Service{db: db}
}

func (s *Service) SearchMessages(ctx context.Context, serverID, query string, channelID *string, before *string, limit int) (*MessageSearchResult, error) {
	if len(query) < 2 {
		return nil, ErrInvalidQuery
	}
	if limit < 1 || limit > 100 {
		limit = 50
	}
	fetch := limit + 1

	rows, err := s.db.Query(ctx,
		`SELECT m.id, m.channel_id, c.name, m.content, m.created_at,
		        si.id, si.username, COALESCE(si.display_name, si.username)
		 FROM messages m
		 JOIN server_identities si ON si.id = m.identity_id
		 JOIN channels c ON c.id = m.channel_id
		 WHERE m.server_id = $1
		   AND m.is_deleted = FALSE
		   AND ($2::uuid IS NULL OR m.channel_id = $2)
		   AND to_tsvector('english', m.content) @@ plainto_tsquery('english', $3)
		   AND ($4::uuid IS NULL OR m.created_at < (
		         SELECT created_at FROM messages WHERE id = $4 AND server_id = $1
		       ))
		 ORDER BY m.created_at DESC
		 LIMIT $5`,
		serverID, channelID, query, before, fetch,
	)
	if err != nil {
		return nil, fmt.Errorf("query message search: %w", err)
	}
	defer rows.Close()

	var results []MessageResult
	for rows.Next() {
		var r MessageResult
		var createdAt time.Time
		if err := rows.Scan(
			&r.ID, &r.ChannelID, &r.ChannelName, &r.Content, &createdAt,
			&r.Sender.ID, &r.Sender.Username, &r.Sender.DisplayName,
		); err != nil {
			return nil, err
		}
		r.CreatedAt = createdAt.Format(time.RFC3339)
		results = append(results, r)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	hasMore := len(results) > limit
	if hasMore {
		results = results[:limit]
	}
	if results == nil {
		results = []MessageResult{}
	}
	return &MessageSearchResult{Results: results, HasMore: hasMore}, nil
}

func (s *Service) SearchDMs(ctx context.Context, serverID, callerID, query string, conversationID *string, before *string, limit int) (*DMSearchResult, error) {
	if len(query) < 2 {
		return nil, ErrInvalidQuery
	}
	if limit < 1 || limit > 100 {
		limit = 50
	}
	fetch := limit + 1

	rows, err := s.db.Query(ctx,
		`SELECT dm.id, dm.conversation_id, dm.content, dm.created_at,
		        si.id, si.username, COALESCE(si.display_name, si.username)
		 FROM direct_messages dm
		 JOIN server_identities si ON si.id = dm.sender_id
		 JOIN dm_conversations dc ON dc.id = dm.conversation_id
		 WHERE dm.server_id = $1
		   AND dm.is_deleted = FALSE
		   AND (dc.participant_a = $2 OR dc.participant_b = $2)
		   AND ($3::uuid IS NULL OR dm.conversation_id = $3)
		   AND to_tsvector('english', dm.content) @@ plainto_tsquery('english', $4)
		   AND ($5::uuid IS NULL OR dm.created_at < (
		         SELECT created_at FROM direct_messages WHERE id = $5 AND server_id = $1
		       ))
		 ORDER BY dm.created_at DESC
		 LIMIT $6`,
		serverID, callerID, conversationID, query, before, fetch,
	)
	if err != nil {
		return nil, fmt.Errorf("query dm search: %w", err)
	}
	defer rows.Close()

	var results []DMResult
	for rows.Next() {
		var r DMResult
		var createdAt time.Time
		if err := rows.Scan(
			&r.ID, &r.ConversationID, &r.Content, &createdAt,
			&r.Sender.ID, &r.Sender.Username, &r.Sender.DisplayName,
		); err != nil {
			return nil, err
		}
		r.CreatedAt = createdAt.Format(time.RFC3339)
		results = append(results, r)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	hasMore := len(results) > limit
	if hasMore {
		results = results[:limit]
	}
	if results == nil {
		results = []DMResult{}
	}
	return &DMSearchResult{Results: results, HasMore: hasMore}, nil
}
