package hub_test

import (
	"sync"
	"testing"
	"time"

	"openspace/realtime-gateway/internal/hub"
)

// fakeConn satisfies the minimal interface the hub uses: it queues bytes into a
// channel instead of writing to a real TCP socket.
type fakeConn struct {
	mu     sync.Mutex
	msgs   []string
	closed bool
}

func (f *fakeConn) record(msg []byte) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.msgs = append(f.msgs, string(msg))
}

func (f *fakeConn) received() []string {
	f.mu.Lock()
	defer f.mu.Unlock()
	cp := make([]string, len(f.msgs))
	copy(cp, f.msgs)
	return cp
}

// drainClient empties the Send channel into fakeConn.msgs via a short goroutine.
func drainClient(c *hub.Client, fc *fakeConn, done <-chan struct{}) {
	go func() {
		for {
			select {
			case msg, ok := <-c.Send:
				if !ok {
					return
				}
				fc.record(msg)
			case <-done:
				return
			}
		}
	}()
}

// newClient creates a hub.Client with a nil Conn — Hub.Run only uses
// c.ServerID and c.Send, never c.Conn, so nil is safe here.
func newClient(h *hub.Hub, serverID string) (*hub.Client, *fakeConn) {
	fc := &fakeConn{}
	c := &hub.Client{
		Hub:        h,
		Conn:       nil,
		Send:       make(chan []byte, 256),
		ServerID:   serverID,
		IdentityID: "test-identity",
	}
	return c, fc
}

// TestHubBroadcastSameServerID verifies that two clients on the same serverID
// both receive a broadcasted message.
func TestHubBroadcastSameServerID(t *testing.T) {
	h := hub.New()
	go h.Run()

	const serverID = "server-a"

	clientA, fcA := newClient(h, serverID)
	clientB, fcB := newClient(h, serverID)

	done := make(chan struct{})
	defer close(done)
	drainClient(clientA, fcA, done)
	drainClient(clientB, fcB, done)

	h.Register(clientA)
	h.Register(clientB)

	// Give Run() goroutine time to process registrations.
	time.Sleep(10 * time.Millisecond)

	payload := []byte(`{"type":"message.created","channel_id":"ch-1"}`)
	h.Broadcast <- hub.BroadcastMsg{ServerID: serverID, Payload: payload}

	time.Sleep(50 * time.Millisecond)

	if got := fcA.received(); len(got) != 1 || got[0] != string(payload) {
		t.Errorf("clientA: expected 1 message %q, got %v", payload, got)
	}
	if got := fcB.received(); len(got) != 1 || got[0] != string(payload) {
		t.Errorf("clientB: expected 1 message %q, got %v", payload, got)
	}
}

// TestHubBroadcastDifferentServerIDs reproduces the cross-client messaging bug:
// when two clients belong to DIFFERENT serverIDs, a message broadcast for
// server-a does NOT reach the client on server-b.
//
// This test FAILS to show the expected cross-delivery, documenting the root
// cause: if a web-client session maps to server-a and a desktop session maps
// to server-b (e.g. after a re-initialised server row in the DB), the desktop's
// message.created event will never reach the web client.
func TestHubBroadcastDifferentServerIDs(t *testing.T) {
	h := hub.New()
	go h.Run()

	clientA, fcA := newClient(h, "server-a")
	clientB, fcB := newClient(h, "server-b")

	done := make(chan struct{})
	defer close(done)
	drainClient(clientA, fcA, done)
	drainClient(clientB, fcB, done)

	h.Register(clientA)
	h.Register(clientB)

	time.Sleep(10 * time.Millisecond)

	// Desktop (server-b) sends a message; event is published for server-b.
	payload := []byte(`{"type":"message.created","channel_id":"ch-1"}`)
	h.Broadcast <- hub.BroadcastMsg{ServerID: "server-b", Payload: payload}

	time.Sleep(50 * time.Millisecond)

	// clientA (web, server-a) must NOT receive the event — this is the bug.
	if got := fcA.received(); len(got) != 0 {
		t.Errorf("clientA (server-a) should not receive server-b event, got %v", got)
	}
	// clientB (desktop, server-b) should receive it.
	if got := fcB.received(); len(got) != 1 {
		t.Errorf("clientB (server-b) expected 1 message, got %v", got)
	}
}
