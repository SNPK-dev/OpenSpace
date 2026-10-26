package invite_test

import (
	"context"
	"testing"

	"openspace/server-api/internal/invite"
	"openspace/server-api/internal/testutil"
)

// Integration tests for invite.Service — require TEST_DATABASE_URL.

func TestInviteService_CreateAndList(t *testing.T) {
	pool := testutil.Pool(t)
	ctx := context.Background()
	serverID := testutil.EnsureServer(t, pool, ctx)
	identityID, _ := testutil.InsertIdentity(t, pool, ctx, serverID, "legacy_password", strPtr("$2a$04$placeholder"))

	svc := invite.NewService(pool)

	// Create invite — unlimited hours means no expiry
	inv, err := svc.Create(ctx, identityID, 5, nil)
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	if inv.Code == "" {
		t.Fatal("expected non-empty code")
	}
	if inv.ExpiresAt != nil {
		t.Fatal("expected no expiry when hours is nil")
	}

	t.Cleanup(func() {
		pool.Exec(ctx, `DELETE FROM invites WHERE code = $1`, inv.Code) //nolint:errcheck
	})

	// List should include the just-created invite
	list, err := svc.List(ctx)
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	var found *invite.InviteDetail
	for _, d := range list {
		if d.Code == inv.Code {
			found = d
			break
		}
	}
	if found == nil {
		t.Fatalf("created invite %s not found in List", inv.Code)
	}
	if found.MaxUses != 5 {
		t.Errorf("max_uses: got %d, want 5", found.MaxUses)
	}
	if found.UseCount != 0 {
		t.Errorf("use_count: got %d, want 0", found.UseCount)
	}
	if found.RevokedAt != nil {
		t.Error("revoked_at should be nil for a fresh invite")
	}
}

func TestInviteService_CreateWithExpiry(t *testing.T) {
	pool := testutil.Pool(t)
	ctx := context.Background()
	serverID := testutil.EnsureServer(t, pool, ctx)
	identityID, _ := testutil.InsertIdentity(t, pool, ctx, serverID, "legacy_password", strPtr("$2a$04$placeholder"))

	svc := invite.NewService(pool)
	hours := 24
	inv, err := svc.Create(ctx, identityID, 1, &hours)
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	if inv.ExpiresAt == nil {
		t.Fatal("expected ExpiresAt to be set when hours=24")
	}
	t.Cleanup(func() {
		pool.Exec(ctx, `DELETE FROM invites WHERE code = $1`, inv.Code) //nolint:errcheck
	})
}

func TestInviteService_Revoke(t *testing.T) {
	pool := testutil.Pool(t)
	ctx := context.Background()
	serverID := testutil.EnsureServer(t, pool, ctx)
	identityID, _ := testutil.InsertIdentity(t, pool, ctx, serverID, "legacy_password", strPtr("$2a$04$placeholder"))

	svc := invite.NewService(pool)
	inv, err := svc.Create(ctx, identityID, 1, nil)
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	t.Cleanup(func() {
		pool.Exec(ctx, `DELETE FROM invites WHERE code = $1`, inv.Code) //nolint:errcheck
	})

	if err := svc.Revoke(ctx, inv.Code); err != nil {
		t.Fatalf("Revoke: %v", err)
	}

	// List should reflect revoked_at set
	list, err := svc.List(ctx)
	if err != nil {
		t.Fatalf("List after revoke: %v", err)
	}
	for _, d := range list {
		if d.Code == inv.Code {
			if d.RevokedAt == nil {
				t.Error("revoked_at should be non-nil after revoke")
			}
			return
		}
	}
	t.Fatal("revoked invite not found in List")
}

func TestInviteService_RevokeAlreadyRevoked_ReturnsNotFound(t *testing.T) {
	pool := testutil.Pool(t)
	ctx := context.Background()
	serverID := testutil.EnsureServer(t, pool, ctx)
	identityID, _ := testutil.InsertIdentity(t, pool, ctx, serverID, "legacy_password", strPtr("$2a$04$placeholder"))

	svc := invite.NewService(pool)
	inv, err := svc.Create(ctx, identityID, 1, nil)
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	t.Cleanup(func() {
		pool.Exec(ctx, `DELETE FROM invites WHERE code = $1`, inv.Code) //nolint:errcheck
	})

	if err := svc.Revoke(ctx, inv.Code); err != nil {
		t.Fatalf("first Revoke: %v", err)
	}
	if err := svc.Revoke(ctx, inv.Code); err == nil {
		t.Fatal("second Revoke should return ErrNotFound")
	}
}

func TestInviteService_RevokeNonExistent_ReturnsNotFound(t *testing.T) {
	pool := testutil.Pool(t)
	ctx := context.Background()
	testutil.EnsureServer(t, pool, ctx)

	svc := invite.NewService(pool)
	err := svc.Revoke(ctx, "nonexistent-code-xyz")
	if err == nil {
		t.Fatal("expected ErrNotFound for non-existent code")
	}
}

func strPtr(s string) *string { return &s }
