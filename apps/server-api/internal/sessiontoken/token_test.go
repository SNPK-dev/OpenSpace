package sessiontoken

import "testing"

func TestNewAndDigest(t *testing.T) {
	first, err := New()
	if err != nil {
		t.Fatal(err)
	}
	second, err := New()
	if err != nil {
		t.Fatal(err)
	}
	if !Valid(first) || !Valid(second) {
		t.Fatal("generated token is invalid")
	}
	if first == second {
		t.Fatal("tokens are not unique")
	}
	if digest := Digest(first); len(digest) != EncodedLength || digest == first {
		t.Fatalf("invalid digest %q", digest)
	}
}

func TestValidRejectsNonCanonicalTokens(t *testing.T) {
	for _, token := range []string{"", "abc", "G123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"} {
		if Valid(token) {
			t.Fatalf("accepted %q", token)
		}
	}
}
