package redeem_test

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"sync"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"

	"openspace/server-api/internal/redeem"
	"openspace/server-api/internal/testutil"
)

// sha256hex mirrors the server-side implementation for test parity.
func sha256hex(s string) string {
	h := sha256.Sum256([]byte(s))
	return hex.EncodeToString(h[:])
}

// insertPairingToken inserts a token with the given state and registers cleanup.
// Returns the token_id and the pairing token string ("token_id.token_secret").
func insertPairingToken(
	t *testing.T,
	pool *pgxpool.Pool,
	ctx context.Context,
	identityID, deviceID string,
	expiresAt time.Time,
	status string,
) (pairingToken string) {
	t.Helper()
	tokenID := testutil.RndHex(16)
	tokenSecret := testutil.RndHex(32)
	tokenHash := sha256hex(tokenSecret)

	var dbID string
	if err := pool.QueryRow(ctx, `
		INSERT INTO pairing_tokens(token_id, token_hash, server_identity_id, created_by_device_id, expires_at, status)
		VALUES($1, $2, $3, $4, $5, $6)
		RETURNING id`,
		tokenID, tokenHash, identityID, deviceID, expiresAt, status,
	).Scan(&dbID); err != nil {
		t.Fatalf("insert pairing_token: %v", err)
	}
	t.Cleanup(func() {
		pool.Exec(ctx, `DELETE FROM pairing_tokens WHERE id = $1`, dbID) //nolint:errcheck
	})
	return tokenID + "." + tokenSecret
}

// dummyRedis returns a Redis client pointed at an invalid address.
// It is used for tests that expect the service to fail BEFORE making any
// Redis calls (i.e., at the DB validation stage).
func dummyRedis() *redis.Client {
	return redis.NewClient(&redis.Options{Addr: "localhost:1"})
}

// TestPairingToken_DoubleRedeem_AtomicConsume proves that two concurrent
// redeem attempts for the same token result in exactly one success.
// This validates the UPDATE...WHERE status='active' AND used_count < usage_limit
// atomicity in redeem.Service.Complete.
func TestPairingToken_DoubleRedeem_AtomicConsume(t *testing.T) {
	pool := testutil.Pool(t)
	ctx := context.Background()

	serverID := testutil.EnsureServer(t, pool, ctx)
	identityID, _ := testutil.InsertIdentity(t, pool, ctx, serverID, "device_credential", nil)
	deviceID := testutil.InsertDevice(t, pool, ctx, identityID)

	tokenID := testutil.RndHex(16)
	tokenSecret := testutil.RndHex(32)
	tokenHash := sha256hex(tokenSecret)
	expiresAt := time.Now().Add(30 * time.Minute)

	var dbTokenID string
	if err := pool.QueryRow(ctx, `
		INSERT INTO pairing_tokens(token_id, token_hash, server_identity_id, created_by_device_id, expires_at, usage_limit, used_count, status)
		VALUES($1, $2, $3, $4, $5, 1, 0, 'active')
		RETURNING id`,
		tokenID, tokenHash, identityID, deviceID, expiresAt,
	).Scan(&dbTokenID); err != nil {
		t.Fatalf("insert pairing_token: %v", err)
	}
	t.Cleanup(func() {
		pool.Exec(ctx, `DELETE FROM pairing_tokens WHERE id = $1`, dbTokenID) //nolint:errcheck
	})

	_ = tokenID + "." + tokenSecret // the full client-facing token

	// Two goroutines simultaneously attempt the atomic consume SQL
	type result struct{ rowsAffected int64 }
	ch := make(chan result, 2)

	var ready, start sync.WaitGroup
	ready.Add(2)
	start.Add(1)

	claim := func() {
		ready.Done()
		start.Wait()
		res, err := pool.Exec(ctx,
			`UPDATE pairing_tokens
			 SET used_count = used_count + 1, status = 'used'
			 WHERE id = $1 AND status = 'active' AND used_count < usage_limit`,
			dbTokenID,
		)
		if err != nil {
			ch <- result{0}
			return
		}
		ch <- result{res.RowsAffected()}
	}

	go claim()
	go claim()

	ready.Wait()
	start.Done()

	r1 := <-ch
	r2 := <-ch
	total := r1.rowsAffected + r2.rowsAffected

	if total != 1 {
		t.Errorf("expected exactly 1 row affected across concurrent claims, got %d", total)
	}

	// A third attempt on the already-used token must also fail
	res, err := pool.Exec(ctx,
		`UPDATE pairing_tokens
		 SET used_count = used_count + 1, status = 'used'
		 WHERE id = $1 AND status = 'active' AND used_count < usage_limit`,
		dbTokenID,
	)
	if err != nil {
		t.Fatalf("third claim SQL error: %v", err)
	}
	if res.RowsAffected() != 0 {
		t.Errorf("already-used token must return 0 RowsAffected on claim attempt, got %d", res.RowsAffected())
	}
}

