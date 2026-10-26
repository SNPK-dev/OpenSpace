package dm

import (
	"context"
	"errors"
	"testing"

	"openspace/server-api/internal/attachment"
	"openspace/server-api/internal/testutil"
)

func TestDMRejectsCrossServerAndNonParticipantIDOR(t *testing.T) {
	pool := testutil.Pool(t)
	ctx := context.Background()
	serverA := testutil.EnsureServer(t, pool, ctx)
	var serverB string
	if err := pool.QueryRow(ctx, `INSERT INTO servers DEFAULT VALUES RETURNING id`).Scan(&serverB); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { pool.Exec(ctx, `DELETE FROM servers WHERE id=$1`, serverB) }) //nolint:errcheck
	a, _ := testutil.InsertIdentity(t, pool, ctx, serverA, "legacy_password", nil)
	b, _ := testutil.InsertIdentity(t, pool, ctx, serverA, "legacy_password", nil)
	intruder, _ := testutil.InsertIdentity(t, pool, ctx, serverA, "legacy_password", nil)
	foreign, _ := testutil.InsertIdentity(t, pool, ctx, serverB, "legacy_password", nil)
	svc := NewService(pool, nil, attachment.NewService(pool, nil))
	if _, _, err := svc.StartConversation(ctx, serverA, a, foreign); !errors.Is(err, ErrRecipientNotFound) {
		t.Fatalf("cross-server recipient accepted: %v", err)
	}
	conv, _, err := svc.StartConversation(ctx, serverA, a, b)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := svc.ListDMs(ctx, serverA, conv.ID, intruder, nil, 50); !errors.Is(err, ErrConversationNotFound) {
		t.Fatalf("non-participant read foreign DM: %v", err)
	}
	if _, err := svc.ListDMs(ctx, serverB, conv.ID, foreign, nil, 50); !errors.Is(err, ErrConversationNotFound) {
		t.Fatalf("cross-server conversation IDOR: %v", err)
	}
}

func TestBlockedOrDisabledMemberCannotBeMessaged(t *testing.T) {
	pool := testutil.Pool(t)
	ctx := context.Background()
	serverID := testutil.EnsureServer(t, pool, ctx)
	a, _ := testutil.InsertIdentity(t, pool, ctx, serverID, "legacy_password", nil)
	b, _ := testutil.InsertIdentity(t, pool, ctx, serverID, "legacy_password", nil)
	svc := NewService(pool, nil, attachment.NewService(pool, nil))
	conv, _, err := svc.StartConversation(ctx, serverID, a, b)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO friendships(server_id,requester_id,addressee_id,status) VALUES($1,$2,$3,'blocked')`, serverID, b, a); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.SendDM(ctx, serverID, conv.ID, a, "must not arrive", nil); !errors.Is(err, ErrBlocked) {
		t.Fatalf("blocked DM send: %v", err)
	}
	if _, err := pool.Exec(ctx, `DELETE FROM friendships WHERE server_id=$1 AND requester_id=$2 AND addressee_id=$3`, serverID, b, a); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `UPDATE server_identities SET is_disabled=TRUE WHERE id=$1`, b); err != nil {
		t.Fatal(err)
	}
	if _, _, err := svc.StartConversation(ctx, serverID, a, b); !errors.Is(err, ErrRecipientNotFound) {
		t.Fatalf("disabled recipient accepted: %v", err)
	}
}
