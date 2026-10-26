package config

import "testing"

func TestValidateProductionRedis(t *testing.T) {
	tests := []struct {
		name, url, boundary string
		ok                  bool
	}{
		{"bundled", "redis://redis:6379", "compose-internal", true},
		{"public plaintext", "redis://cache.example.test:6379", "", false},
		{"tls without acl", "rediss://cache.example.test:6379", "", false},
		{"external secure", "rediss://openspace:secret@cache.example.test:6380", "", true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := validateProductionRedis(tt.url, tt.boundary); (got == nil) != tt.ok {
				t.Fatalf("error=%v ok=%v", got, tt.ok)
			}
		})
	}
}