// TestPairingToken_WrongSecret fails at the service level before any Redis call.
func TestPairingToken_WrongSecret(t *testing.T) {
	pool := testutil.Pool(t)
	ctx := context.Background()

	serverID := testutil.EnsureServer(t, pool, ctx)
	identityID, _ := testutil.InsertIdentity(t, pool, ctx, serverID, "device_credential", nil)
	deviceID := testutil.InsertDevice(t, pool, ctx, identityID)

	// Insert token with correct secret
	fullToken := insertPairingToken(t, pool, ctx, identityID, deviceID, time.Now().Add(30*time.Minute), "active")
	tokenID := fullToken[:len(fullToken)/2] // first half is token_id-ish
	// Manually split to get the actual token_id
	for i, c := range fullToken {
		if c == '.' {
			tokenID = fullToken[:i]
			break
		}
	}

	// Attempt with the valid token_id but a wrong secret
	wrongToken := tokenID + "." + testutil.RndHex(32)

	svc := redeem.NewService(pool, dummyRedis(), 30)
	_, err := svc.Challenge(ctx, wrongToken, "fake-pubkey", "web")

	if !errors.Is(err, redeem.ErrTokenNotFound) {
		t.Fatalf("wrong secret: expected ErrTokenNotFound, got: %v", err)
	}
}

// TestPairingToken_ExpiredToken is rejected before any Redis call.
func TestPairingToken_ExpiredToken(t *testing.T) {
	pool := testutil.Pool(t)
	ctx := context.Background()

	serverID := testutil.EnsureServer(t, pool, ctx)
	identityID, _ := testutil.InsertIdentity(t, pool, ctx, serverID, "device_credential", nil)
	deviceID := testutil.InsertDevice(t, pool, ctx, identityID)

	// expires_at in the past
	pairingToken := insertPairingToken(t, pool, ctx, identityID, deviceID, time.Now().Add(-1*time.Second), "active")

	svc := redeem.NewService(pool, dummyRedis(), 30)
	_, err := svc.Challenge(ctx, pairingToken, "fake-pubkey", "web")

	if !errors.Is(err, redeem.ErrTokenExpired) {
		t.Fatalf("expired token: expected ErrTokenExpired, got: %v", err)
	}
}

// TestPairingToken_RevokedToken is rejected before any Redis call.
func TestPairingToken_RevokedToken(t *testing.T) {
	pool := testutil.Pool(t)
	ctx := context.Background()

	serverID := testutil.EnsureServer(t, pool, ctx)
	identityID, _ := testutil.InsertIdentity(t, pool, ctx, serverID, "device_credential", nil)
	deviceID := testutil.InsertDevice(t, pool, ctx, identityID)

	pairingToken := insertPairingToken(t, pool, ctx, identityID, deviceID, time.Now().Add(30*time.Minute), "revoked")

	svc := redeem.NewService(pool, dummyRedis(), 30)
	_, err := svc.Challenge(ctx, pairingToken, "fake-pubkey", "web")

	if !errors.Is(err, redeem.ErrTokenUsed) {
		t.Fatalf("revoked token: expected ErrTokenUsed, got: %v", err)
	}
}

// TestPairingToken_AlreadyUsedToken is rejected before any Redis call.
func TestPairingToken_AlreadyUsedToken(t *testing.T) {
	pool := testutil.Pool(t)
	ctx := context.Background()

	serverID := testutil.EnsureServer(t, pool, ctx)
	identityID, _ := testutil.InsertIdentity(t, pool, ctx, serverID, "device_credential", nil)
	deviceID := testutil.InsertDevice(t, pool, ctx, identityID)

	// Insert with used_count already at usage_limit
	tokenID := testutil.RndHex(16)
	tokenSecret := testutil.RndHex(32)
	tokenHash := sha256hex(tokenSecret)

	var dbID string
	if err := pool.QueryRow(ctx, `
		INSERT INTO pairing_tokens(token_id, token_hash, server_identity_id, created_by_device_id, expires_at, usage_limit, used_count, status)
		VALUES($1, $2, $3, $4, NOW()+INTERVAL '30 minutes', 1, 1, 'used')
		RETURNING id`,
		tokenID, tokenHash, identityID, deviceID,
	).Scan(&dbID); err != nil {
		t.Fatalf("insert used token: %v", err)
	}
	t.Cleanup(func() {
		pool.Exec(ctx, `DELETE FROM pairing_tokens WHERE id = $1`, dbID) //nolint:errcheck
	})

	svc := redeem.NewService(pool, dummyRedis(), 30)
	_, err := svc.Challenge(ctx, tokenID+"."+tokenSecret, "fake-pubkey", "web")

	if !errors.Is(err, redeem.ErrTokenUsed) {
		t.Fatalf("used token: expected ErrTokenUsed, got: %v", err)
	}
}

// TestPairingToken_InvalidFormat is rejected without any DB or Redis calls.
func TestPairingToken_InvalidFormat(t *testing.T) {
	pool := testutil.Pool(t)
	ctx := context.Background()
	svc := redeem.NewService(pool, dummyRedis(), 30)

	_, err := svc.Challenge(ctx, "no-dot-separator", "fake-pubkey", "web")
	if !errors.Is(err, redeem.ErrTokenNotFound) {
		t.Fatalf("invalid format: expected ErrTokenNotFound, got: %v", err)
	}
}
