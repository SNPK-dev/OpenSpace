package channel

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"openspace/server-api/internal/room"
)

var (
	ErrChannelNotFound    = errors.New("channel_not_found")
	ErrInvalidChannelType = errors.New("invalid_channel_type")
	ErrInvalidOrder       = errors.New("invalid_order")
)

var validTypes = map[string]bool{"text": true, "voice": true}

type Channel struct {
	ID        string `json:"id"`
	RoomID    string `json:"room_id"`
	Name      string `json:"name"`
	Type      string `json:"type"`
	Position  int    `json:"position"`
	CreatedAt string `json:"created_at"`
}

type Service struct {
	db *pgxpool.Pool
}

func NewService(db *pgxpool.Pool) *Service {
	return &Service{db: db}
}

func (s *Service) Create(ctx context.Context, serverID, roomID, name, chanType string) (*Channel, error) {
	if !validTypes[chanType] {
		return nil, ErrInvalidChannelType
	}

	if err := s.ensureRoom(ctx, serverID, roomID); err != nil {
		return nil, err
	}

	var position int
	if err := s.db.QueryRow(ctx,
		`SELECT COALESCE(MAX(position) + 1, 0) FROM channels WHERE room_id = $1`, roomID,
	).Scan(&position); err != nil {
		return nil, fmt.Errorf("query position: %w", err)
	}

	var c Channel
	var createdAt time.Time
	if err := s.db.QueryRow(ctx,
		`INSERT INTO channels(server_id, room_id, name, type, position)
		 VALUES($1, $2, $3, $4, $5)
		 RETURNING id, room_id, name, type, position, created_at`,
		serverID, roomID, name, chanType, position,
	).Scan(&c.ID, &c.RoomID, &c.Name, &c.Type, &c.Position, &createdAt); err != nil {
		return nil, fmt.Errorf("insert channel: %w", err)
	}
	c.CreatedAt = createdAt.Format(time.RFC3339)
	return &c, nil
}

func (s *Service) List(ctx context.Context, serverID, roomID string) ([]Channel, error) {
	if err := s.ensureRoom(ctx, serverID, roomID); err != nil {
		return nil, err
	}

	rows, err := s.db.Query(ctx,
		`SELECT id, room_id, name, type, position, created_at
		 FROM channels WHERE room_id = $1 AND server_id = $2 ORDER BY position ASC`,
		roomID, serverID,
	)
	if err != nil {
		return nil, fmt.Errorf("query channels: %w", err)
	}
	defer rows.Close()

	var list []Channel
	for rows.Next() {
		var c Channel
		var createdAt time.Time
		if err := rows.Scan(&c.ID, &c.RoomID, &c.Name, &c.Type, &c.Position, &createdAt); err != nil {
			return nil, err
		}
		c.CreatedAt = createdAt.Format(time.RFC3339)
		list = append(list, c)
	}
	if list == nil {
		list = []Channel{}
	}
	return list, rows.Err()
}

func (s *Service) Get(ctx context.Context, serverID, roomID, id string) (*Channel, error) {
	var c Channel
	var createdAt time.Time
	err := s.db.QueryRow(ctx,
		`SELECT id, room_id, name, type, position, created_at
		 FROM channels WHERE id = $1 AND room_id = $2 AND server_id = $3`,
		id, roomID, serverID,
	).Scan(&c.ID, &c.RoomID, &c.Name, &c.Type, &c.Position, &createdAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrChannelNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("query channel: %w", err)
	}
	c.CreatedAt = createdAt.Format(time.RFC3339)
	return &c, nil
}

func (s *Service) Update(ctx context.Context, serverID, roomID, id string, name *string) (*Channel, error) {
	if name != nil {
		tag, err := s.db.Exec(ctx,
			`UPDATE channels SET name = $1, updated_at = NOW()
			 WHERE id = $2 AND room_id = $3 AND server_id = $4`,
			*name, id, roomID, serverID,
		)
		if err != nil {
			return nil, fmt.Errorf("update channel: %w", err)
		}
		if tag.RowsAffected() == 0 {
			return nil, ErrChannelNotFound
		}
	}
	return s.Get(ctx, serverID, roomID, id)
}

func (s *Service) Delete(ctx context.Context, serverID, roomID, id string) error {
	tag, err := s.db.Exec(ctx,
		`DELETE FROM channels WHERE id = $1 AND room_id = $2 AND server_id = $3`,
		id, roomID, serverID,
	)
	if err != nil {
		return fmt.Errorf("delete channel: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrChannelNotFound
	}
	return nil
}

func (s *Service) Reorder(ctx context.Context, serverID, roomID string, order []string) ([]Channel, error) {
	if err := s.ensureRoom(ctx, serverID, roomID); err != nil {
		return nil, err
	}

	rows, err := s.db.Query(ctx,
		`SELECT id FROM channels WHERE room_id = $1 AND server_id = $2`, roomID, serverID,
	)
	if err != nil {
		return nil, fmt.Errorf("query channel ids: %w", err)
	}
	existing := map[string]bool{}
	for rows.Next() {
		var cid string
		if err := rows.Scan(&cid); err != nil {
			rows.Close()
			return nil, err
		}
		existing[cid] = true
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, err
	}

	if len(order) != len(existing) {
		return nil, ErrInvalidOrder
	}
	for _, cid := range order {
		if !existing[cid] {
			return nil, ErrInvalidOrder
		}
	}

	tx, err := s.db.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	for i, cid := range order {
		if _, err := tx.Exec(ctx,
			`UPDATE channels SET position = $1, updated_at = NOW()
			 WHERE id = $2 AND room_id = $3 AND server_id = $4`,
			i, cid, roomID, serverID,
		); err != nil {
			return nil, fmt.Errorf("reorder channel: %w", err)
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("commit: %w", err)
	}

	return s.List(ctx, serverID, roomID)
}

func (s *Service) ensureRoom(ctx context.Context, serverID, roomID string) error {
	var count int
	if err := s.db.QueryRow(ctx,
		`SELECT COUNT(*) FROM rooms WHERE id = $1 AND server_id = $2`, roomID, serverID,
	).Scan(&count); err != nil {
		return fmt.Errorf("check room: %w", err)
	}
	if count == 0 {
		return room.ErrRoomNotFound
	}
	return nil
}
