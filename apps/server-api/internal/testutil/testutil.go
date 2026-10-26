// Package testutil provides shared helpers for integration tests.
// Tests using this package require TEST_DATABASE_URL to be set; they skip otherwise.
package testutil

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"os"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Pool returns a connection pool to the test database, skipping the test if
// TEST_DATABASE_URL is not set.
func Pool(t *testing.T) *pgxpool.Pool {
	t.Helper()
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("TEST_DATABASE_URL not set; skipping integration test")
	}
	pool, err := pgxpool.New(context.Background(), dsn)
	if err != nil {
		t.Fatalf("connect to test DB: %v", err)
	}
	t.Cleanup(func() { pool.Close() })
	EnsureServer(t, pool, context.Background())
	return pool
}

// RndHex returns n random bytes as a hex string.
func RndHex(n int) string {
	b := make([]byte, n)
	if _, err := rand.Read(b); err != nil {
		panic(err)
	}
	return hex.EncodeToString(b)
}

// EnsureServer returns a persistent fixture server shared across test packages.
// The created server is never cleaned up — it is shared across the test run.
func EnsureServer(t *testing.T, pool *pgxpool.Pool, ctx context.Context) string {
	t.Helper()
	// Never borrow another package's temporary server, which its cleanup can delete.
	const serverID = "00000000-0000-4000-8000-000000000001"
	if _, err := pool.Exec(ctx, `INSERT INTO servers(id) VALUES($1) ON CONFLICT DO NOTHING`, serverID); err != nil {
		t.Fatalf("create test server: %v", err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO server_settings(server_id) VALUES($1) ON CONFLICT DO NOTHING`, serverID); err != nil {
		t.Fatalf("create test server settings: %v", err)
	}
	return serverID
}

// InsertIdentity inserts a test server_identity and registers cleanup.
// passwordHash nil → NULL (device_credential pattern).
func InsertIdentity(t *testing.T, pool *pgxpool.Pool, ctx context.Context, serverID, authMethod string, passwordHash *string) (identityID, username string) {
	t.Helper()
	username = "test-" + RndHex(6)
	if err := pool.QueryRow(ctx, `
		INSERT INTO server_identities(server_id, username, password_hash, auth_method, display_name)
		VALUES($1, $2, $3, $4, 'Test User')
		RETURNING id`,
		serverID, username, passwordHash, authMethod,
	).Scan(&identityID); err != nil {
		t.Fatalf("insert identity: %v", err)
	}
	t.Cleanup(func() {
		// Explicit order: pairing_tokens → device_credentials → sessions → identity
		pool.Exec(ctx, `DELETE FROM pairing_tokens WHERE server_identity_id = $1`, identityID)     //nolint:errcheck
		pool.Exec(ctx, `DELETE FROM device_credentials WHERE server_identity_id = $1`, identityID) //nolint:errcheck
		pool.Exec(ctx, `DELETE FROM sessions WHERE identity_id = $1`, identityID)                  //nolint:errcheck
		pool.Exec(ctx, `DELETE FROM server_identities WHERE id = $1`, identityID)                  //nolint:errcheck
	})
	return identityID, username
}

// InsertDevice inserts a test device_credential for the given identity.
func InsertDevice(t *testing.T, pool *pgxpool.Pool, ctx context.Context, identityID string) string {
	t.Helper()
	var deviceID string
	if err := pool.QueryRow(ctx, `
		INSERT INTO device_credentials(server_identity_id, device_public_key)
		VALUES($1, $2) RETURNING id`,
		identityID, "test-pubkey-"+RndHex(8),
	).Scan(&deviceID); err != nil {
		t.Fatalf("insert device_credential: %v", err)
	}
	return deviceID
}
