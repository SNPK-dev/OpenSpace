package message_test

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"

	"openspace/server-api/internal/attachment"
	"openspace/server-api/internal/events"
	"openspace/server-api/internal/message"
	"openspace/server-api/internal/testutil"
)

// testRedis returns a Redis client, skipping the test when TEST_REDIS_URL is unset.
func testRedis(t *testing.T) *redis.Client {
	t.Helper()
	url := os.Getenv("TEST_REDIS_URL")
	if url == "" {
		t.Skip("TEST_REDIS_URL not set; skipping integration test")
	}
	opts, err := redis.ParseURL(url)
	if err != nil {
		t.Fatalf("parse TEST_REDIS_URL: %v", err)
	}
	rdb := redis.NewClient(opts)
	if err := rdb.Ping(context.Background()).Err(); err != nil {
		t.Fatalf("redis ping: %v", err)
	}
	t.Cleanup(func() { rdb.Close() })
	return rdb
}

// insertTestRoom inserts a room and a text channel, returning their IDs.
func insertTestRoom(t *testing.T, pool *pgxpool.Pool, ctx context.Context, serverID string) (roomID, channelID string) {
	t.Helper()
	if err := pool.QueryRow(ctx,
		`INSERT INTO rooms(server_id, name) VALUES($1, 'test-room') RETURNING id`,
		serverID,
	).Scan(&roomID); err != nil {
		t.Fatalf("insert room: %v", err)
	}
	if err := pool.QueryRow(ctx,
		`INSERT INTO channels(server_id, room_id, name, type) VALUES($1,$2,'general','text') RETURNING id`,
		serverID, roomID,
	).Scan(&channelID); err != nil {
		t.Fatalf("insert channel: %v", err)
	}
	t.Cleanup(func() {
		pool.Exec(ctx, `DELETE FROM rooms WHERE id=$1`, roomID) //nolint:errcheck
	})
	return roomID, channelID
}

// TestMessageServicePublishesEvent verifies that Service.Send publishes a
// correctly-shaped message.created event to Redis channel events:<serverID>.
//
// Requires: TEST_DATABASE_URL and TEST_REDIS_URL.
func TestMessageServicePublishesEvent(t *testing.T) {
	pool := testutil.Pool(t)
	rdb := testRedis(t)
	ctx := context.Background()

	serverID := testutil.EnsureServer(t, pool, ctx)
	identityID, _ := testutil.InsertIdentity(t, pool, ctx, serverID, "legacy_password", nil)
	_, channelID := insertTestRoom(t, pool, ctx, serverID)

	// Subscribe BEFORE sending so we don't miss the event.
	sub := rdb.Subscribe(ctx, fmt.Sprintf("events:%s", serverID))
	defer sub.Close()
	// Receive the subscription confirmation message.
	if _, err := sub.Receive(ctx); err != nil {
		t.Fatalf("subscribe: %v", err)
	}

	pub := events.NewPublisher(rdb)
	svc := message.NewService(pool, pub, attachment.NewService(pool, nil))

	sent, err := svc.Send(ctx, serverID, channelID, identityID, "hello from test", nil)
	if err != nil {
		t.Fatalf("Send: %v", err)
	}

	// Wait up to 2 s for the event.
	var redisMsg *redis.Message
	select {
	case redisMsg = <-sub.Channel():
		if redisMsg == nil {
			t.Fatal("Redis subscription closed before receiving an event")
		}
	case <-time.After(2 * time.Second):
		t.Fatal("no Redis event received within timeout")
	}

	var ev map[string]json.RawMessage
	if err := json.Unmarshal([]byte(redisMsg.Payload), &ev); err != nil {
		t.Fatalf("unmarshal event: %v", err)
	}

	var evType string
	_ = json.Unmarshal(ev["type"], &evType)
	if evType != "message.created" {
		t.Errorf("event type: want %q, got %q", "message.created", evType)
	}

	var evChannelID string
	_ = json.Unmarshal(ev["channel_id"], &evChannelID)
	if evChannelID != channelID {
		t.Errorf("channel_id: want %q, got %q", channelID, evChannelID)
	}

	var evMsg map[string]json.RawMessage
	_ = json.Unmarshal(ev["message"], &evMsg)
	var evMsgID string
	_ = json.Unmarshal(evMsg["id"], &evMsgID)
	if evMsgID != sent.ID {
		t.Errorf("message.id: want %q, got %q", sent.ID, evMsgID)
	}
}

// TestMultipleServerRowsCauseMissedEvents demonstrates the root-cause
// hypothesis for the Windows→Web messaging bug:
//
// When two clients authenticate with sessions that map to DIFFERENT server_id
// values (possible when a second "server" row exists in the DB — e.g. after
// running setup.mjs --force without cleaning up the first row), Redis events
// published for server-1 are NOT delivered to clients whose WS connection was
// registered under server-2.
//
// To verify or fix on production:
//
//	docker compose exec postgres psql -U openspace -c "SELECT id,created_at FROM servers;"
//
// If more than one row appears, identities and sessions are split across two
// virtual servers and cross-client real-time messaging will silently fail.
// Fix: delete the orphaned server row (or re-pair all clients against the
// surviving one) so all sessions share a single server_id.
func TestMultipleServerRowsCauseMissedEvents(t *testing.T) {
	pool := testutil.Pool(t)
	rdb := testRedis(t)
	ctx := context.Background()

	// The "primary" server (all production web-client sessions map here).
	server1ID := testutil.EnsureServer(t, pool, ctx)

	// A second server row — simulating a server re-initialised by setup.mjs --force.
	var server2ID string
	if err := pool.QueryRow(ctx, `INSERT INTO servers DEFAULT VALUES RETURNING id`).Scan(&server2ID); err != nil {
		t.Fatalf("create second server: %v", err)
	}
	pool.Exec(ctx, `INSERT INTO server_settings(server_id) VALUES($1) ON CONFLICT DO NOTHING`, server2ID) //nolint:errcheck
	t.Cleanup(func() { pool.Exec(ctx, `DELETE FROM servers WHERE id=$1`, server2ID) })                    //nolint:errcheck

	// Web client's WS is subscribed under server2.
	sub2 := rdb.Subscribe(ctx, fmt.Sprintf("events:%s", server2ID))
	defer sub2.Close()
	if _, err := sub2.Receive(ctx); err != nil {
		t.Fatalf("subscribe server2: %v", err)
	}

	// Desktop client sends a message — event published to server1's channel.
	pub := events.NewPublisher(rdb)
	if err := pub.Publish(ctx, server1ID, map[string]any{
		"type":       "message.created",
		"channel_id": "ch-1",
		"message":    map[string]any{"id": "msg-1", "content": "hi from desktop"},
	}); err != nil {
		t.Fatalf("publish: %v", err)
	}

	// The web client (server2) must NOT receive server1's event — proving isolation.
	select {
	case <-sub2.Channel():
		t.Error("unexpected: server2 subscriber received a server1 event")
	case <-time.After(300 * time.Millisecond):
	}
	// The timeout/error is the expected outcome — it confirms isolation.
	// When production has two server rows, Windows messages (server1) never
	// reach the web client (server2), reproducing the reported bug.
}
