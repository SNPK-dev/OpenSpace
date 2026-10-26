package audit

import (
	"context"
	"encoding/json"
	"log/slog"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Entry struct {
	ID         int64           `json:"id"`
	CreatedAt  time.Time       `json:"created_at"`
	ServerID   string          `json:"server_id"`
	ActorID    string          `json:"actor_id"`
	Action     string          `json:"action"`
	TargetID   string          `json:"target_id"`
	TargetType string          `json:"target_type"`
	Meta       json.RawMessage `json:"meta"`
}

type Logger struct {
	db       *pgxpool.Pool
	serverID string
}

func NewLogger(db *pgxpool.Pool, serverID string) *Logger {
	return &Logger{db: db, serverID: serverID}
}

// Log writes an audit entry asynchronously. It never blocks the caller.
func (l *Logger) Log(serverID, actorID, action, targetID, targetType string, meta map[string]any) {
	if serverID == "" {
		serverID = l.serverID
	}
	metaJSON := []byte("{}")
	if meta != nil {
		if b, err := json.Marshal(meta); err == nil {
			metaJSON = b
		}
	}

	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_, err := l.db.Exec(ctx,
			`INSERT INTO audit_log (server_id, actor_id, action, target_id, target_type, meta)
			 VALUES ($1, $2, $3, $4, $5, $6)`,
			serverID, actorID, action, targetID, targetType, metaJSON,
		)
		if err != nil {
			slog.Warn("audit: write failed", "action", action, "error", err)
		}
	}()
}

func (l *Logger) List(ctx context.Context, serverID string, limit int, before *int64) ([]Entry, error) {
	if limit < 1 || limit > 200 {
		limit = 50
	}

	var (
		rows pgx.Rows
		err  error
	)
	if before != nil {
		rows, err = l.db.Query(ctx, `
			SELECT id, created_at, server_id, actor_id, action, target_id, target_type, meta
			FROM audit_log
			WHERE server_id = $1 AND id < $2
			ORDER BY created_at DESC, id DESC
			LIMIT $3
		`, serverID, *before, limit)
	} else {
		rows, err = l.db.Query(ctx, `
			SELECT id, created_at, server_id, actor_id, action, target_id, target_type, meta
			FROM audit_log
			WHERE server_id = $1
			ORDER BY created_at DESC, id DESC
			LIMIT $2
		`, serverID, limit)
	}
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	entries := []Entry{}
	for rows.Next() {
		var e Entry
		if err := rows.Scan(&e.ID, &e.CreatedAt, &e.ServerID, &e.ActorID, &e.Action, &e.TargetID, &e.TargetType, &e.Meta); err != nil {
			return nil, err
		}
		entries = append(entries, e)
	}
	return entries, rows.Err()
}
