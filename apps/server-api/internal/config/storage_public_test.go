package config

import (
	"strings"
	"testing"
)

func TestProductionStorageRequiresPublicTLSEndpoint(t *testing.T) {
	t.Setenv("DATABASE_URL", "postgres://example")
	t.Setenv("APP_ENV", "production")
	t.Setenv("REDIS_URL", "redis://redis:6379")
	t.Setenv("REDIS_TRUST_BOUNDARY", "compose-internal")
	t.Setenv("STORAGE_PUBLIC_ENDPOINT", "")
	t.Setenv("STORAGE_PUBLIC_USE_SSL", "false")
	if _, err := Load(); err == nil || !strings.Contains(err.Error(), "STORAGE_PUBLIC_ENDPOINT") {
		t.Fatalf("expected public storage endpoint error, got %v", err)
	}

	t.Setenv("STORAGE_PUBLIC_ENDPOINT", "files.example.com")
	if _, err := Load(); err == nil || !strings.Contains(err.Error(), "STORAGE_PUBLIC_USE_SSL") {
		t.Fatalf("expected public storage TLS error, got %v", err)
	}

	t.Setenv("STORAGE_PUBLIC_USE_SSL", "true")
	cfg, err := Load()
	if err != nil {
		t.Fatalf("valid public storage config rejected: %v", err)
	}
	if cfg.StoragePublicEndpoint != "files.example.com" || !cfg.StoragePublicUseSSL {
		t.Fatalf("unexpected public storage config: %#v", cfg)
	}
}
