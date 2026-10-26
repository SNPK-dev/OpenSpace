package room

import (
	"context"
	"errors"
	"testing"

	"openspace/server-api/internal/testutil"
)

func TestRoomCrossServerIsolation(t *testing.T) {
	pool := testutil.Pool(t)
	ctx := context.Background()
	var serverA, serverB string
	if err := pool.QueryRow(ctx, `INSERT INTO servers DEFAULT VALUES RETURNING id`).Scan(&serverA); err != nil {
		t.Fatal(err)
	}
	if err := pool.QueryRow(ctx, `INSERT INTO servers DEFAULT VALUES RETURNING id`).Scan(&serverB); err != nil {
		t.Fatal(err)
	}
	defer pool.Exec(ctx, `DELETE FROM servers WHERE id IN ($1,$2)`, serverA, serverB) //nolint:errcheck

	svc := NewService(pool)
	created, err := svc.Create(ctx, serverA, "secret-room", "text", nil, "general")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := svc.Get(ctx, serverB, created.ID); !errors.Is(err, ErrRoomNotFound) {
		t.Fatalf("cross-server read: %v", err)
	}
	name := "stolen"
	if _, err := svc.Update(ctx, serverB, created.ID, &name, nil); !errors.Is(err, ErrRoomNotFound) {
		t.Fatalf("cross-server update: %v", err)
	}
	if err := svc.Delete(ctx, serverB, created.ID); !errors.Is(err, ErrRoomNotFound) {
		t.Fatalf("cross-server delete: %v", err)
	}
	got, err := svc.Get(ctx, serverA, created.ID)
	if err != nil || got.Name != "secret-room" {
		t.Fatalf("foreign room modified: room=%v err=%v", got, err)
	}
}
