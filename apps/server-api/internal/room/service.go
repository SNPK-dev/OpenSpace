package room

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var ErrRoomNotFound = errors.New("room_not_found")

type Room struct {
	ID          string  `json:"id"`
	Name        string  `json:"name"`
	Description *string `json:"description"`
	RoomType    string  `json:"room_type"`
	Position    int     `json:"position"`
	CreatedAt   string  `json:"created_at"`
}

type Service struct {
	db *pgxpool.Pool
}

func NewService(db *pgxpool.Pool) *Service {
	return &Service{db: db}
}

func NormalizeDefaultRoomName(name string) string {
	if name == "" {
		return "general"
	}
	return name
}

func (s *Service) Create(ctx context.Context, serverID, name, roomType string, description *string, defaultRoomName string) (*Room, error) {
	if roomType != "text" && roomType != "voice" {
		roomType = "text"
	}
	defaultRoomName = NormalizeDefaultRoomName(defaultRoomName)

	var position int
	if err := s.db.QueryRow(ctx,
		`SELECT COALESCE(MAX(position) + 1, 0) FROM rooms WHERE server_id = $1`, serverID,
	).Scan(&position); err != nil {
		return nil, fmt.Errorf("query position: %w", err)
	}

	var r Room
	var createdAt time.Time
	if err := s.db.QueryRow(ctx,
		`INSERT INTO rooms(server_id, name, description, position, room_type)
		 VALUES($1, $2, $3, $4, $5)
		 RETURNING id, name, description, room_type, position, created_at`,
		serverID, name, description, position, roomType,
	).Scan(&r.ID, &r.Name, &r.Description, &r.RoomType, &r.Position, &createdAt); err != nil {
		return nil, fmt.Errorf("insert room: %w", err)
	}
	r.CreatedAt = createdAt.Format(time.RFC3339)

	if _, err := s.db.Exec(ctx,
		`INSERT INTO channels(server_id, room_id, name, type, position)
		 VALUES($1, $2, $3, $4, 0)`,
		serverID, r.ID, defaultRoomName, roomType,
	); err != nil {
		return nil, fmt.Errorf("insert default channel: %w", err)
	}

	return &r, nil
}

func (s *Service) List(ctx context.Context, serverID string) ([]Room, error) {
	rows, err := s.db.Query(ctx,
		`SELECT id, name, description, room_type, position, created_at
		 FROM rooms WHERE server_id = $1 ORDER BY position ASC`,
		serverID,
	)
	if err != nil {
		return nil, fmt.Errorf("query rooms: %w", err)
	}
	defer rows.Close()

	var list []Room
	for rows.Next() {
		var r Room
		var createdAt time.Time
		if err := rows.Scan(&r.ID, &r.Name, &r.Description, &r.RoomType, &r.Position, &createdAt); err != nil {
			return nil, err
		}
		r.CreatedAt = createdAt.Format(time.RFC3339)
		list = append(list, r)
	}
	if list == nil {
		list = []Room{}
	}
	return list, rows.Err()
}

func (s *Service) Get(ctx context.Context, serverID, id string) (*Room, error) {
	var r Room
	var createdAt time.Time
	err := s.db.QueryRow(ctx,
		`SELECT id, name, description, room_type, position, created_at
		 FROM rooms WHERE id = $1 AND server_id = $2`,
		id, serverID,
	).Scan(&r.ID, &r.Name, &r.Description, &r.RoomType, &r.Position, &createdAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrRoomNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("query room: %w", err)
	}
	r.CreatedAt = createdAt.Format(time.RFC3339)
	return &r, nil
}

func (s *Service) Update(ctx context.Context, serverID, id string, name *string, description **string) (*Room, error) {
	if name != nil {
		if _, err := s.db.Exec(ctx,
			`UPDATE rooms SET name = $1, updated_at = NOW() WHERE id = $2 AND server_id = $3`,
			*name, id, serverID,
		); err != nil {
			return nil, fmt.Errorf("update room name: %w", err)
		}
	}
	if description != nil {
		if _, err := s.db.Exec(ctx,
			`UPDATE rooms SET description = $1, updated_at = NOW() WHERE id = $2 AND server_id = $3`,
			*description, id, serverID,
		); err != nil {
			return nil, fmt.Errorf("update room description: %w", err)
		}
	}
	return s.Get(ctx, serverID, id)
}

func (s *Service) Delete(ctx context.Context, serverID, id string) error {
	tag, err := s.db.Exec(ctx,
		`DELETE FROM rooms WHERE id = $1 AND server_id = $2`, id, serverID,
	)
	if err != nil {
		return fmt.Errorf("delete room: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrRoomNotFound
	}
	return nil
}
