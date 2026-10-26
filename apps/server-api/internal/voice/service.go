package voice

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"

	"openspace/server-api/internal/events"
	"openspace/server-api/internal/metrics"
)

const (
	heartbeatTTL   = 35 * time.Second
	reaperInterval = 15 * time.Second
	evictChannel   = "sys:voice-evict"
)

var (
	ErrChannelNotFound = errors.New("channel_not_found")
	ErrNotVoiceChannel = errors.New("not_a_voice_channel")
	ErrNotInRoom       = errors.New("not_in_room")
)

type Participant struct {
	ID            string `json:"id"`
	Username      string `json:"username"`
	DisplayName   string `json:"display_name"`
	Muted         bool   `json:"muted"`
	Deafened      bool   `json:"deafened"`
	CameraEnabled bool   `json:"camera_enabled"`
	ScreenSharing bool   `json:"screen_sharing"`
}

type JoinResponse struct {
	Participant  Participant   `json:"participant"`
	Participants []Participant `json:"participants"`
}

type ParticipantsResponse struct {
	Participants []Participant `json:"participants"`
}

type Service struct {
	db        *pgxpool.Pool
	rdb       *redis.Client
	publisher *events.Publisher
	m         *metrics.Metrics
}

func (s *Service) RecordJoinFailure() { s.m.VoiceJoinFailures.Add(1) }

func NewService(db *pgxpool.Pool, rdb *redis.Client, publisher *events.Publisher, m *metrics.Metrics) *Service {
	return &Service{db: db, rdb: rdb, publisher: publisher, m: m}
}

func roomKey(serverID, channelID string) string {
	return "voice:participants:" + serverID + ":" + channelID
}

func heartbeatKey(serverID, channelID, identityID string) string {
	return "voice:heartbeat:" + serverID + ":" + channelID + ":" + identityID
}

func (s *Service) Join(ctx context.Context, serverID, channelID, identityID string) (*JoinResponse, error) {
	var chType string
	err := s.db.QueryRow(ctx,
		`SELECT type FROM channels WHERE id = $1 AND server_id = $2`,
		channelID, serverID,
	).Scan(&chType)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrChannelNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("query channel: %w", err)
	}
	if chType != "voice" {
		return nil, ErrNotVoiceChannel
	}

	var p Participant
	if err := s.db.QueryRow(ctx,
		`SELECT id, username, COALESCE(display_name, username) FROM server_identities WHERE id = $1`,
		identityID,
	).Scan(&p.ID, &p.Username, &p.DisplayName); err != nil {
		return nil, fmt.Errorf("query identity: %w", err)
	}

	data, _ := json.Marshal(p)
	if err := s.rdb.HSet(ctx, roomKey(serverID, channelID), identityID, data).Err(); err != nil {
		return nil, fmt.Errorf("hset voice state: %w", err)
	}

	if err := s.rdb.Set(ctx, heartbeatKey(serverID, channelID, identityID), "", heartbeatTTL).Err(); err != nil {
		slog.Error("set heartbeat key failed", "error", err)
	}

	if err := s.publisher.Publish(ctx, serverID, map[string]any{
		"type":        "voice.joined",
		"channel_id":  channelID,
		"participant": p,
	}); err != nil {
		if delErr := s.rdb.HDel(ctx, roomKey(serverID, channelID), identityID).Err(); delErr != nil {
			slog.Error("voice join rollback failed", "del_error", delErr, "publish_error", err)
		}
		return nil, fmt.Errorf("publish voice.joined: %w", err)
	}

	s.m.VoiceJoins.Add(1)

	participants, err := s.listFromRedis(ctx, serverID, channelID)
	if err != nil {
		return nil, err
	}
	return &JoinResponse{Participant: p, Participants: participants}, nil
}

func (s *Service) Leave(ctx context.Context, serverID, channelID, identityID string) error {
	n, err := s.rdb.HDel(ctx, roomKey(serverID, channelID), identityID).Result()
	if err != nil {
		return fmt.Errorf("hdel voice state: %w", err)
	}

	s.rdb.Del(ctx, heartbeatKey(serverID, channelID, identityID))

	if n > 0 {
		s.m.VoiceLeaves.Add(1)
		if err := s.publisher.Publish(ctx, serverID, map[string]any{
			"type":        "voice.left",
			"channel_id":  channelID,
			"identity_id": identityID,
		}); err != nil {
			slog.Error("publish voice.left failed", "error", err)
		}
	}
	return nil
}

