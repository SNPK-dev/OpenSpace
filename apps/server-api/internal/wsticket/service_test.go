package wsticket

import (
	"context"
	"encoding/hex"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/redis/go-redis/v9"
)

type fakeStore struct {
	key    string
	value  interface{}
	ttl    time.Duration
	result bool
	err    error
}

func TestIssueFailsClosedWhenRedisFails(t *testing.T) {
	service := &Service{store: &fakeStore{err: errors.New("redis unavailable")}}
	if _, err := service.Issue(context.Background(), "identity-1", "server-1"); err == nil {
		t.Fatal("expected error")
	}
}

func (f *fakeStore) SetNX(_ context.Context, key string, value interface{}, ttl time.Duration) *redis.BoolCmd {
	f.key, f.value, f.ttl = key, value, ttl
	return redis.NewBoolResult(f.result, f.err)
}

func TestIssueStoresHashedSingleUseTicketClaims(t *testing.T) {
	store := &fakeStore{result: true}
	service := &Service{store: store}
	ticket, err := service.Issue(context.Background(), "identity-1", "server-1")
	if err != nil {
		t.Fatal(err)
	}
	if len(ticket) != 64 {
		t.Fatalf("ticket length = %d", len(ticket))
	}
	if _, err := hex.DecodeString(ticket); err != nil {
		t.Fatalf("ticket is not hex: %v", err)
	}
	if store.ttl != TTL {
		t.Fatalf("ttl = %s", store.ttl)
	}
	if strings.Contains(store.key, ticket) {
		t.Fatal("redis key contains raw ticket")
	}
	payload := string(store.value.([]byte))
	if !strings.Contains(payload, `"identity_id":"identity-1"`) || !strings.Contains(payload, `"server_id":"server-1"`) {
		t.Fatalf("unexpected claims: %s", payload)
	}
}

func TestIssueRejectsMissingClaims(t *testing.T) {
	service := &Service{store: &fakeStore{result: true}}
	if _, err := service.Issue(context.Background(), "", "server-1"); err == nil {
		t.Fatal("expected error")
	}
}
