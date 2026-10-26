package notification

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
)

// Service manages device push tokens and fans out events to registered devices.
type Service struct {
	db         *pgxpool.Pool
	rdb        *redis.Client
	dispatcher Dispatcher
}

func NewService(db *pgxpool.Pool, rdb *redis.Client, dispatcher Dispatcher) *Service {
	return &Service{db: db, rdb: rdb, dispatcher: dispatcher}
}

func (s *Service) RegisterToken(ctx context.Context, identityID, platform, token string) error {
	_, err := s.db.Exec(ctx,
		`INSERT INTO push_tokens(identity_id, platform, token)
		 VALUES($1, $2, $3)
		 ON CONFLICT (identity_id, token) DO NOTHING`,
		identityID, platform, token,
	)
	return err
}

func (s *Service) UnregisterToken(ctx context.Context, identityID, token string) error {
	_, err := s.db.Exec(ctx,
		`DELETE FROM push_tokens WHERE identity_id=$1 AND token=$2`,
		identityID, token,
	)
	return err
}

// Subscribe starts the event subscriber goroutine. Safe to call before bootstrap;
// the goroutine polls until a server row exists.
func (s *Service) Subscribe(ctx context.Context) {
	go s.subscribeLoop(ctx)
}

func (s *Service) subscribeLoop(ctx context.Context) {
	serverID := s.waitForServerID(ctx)
	if serverID == "" {
		return
	}

	channel := fmt.Sprintf("events:%s", serverID)
	sub := s.rdb.Subscribe(ctx, channel)
	defer sub.Close()

	slog.Info("notification: subscribed", "channel", channel)
	for {
		select {
		case <-ctx.Done():
			return
		case msg, ok := <-sub.Channel():
			if !ok {
				return
			}
			s.handleEvent(ctx, serverID, msg.Payload)
		}
	}
}

func (s *Service) waitForServerID(ctx context.Context) string {
	for {
		var id string
		if err := s.db.QueryRow(ctx, `SELECT id FROM servers LIMIT 1`).Scan(&id); err == nil && id != "" {
			return id
		}
		select {
		case <-ctx.Done():
			return ""
		case <-time.After(5 * time.Second):
		}
	}
}

type incomingEvent struct {
	Type    string          `json:"type"`
	Message json.RawMessage `json:"message,omitempty"`
}

type msgBody struct {
	Sender struct {
		ID          string `json:"id"`
		DisplayName string `json:"display_name"`
	} `json:"sender"`
	Content string `json:"content"`
}

func (s *Service) handleEvent(ctx context.Context, serverID, payload string) {
	var ev incomingEvent
	if err := json.Unmarshal([]byte(payload), &ev); err != nil {
		return
	}
	switch ev.Type {
	case "message.created":
		s.fanout(ctx, serverID, ev, "New message")
	case "dm.message.created":
		s.fanout(ctx, serverID, ev, "New direct message")
	}
}

func (s *Service) fanout(ctx context.Context, serverID string, ev incomingEvent, title string) {
	if ev.Message == nil {
		return
	}
	var mp msgBody
	if err := json.Unmarshal(ev.Message, &mp); err != nil || mp.Sender.ID == "" {
		return
	}

	rows, err := s.db.Query(ctx,
		`SELECT pt.identity_id, pt.platform, pt.token
		 FROM push_tokens pt
		 JOIN server_identities si ON si.id = pt.identity_id
		 WHERE si.server_id = $1 AND pt.identity_id != $2
		 LIMIT 1000`,
		serverID, mp.Sender.ID,
	)
	if err != nil {
		slog.Error("notification: query tokens", "error", err)
		return
	}
	defer rows.Close()

	body := mp.Sender.DisplayName + ": " + truncate(mp.Content, 100)
	var evts []Event
	for rows.Next() {
		var identityID, platform, token string
		if err := rows.Scan(&identityID, &platform, &token); err != nil {
			continue
		}
		evts = append(evts, Event{
			Type:       ev.Type,
			IdentityID: identityID,
			Platform:   platform,
			Token:      token,
			Title:      title,
			Body:       body,
		})
	}
	if err := rows.Err(); err != nil {
		slog.Error("notification: scan tokens", "error", err)
		return
	}

	if len(evts) == 0 {
		return
	}
	if err := s.dispatcher.Dispatch(ctx, evts); err != nil {
		slog.Error("notification: dispatch", "error", err)
	}
}

func truncate(s string, max int) string {
	if len(s) <= max {
		return s
	}
	return s[:max] + "..."
}