func (s *Service) Heartbeat(ctx context.Context, serverID, channelID, identityID string) error {
	exists, err := s.rdb.HExists(ctx, roomKey(serverID, channelID), identityID).Result()
	if err != nil {
		return fmt.Errorf("hexists voice state: %w", err)
	}
	if !exists {
		return ErrNotInRoom
	}
	if err := s.rdb.Set(ctx, heartbeatKey(serverID, channelID, identityID), "", heartbeatTTL).Err(); err != nil {
		return fmt.Errorf("set heartbeat key: %w", err)
	}
	s.m.VoiceHeartbeats.Add(1)
	return nil
}

func (s *Service) UpdateState(ctx context.Context, serverID, channelID, identityID string, muted, deafened, cameraEnabled, screenSharing *bool) (*Participant, error) {
	raw, err := s.rdb.HGet(ctx, roomKey(serverID, channelID), identityID).Result()
	if errors.Is(err, redis.Nil) {
		return nil, ErrNotInRoom
	}
	if err != nil {
		return nil, fmt.Errorf("hget voice state: %w", err)
	}

	var p Participant
	if err := json.Unmarshal([]byte(raw), &p); err != nil {
		return nil, fmt.Errorf("unmarshal participant: %w", err)
	}

	if muted != nil {
		p.Muted = *muted
	}
	if deafened != nil {
		p.Deafened = *deafened
	}
	if cameraEnabled != nil {
		p.CameraEnabled = *cameraEnabled
	}
	if screenSharing != nil {
		p.ScreenSharing = *screenSharing
	}

	data, _ := json.Marshal(p)
	if err := s.rdb.HSet(ctx, roomKey(serverID, channelID), identityID, data).Err(); err != nil {
		return nil, fmt.Errorf("hset voice state: %w", err)
	}

	if err := s.publisher.Publish(ctx, serverID, map[string]any{
		"type":        "voice.state_changed",
		"channel_id":  channelID,
		"participant": p,
	}); err != nil {
		slog.Error("publish voice.state_changed failed", "error", err)
	}

	return &p, nil
}

func (s *Service) ListParticipants(ctx context.Context, serverID, channelID string) ([]Participant, error) {
	return s.listFromRedis(ctx, serverID, channelID)
}

func (s *Service) ClearAll(ctx context.Context) error {
	var cursor uint64
	for {
		keys, next, err := s.rdb.Scan(ctx, cursor, "voice:participants:*", 100).Result()
		if err != nil {
			return fmt.Errorf("scan voice keys: %w", err)
		}
		if len(keys) > 0 {
			if err := s.rdb.Del(ctx, keys...).Err(); err != nil {
				return fmt.Errorf("del voice keys: %w", err)
			}
		}
		cursor = next
		if cursor == 0 {
			break
		}
	}
	return nil
}

// StartReaper runs a background loop that evicts participants whose heartbeat has expired.
// Call in a goroutine; returns when ctx is cancelled.
func (s *Service) StartReaper(ctx context.Context) {
	ticker := time.NewTicker(reaperInterval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			s.reap(ctx)
		}
	}
}

func (s *Service) reap(ctx context.Context) {
	var cursor uint64
	for {
		keys, next, err := s.rdb.Scan(ctx, cursor, "voice:participants:*", 100).Result()
		if err != nil {
			slog.Error("voice reaper scan failed", "error", err)
			return
		}
		for _, key := range keys {
			s.reapRoom(ctx, key)
		}
		cursor = next
		if cursor == 0 {
			break
		}
	}
}

