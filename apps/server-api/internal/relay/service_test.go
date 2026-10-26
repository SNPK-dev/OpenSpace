package relay_test

import (
	"context"
	"errors"
	"sync"
	"testing"

	"openspace/server-api/internal/relay"
	"openspace/server-api/internal/testutil"
)

// TestDownload_AtomicConcurrentClaim proves that exactly one of two concurrent
// Download calls succeeds when racing for the same transfer.
//
// This test validates the UPDATE...RETURNING atomicity that replaced the
// SELECT→UPDATE TOCTOU pattern (Fix 6).
//
// Requires: TEST_DATABASE_URL pointing at a DB with all migrations applied.
func TestDownload_AtomicConcurrentClaim(t *testing.T) {
	pool := testutil.Pool(t)
	ctx := context.Background()
	svc := relay.NewService(pool)

	const payload = "encrypted-bundle-payload"

	result, err := svc.Upload(ctx, payload, 300)
	if err != nil {
		t.Fatalf("upload: %v", err)
	}
	tid := result.TransferID
	t.Cleanup(func() {
		pool.Exec(ctx, `DELETE FROM relay_transfers WHERE id = $1`, tid) //nolint:errcheck
	})

	type outcome struct {
		bundle string
		err    error
	}
	ch := make(chan outcome, 2)

	// Use a barrier so both goroutines hit Download as close together as possible
	var ready sync.WaitGroup
	ready.Add(2)
	var start sync.WaitGroup
	start.Add(1)

	for i := 0; i < 2; i++ {
		go func() {
			ready.Done()
			start.Wait() // block until both goroutines are ready
			b, err := svc.Download(ctx, tid)
			ch <- outcome{b, err}
		}()
	}

	ready.Wait() // wait until both goroutines are past their ready.Done()
	start.Done() // release both simultaneously

	o1 := <-ch
	o2 := <-ch

	successes := 0
	failures := 0
	for _, o := range []outcome{o1, o2} {
		if o.err == nil {
			successes++
			if o.bundle != payload {
				t.Errorf("unexpected bundle content: %q", o.bundle)
			}
		} else {
			failures++
			if !errors.Is(o.err, relay.ErrUsed) {
				t.Errorf("second download expected ErrUsed, got: %v", o.err)
			}
		}
	}

	if successes != 1 || failures != 1 {
		t.Errorf("expected 1 success + 1 ErrUsed, got %d success + %d failure", successes, failures)
	}
}

func TestDownload_ExpiredTransfer(t *testing.T) {
	pool := testutil.Pool(t)
	ctx := context.Background()
	svc := relay.NewService(pool)

	// Insert an already-expired transfer directly
	var tid string
	if err := pool.QueryRow(ctx, `
		INSERT INTO relay_transfers(encrypted_bundle, expires_at)
		VALUES('bundle', NOW() - INTERVAL '1 second')
		RETURNING id`,
	).Scan(&tid); err != nil {
		t.Fatalf("insert expired transfer: %v", err)
	}
	t.Cleanup(func() {
		pool.Exec(ctx, `DELETE FROM relay_transfers WHERE id = $1`, tid) //nolint:errcheck
	})

	_, err := svc.Download(ctx, tid)
	if !errors.Is(err, relay.ErrExpired) {
		t.Fatalf("expected ErrExpired for expired transfer, got: %v", err)
	}
}

func TestDownload_NotFound(t *testing.T) {
	pool := testutil.Pool(t)
	ctx := context.Background()
	svc := relay.NewService(pool)

	_, err := svc.Download(ctx, "00000000-0000-0000-0000-000000000000")
	if !errors.Is(err, relay.ErrNotFound) {
		t.Fatalf("expected ErrNotFound for unknown ID, got: %v", err)
	}
}

func TestDownload_AlreadyUsed(t *testing.T) {
	pool := testutil.Pool(t)
	ctx := context.Background()
	svc := relay.NewService(pool)

	result, err := svc.Upload(ctx, "bundle", 300)
	if err != nil {
		t.Fatalf("upload: %v", err)
	}
	t.Cleanup(func() {
		pool.Exec(ctx, `DELETE FROM relay_transfers WHERE id = $1`, result.TransferID) //nolint:errcheck
	})

	// First download succeeds
	if _, err := svc.Download(ctx, result.TransferID); err != nil {
		t.Fatalf("first download failed: %v", err)
	}
	// Second download must return ErrUsed
	if _, err := svc.Download(ctx, result.TransferID); !errors.Is(err, relay.ErrUsed) {
		t.Fatalf("expected ErrUsed on second download, got: %v", err)
	}
}
