package auth_test

import (
	"context"
	"errors"
	"testing"

	"golang.org/x/crypto/bcrypt"

	"openspace/server-api/internal/auth"
	"openspace/server-api/internal/testutil"
)

// TestLoginAuthMethodGuard verifies that the auth guard in Login() correctly
// blocks all paths that should not grant password-based access.
//
// Requires: TEST_DATABASE_URL pointing at a DB with all migrations applied.
func TestLoginAuthMethodGuard(t *testing.T) {
	pool := testutil.Pool(t)
	ctx := context.Background()

	serverID := testutil.EnsureServer(t, pool, ctx)
	svc := auth.NewService(pool, 30)

	// Pre-compute a valid bcrypt hash for "correct-password"
	hashBytes, err := bcrypt.GenerateFromPassword([]byte("correct-password"), bcrypt.MinCost)
	if err != nil {
		t.Fatalf("bcrypt hash: %v", err)
	}
	validHash := string(hashBytes)

	cases := []struct {
		name          string
		authMethod    string
		passwordHash  *string // nil → NULL column value
		inputPassword string
		wantSuccess   bool
	}{
		{
			name:          "device_credential + nil password_hash must fail (no bypass via NULL)",
			authMethod:    "device_credential",
			passwordHash:  nil,
			inputPassword: "any-password",
		},
		{
			name:          "device_credential + non-nil hash must still fail (auth_method guard fires first)",
			authMethod:    "device_credential",
			passwordHash:  &validHash,
			inputPassword: "correct-password",
		},
		{
			name:          "legacy_password + nil password_hash must fail (guard blocks NULL hash)",
			authMethod:    "legacy_password",
			passwordHash:  nil,
			inputPassword: "any-password",
		},
		{
			name:          "legacy_password + valid hash + wrong password must fail",
			authMethod:    "legacy_password",
			passwordHash:  &validHash,
			inputPassword: "wrong-password",
		},
		{
			name:          "legacy_password + valid hash + correct password must succeed",
			authMethod:    "legacy_password",
			passwordHash:  &validHash,
			inputPassword: "correct-password",
			wantSuccess:   true,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			_, username := testutil.InsertIdentity(t, pool, ctx, serverID, tc.authMethod, tc.passwordHash)

			result, err := svc.Login(ctx, username, tc.inputPassword)

			if tc.wantSuccess {
				if err != nil {
					t.Fatalf("expected successful login, got error: %v", err)
				}
				if result == nil || result.Token == "" {
					t.Fatal("expected non-empty session token on success")
				}
			} else {
				if !errors.Is(err, auth.ErrInvalidCredentials) {
					t.Fatalf("expected ErrInvalidCredentials, got: %v", err)
				}
				if result != nil {
					t.Fatal("expected nil result on failed login")
				}
			}
		})
	}
}
