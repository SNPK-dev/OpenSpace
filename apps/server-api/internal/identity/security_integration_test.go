package identity

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"openspace/server-api/internal/ctxkey"
	"openspace/server-api/internal/testutil"
)

func createIsolatedServer(t *testing.T, ctx context.Context) string {
	t.Helper()
	pool := testutil.Pool(t)
	var id string
	if err := pool.QueryRow(ctx, `INSERT INTO servers DEFAULT VALUES RETURNING id`).Scan(&id); err != nil {
		t.Fatalf("create server: %v", err)
	}
	t.Cleanup(func() { pool.Exec(ctx, `DELETE FROM servers WHERE id=$1`, id) }) //nolint:errcheck
	return id
}

func TestMemberHTTPBoundaryRejectsForgedIDsAndMissingPermission(t *testing.T) {
	pool := testutil.Pool(t)
	ctx := context.Background()
	serverA := testutil.EnsureServer(t, pool, ctx)
	serverB := createIsolatedServer(t, ctx)
	caller, _ := testutil.InsertIdentity(t, pool, ctx, serverA, "legacy_password", nil)
	victim, _ := testutil.InsertIdentity(t, pool, ctx, serverB, "legacy_password", nil)
	h := NewHandler(NewService(pool))
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/v1/members/{id}", h.GetMember)
	request := func(target string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(http.MethodGet, "/api/v1/members/"+target, nil)
		req = req.WithContext(ctxkey.Set(req.Context(), &ctxkey.ContextIdentity{ID: caller, ServerID: serverA, Username: "caller"}))
		rr := httptest.NewRecorder()
		mux.ServeHTTP(rr, req)
		return rr
	}
	if rr := request(victim); rr.Code != http.StatusForbidden {
		t.Fatalf("missing profile.view permission: want 403, got %d body=%s", rr.Code, rr.Body.String())
	}
	var roleID string
	if err := pool.QueryRow(ctx, `INSERT INTO roles(server_id,name,is_system_role) VALUES($1,'member',TRUE) ON CONFLICT(server_id,name) DO UPDATE SET name=EXCLUDED.name RETURNING id`, serverA).Scan(&roleID); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO role_assignments(server_id,identity_id,role_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING`, serverA, caller, roleID); err != nil {
		t.Fatal(err)
	}
	if rr := request(victim); rr.Code != http.StatusNotFound {
		t.Fatalf("forged cross-server member id: want 404, got %d body=%s", rr.Code, rr.Body.String())
	}
}

func TestPublicProfilesPreventCrossServerIDORAndPrivateFieldLeak(t *testing.T) {
	pool := testutil.Pool(t)
	ctx := context.Background()
	serverA := testutil.EnsureServer(t, pool, ctx)
	serverB := createIsolatedServer(t, ctx)
	caller, _ := testutil.InsertIdentity(t, pool, ctx, serverA, "legacy_password", nil)
	victim, _ := testutil.InsertIdentity(t, pool, ctx, serverB, "legacy_password", nil)
	if _, err := pool.Exec(ctx, `UPDATE server_identities SET email='private@example.test',password_hash='secret-hash' WHERE id=$1`, victim); err != nil {
		t.Fatal(err)
	}
	svc := NewService(pool)

	if _, err := svc.GetPublicProfile(ctx, serverA, caller, victim); !errors.Is(err, ErrMemberNotFound) {
		t.Fatalf("cross-server profile IDOR: want member_not_found, got %v", err)
	}
	members, err := svc.SearchMembers(ctx, serverA, caller, "private", 50)
	if err != nil {
		t.Fatal(err)
	}
	if len(members) != 0 {
		t.Fatalf("cross-server search leaked %d members", len(members))
	}
	if err := svc.SetRelationship(ctx, serverA, caller, victim, "request"); !errors.Is(err, ErrMemberNotFound) {
		t.Fatalf("cross-server friend request: got %v", err)
	}

	localVictim, _ := testutil.InsertIdentity(t, pool, ctx, serverA, "legacy_password", nil)
	if _, err := pool.Exec(ctx, `UPDATE server_identities SET email='local-private@example.test',password_hash='local-secret' WHERE id=$1`, localVictim); err != nil {
		t.Fatal(err)
	}
	profile, err := svc.GetPublicProfile(ctx, serverA, caller, localVictim)
	if err != nil {
		t.Fatal(err)
	}
	payload, _ := json.Marshal(profile)
	for _, secret := range []string{"email", "password", "local-private@example.test", "local-secret"} {
		if contains := string(payload); len(contains) > 0 && stringContains(contains, secret) {
			t.Fatalf("public profile leaked %q: %s", secret, payload)
		}
	}
}

func TestFriendshipTransitionsCannotBeForged(t *testing.T) {
	pool := testutil.Pool(t)
	ctx := context.Background()
	serverID := testutil.EnsureServer(t, pool, ctx)
	a, _ := testutil.InsertIdentity(t, pool, ctx, serverID, "legacy_password", nil)
	b, _ := testutil.InsertIdentity(t, pool, ctx, serverID, "legacy_password", nil)
	svc := NewService(pool)
	if err := svc.SetRelationship(ctx, serverID, a, b, "request"); err != nil {
		t.Fatal(err)
	}
	if err := svc.SetRelationship(ctx, serverID, a, b, "accept"); !errors.Is(err, ErrRelationshipNotFound) {
		t.Fatalf("requester accepted own request: %v", err)
	}
	if err := svc.SetRelationship(ctx, serverID, b, a, "cancel"); !errors.Is(err, ErrRelationshipNotFound) {
		t.Fatalf("recipient cancelled incoming request: %v", err)
	}
	if err := svc.SetRelationship(ctx, serverID, b, a, "accept"); err != nil {
		t.Fatal(err)
	}
	if err := svc.SetRelationship(ctx, serverID, a, b, "request"); err != nil {
		t.Fatal(err)
	}
	var status string
	if err := pool.QueryRow(ctx, `SELECT status FROM friendships WHERE server_id=$1 AND ((requester_id=$2 AND addressee_id=$3) OR (requester_id=$3 AND addressee_id=$2))`, serverID, a, b).Scan(&status); err != nil {
		t.Fatal(err)
	}
	if status != "accepted" {
		t.Fatalf("repeat request downgraded friendship to %q", status)
	}
}

func stringContains(value, needle string) bool {
	for i := 0; i+len(needle) <= len(value); i++ {
		if value[i:i+len(needle)] == needle {
			return true
		}
	}
	return false
}
