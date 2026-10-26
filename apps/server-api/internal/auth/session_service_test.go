package auth_test

import (
	"context"
	"testing"
	"time"

	"openspace/server-api/internal/auth"
	"openspace/server-api/internal/sessiontoken"
	"openspace/server-api/internal/testutil"
)

func TestSessionLifecycleAndOwnership(t *testing.T) {
	pool := testutil.Pool(t)
	ctx := context.Background()
	serverID := testutil.EnsureServer(t, pool, ctx)
	identityID, _ := testutil.InsertIdentity(t, pool, ctx, serverID, "device_credential", nil)
	otherIdentityID, _ := testutil.InsertIdentity(t, pool, ctx, serverID, "device_credential", nil)
	service := auth.NewService(pool, 30)

	token, _ := sessiontoken.New()
	otherToken, _ := sessiontoken.New()
	var sessionID, otherSessionID string
	if err := pool.QueryRow(ctx, `INSERT INTO sessions(server_id,identity_id,token_hash,expires_at) VALUES($1,$2,$3,$4) RETURNING id`, serverID, identityID, sessiontoken.Digest(token), time.Now().Add(time.Hour)).Scan(&sessionID); err != nil {
		t.Fatal(err)
	}
	if err := pool.QueryRow(ctx, `INSERT INTO sessions(server_id,identity_id,token_hash,expires_at) VALUES($1,$2,$3,$4) RETURNING id`, serverID, otherIdentityID, sessiontoken.Digest(otherToken), time.Now().Add(time.Hour)).Scan(&otherSessionID); err != nil {
		t.Fatal(err)
	}

	sessions, err := service.ListSessions(ctx, identityID, sessionID)
	if err != nil || len(sessions) != 1 || !sessions[0].Current {
		t.Fatalf("sessions=%+v err=%v", sessions, err)
	}
	if err := service.RevokeSession(ctx, identityID, otherSessionID); err != nil {
		t.Fatal(err)
	}
	var stillExists bool
	if err := pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM sessions WHERE id=$1)`, otherSessionID).Scan(&stillExists); err != nil || !stillExists {
		t.Fatal("cross-identity session was revoked")
	}

	rotated, err := service.RotateSession(ctx, identityID, sessionID)
	if err != nil || rotated == token {
		t.Fatalf("rotation token=%q err=%v", rotated, err)
	}
	var storedHash string
	if err := pool.QueryRow(ctx, `SELECT token_hash FROM sessions WHERE id=$1`, sessionID).Scan(&storedHash); err != nil {
		t.Fatal(err)
	}
	if storedHash != sessiontoken.Digest(rotated) || storedHash == rotated {
		t.Fatal("rotation did not persist only the new digest")
	}

	expiredToken, _ := sessiontoken.New()
	var expiredSessionID string
	if err := pool.QueryRow(ctx, `INSERT INTO sessions(server_id,identity_id,token_hash,expires_at) VALUES($1,$2,$3,$4) RETURNING id`, serverID, identityID, sessiontoken.Digest(expiredToken), time.Now().Add(-time.Hour)).Scan(&expiredSessionID); err != nil {
		t.Fatal(err)
	}
	if _, err := service.RotateSession(ctx, identityID, expiredSessionID); err != auth.ErrSessionNotFound {
		t.Fatalf("expired rotation error = %v", err)
	}
}
