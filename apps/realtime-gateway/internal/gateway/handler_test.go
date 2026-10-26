package gateway

import (
	"context"
	"net/http/httptest"
	"testing"

	"github.com/redis/go-redis/v9"
)

type fakeTicketStore struct{ values []string }

func (f *fakeTicketStore) GetDel(_ context.Context, _ string) *redis.StringCmd {
	if len(f.values) == 0 {
		return redis.NewStringResult("", redis.Nil)
	}
	value := f.values[0]
	f.values = f.values[1:]
	return redis.NewStringResult(value, nil)
}

func TestOriginAllowlist(t *testing.T) {
	h := &Handler{allowedOrigins: normalizeOrigins([]string{"https://chat.example.com", "file://"})}
	for _, tc := range []struct {
		origin string
		want   bool
	}{
		{"", true}, {"https://chat.example.com", true}, {"https://chat.example.com/ignored", false},
		{"file://", true}, {"https://evil.example", false}, {"null", false},
	} {
		r := httptest.NewRequest("GET", "/ws", nil)
		if tc.origin != "" {
			r.Header.Set("Origin", tc.origin)
		}
		if got := h.originAllowed(r); got != tc.want {
			t.Errorf("origin %q: got %v want %v", tc.origin, got, tc.want)
		}
	}
}

func TestTicketComesFromSubprotocolNotURL(t *testing.T) {
	r := httptest.NewRequest("GET", "/ws?token=secret", nil)
	r.Header.Set("Sec-WebSocket-Protocol", "openspace.v1, ticket.0123456789abcdef")
	if got := ticketFromProtocols(r); got != "0123456789abcdef" {
		t.Fatalf("ticket = %q", got)
	}
	if r.URL.Query().Get("token") == "" {
		t.Fatal("test setup missing legacy token")
	}
}

func TestTicketIsConsumedOnce(t *testing.T) {
	ticket := "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
	store := &fakeTicketStore{values: []string{`{"identity_id":"identity-1","server_id":"server-1"}`}}
	h := &Handler{tickets: store}
	ident, err := h.consumeTicket(context.Background(), ticket)
	if err != nil || ident.ID != "identity-1" || ident.ServerID != "server-1" {
		t.Fatalf("first consume: ident=%+v err=%v", ident, err)
	}
	if _, err := h.consumeTicket(context.Background(), ticket); err == nil {
		t.Fatal("replayed ticket was accepted")
	}
}

func TestTicketRejectsMalformedExpiredAndInvalidClaims(t *testing.T) {
	h := &Handler{tickets: &fakeTicketStore{values: []string{`{}`}}}
	if _, err := h.consumeTicket(context.Background(), "not-hex"); err == nil {
		t.Fatal("malformed ticket accepted")
	}
	ticket := "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
	if _, err := h.consumeTicket(context.Background(), ticket); err == nil {
		t.Fatal("invalid claims accepted")
	}
	if _, err := h.consumeTicket(context.Background(), ticket); err == nil {
		t.Fatal("expired ticket accepted")
	}
}