func (s *Service) reapRoom(ctx context.Context, key string) {
	// key = "voice:participants:{serverID}:{channelID}"
	// Extract serverID and channelID from key suffix after "voice:participants:"
	const prefix = "voice:participants:"
	if len(key) <= len(prefix) {
		return
	}
	rest := key[len(prefix):]
	// Find the separator between serverID and channelID (first colon after prefix)
	sep := -1
	for i, c := range rest {
		if c == ':' {
			sep = i
			break
		}
	}
	if sep < 0 {
		return
	}
	serverID := rest[:sep]
	channelID := rest[sep+1:]

	fields, err := s.rdb.HKeys(ctx, key).Result()
	if err != nil {
		slog.Error("voice reaper hkeys failed", "key", key, "error", err)
		return
	}
	for _, identityID := range fields {
		hbKey := heartbeatKey(serverID, channelID, identityID)
		exists, err := s.rdb.Exists(ctx, hbKey).Result()
		if err != nil {
			slog.Error("voice reaper exists failed", "key", hbKey, "error", err)
			continue
		}
		if exists == 0 {
			n, err := s.rdb.HDel(ctx, key, identityID).Result()
			if err != nil {
				slog.Error("voice reaper hdel failed", "error", err)
				continue
			}
			if n > 0 {
				s.m.VoiceEvictions.Add(1)
				slog.Info("voice reaper evicted participant", "server_id", serverID, "channel_id", channelID, "identity_id", identityID)
				if pubErr := s.publisher.Publish(ctx, serverID, map[string]any{
					"type":        "voice.left",
					"channel_id":  channelID,
					"identity_id": identityID,
				}); pubErr != nil {
					slog.Error("voice reaper publish failed", "error", pubErr)
				}
			}
		}
	}
}

// RoomStats returns (activeRooms, totalParticipants, error).
func (s *Service) RoomStats(ctx context.Context) (int, int64, error) {
	var cursor uint64
	var active int
	var total int64
	for {
		keys, next, err := s.rdb.Scan(ctx, cursor, "voice:participants:*", 100).Result()
		if err != nil {
			return 0, 0, fmt.Errorf("scan voice keys: %w", err)
		}
		for _, key := range keys {
			n, err := s.rdb.HLen(ctx, key).Result()
			if err != nil {
				continue
			}
			if n > 0 {
				active++
				total += n
			}
		}
		cursor = next
		if cursor == 0 {
			break
		}
	}
	return active, total, nil
}

// LeaveAll removes identityID from every voice room they're in within serverID.
// Used on WS disconnect to instantly evict the user across all channels.
func (s *Service) LeaveAll(ctx context.Context, serverID, identityID string) error {
	pattern := "voice:participants:" + serverID + ":*"
	prefix := "voice:participants:" + serverID + ":"
	var cursor uint64
	for {
		keys, next, err := s.rdb.Scan(ctx, cursor, pattern, 100).Result()
		if err != nil {
			return fmt.Errorf("scan voice keys: %w", err)
		}
		for _, key := range keys {
			channelID := key[len(prefix):]
			exists, err := s.rdb.HExists(ctx, key, identityID).Result()
			if err != nil || !exists {
				continue
			}
			if err := s.Leave(ctx, serverID, channelID, identityID); err != nil && !errors.Is(err, ErrNotInRoom) {
				slog.Error("voice leave all: leave failed", "channel_id", channelID, "error", err)
			}
		}
		cursor = next
		if cursor == 0 {
			break
		}
	}
	return nil
}

// StartDisconnectListener subscribes to sys:voice-evict and calls LeaveAll for each
// message. Run in a goroutine; returns when ctx is cancelled.
func (s *Service) StartDisconnectListener(ctx context.Context) {
	sub := s.rdb.Subscribe(ctx, evictChannel)
	defer sub.Close()

	ch := sub.Channel()
	for {
		select {
		case <-ctx.Done():
			return
		case msg, ok := <-ch:
			if !ok {
				return
			}
			var payload struct {
				ServerID   string `json:"server_id"`
				IdentityID string `json:"identity_id"`
			}
			if err := json.Unmarshal([]byte(msg.Payload), &payload); err != nil {
				slog.Error("voice evict: unmarshal failed", "error", err)
				continue
			}
			if payload.ServerID == "" || payload.IdentityID == "" {
				continue
			}
			if err := s.LeaveAll(ctx, payload.ServerID, payload.IdentityID); err != nil {
				slog.Error("voice evict: leave all failed", "error", err)
			}
		}
	}
}

func (s *Service) listFromRedis(ctx context.Context, serverID, channelID string) ([]Participant, error) {
	raw, err := s.rdb.HGetAll(ctx, roomKey(serverID, channelID)).Result()
	if err != nil {
		return nil, fmt.Errorf("hgetall voice: %w", err)
	}
	list := make([]Participant, 0, len(raw))
	for _, v := range raw {
		var p Participant
		if err := json.Unmarshal([]byte(v), &p); err == nil {
			list = append(list, p)
		}
	}
	return list, nil
}
