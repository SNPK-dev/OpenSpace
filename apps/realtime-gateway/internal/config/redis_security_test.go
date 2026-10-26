package config

import "testing"

func TestValidateProductionRedis(t *testing.T) {
	if err := validateProductionRedis("redis://redis:6379", "compose-internal"); err != nil {
		t.Fatal(err)
	}
	if err := validateProductionRedis("redis://outside.example:6379", ""); err == nil {
		t.Fatal("plaintext external Redis accepted")
	}
	if err := validateProductionRedis("rediss://user:password@outside.example:6380", ""); err != nil {
		t.Fatal(err)
	}
}
