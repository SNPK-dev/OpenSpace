package sessiontoken

import (
	"encoding/hex"
	"testing"
)

func FuzzValid(f *testing.F) {
	f.Add("")
	f.Add("0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef")
	f.Add("../../../../../../../../etc/passwd")
	f.Fuzz(func(t *testing.T, token string) {
		valid := Valid(token)
		decoded, err := hex.DecodeString(token)
		want := len(token) == EncodedLength && err == nil && len(decoded) == 32
		if valid != want {
			t.Fatalf("Valid(%q)=%v want %v", token, valid, want)
		}
		if len(Digest(token)) != 64 {
			t.Fatal("digest must remain fixed length")
		}
	})
}
