package room

import "testing"

func TestNormalizeDefaultRoomName(t *testing.T) {
	if got := NormalizeDefaultRoomName(""); got != "general" {
		t.Fatalf("empty default room name = %q, want general", got)
	}
	if got := NormalizeDefaultRoomName("party-1"); got != "party-1" {
		t.Fatalf("explicit default room name = %q, want party-1", got)
	}
}
