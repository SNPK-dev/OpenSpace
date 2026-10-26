package cryptoutil_test

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"math/big"
	"testing"

	"openspace/server-api/internal/cryptoutil"
)

// generateTestKey creates a P-256 keypair for tests.
func generateTestKey(t *testing.T) *ecdsa.PrivateKey {
	t.Helper()
	priv, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		t.Fatalf("generate key: %v", err)
	}
	return priv
}

// spkiBase64URL encodes the public key as base64url SPKI (matches WebCrypto exportKey("spki")).
func spkiBase64URL(t *testing.T, pub *ecdsa.PublicKey) string {
	t.Helper()
	import_x509 := func() []byte {
		// SPKI DER for P-256: fixed header + uncompressed point
		header := []byte{
			0x30, 0x59, // SEQUENCE
			0x30, 0x13, // SEQUENCE (AlgorithmIdentifier)
			0x06, 0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01, // OID ecPublicKey
			0x06, 0x08, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x03, 0x01, 0x07, // OID P-256
			0x03, 0x42, 0x00, 0x04, // BIT STRING, uncompressed
		}
		x := pub.X.Bytes()
		y := pub.Y.Bytes()
		// Pad to 32 bytes
		xPad := make([]byte, 32)
		yPad := make([]byte, 32)
		copy(xPad[32-len(x):], x)
		copy(yPad[32-len(y):], y)
		return append(header, append(xPad, yPad...)...)
	}
	return base64.RawURLEncoding.EncodeToString(import_x509())
}

// signPayload signs a JSON-marshalled payload using P-256 ECDSA, returns base64url r||s (IEEE P1363).
// json.Marshal(map) sorts keys alphabetically, matching what Go's server expects.
func signPayload(t *testing.T, priv *ecdsa.PrivateKey, payload map[string]string) string {
	t.Helper()
	msg, err := json.Marshal(payload)
	if err != nil {
		t.Fatalf("marshal payload: %v", err)
	}
	hash := sha256.Sum256(msg)
	r, s, err := ecdsa.Sign(rand.Reader, priv, hash[:])
	if err != nil {
		t.Fatalf("sign: %v", err)
	}
	rBytes := r.Bytes()
	sBytes := s.Bytes()
	sig := make([]byte, 64)
	copy(sig[32-len(rBytes):32], rBytes)
	copy(sig[64-len(sBytes):64], sBytes)
	return base64.RawURLEncoding.EncodeToString(sig)
}

// signRawBytes signs an arbitrary byte slice (used to simulate a client with non-sorted JSON).
func signRawBytes(t *testing.T, priv *ecdsa.PrivateKey, msg []byte) string {
	t.Helper()
	hash := sha256.Sum256(msg)
	r, s, err := ecdsa.Sign(rand.Reader, priv, hash[:])
	if err != nil {
		t.Fatalf("sign: %v", err)
	}
	rBytes := r.Bytes()
	sBytes := s.Bytes()
	sig := make([]byte, 64)
	copy(sig[32-len(rBytes):32], rBytes)
	copy(sig[64-len(sBytes):64], sBytes)
	return base64.RawURLEncoding.EncodeToString(sig)
}

func testRegistrationPayload(serverID, challengeID, nonce, pubKeyB64 string) map[string]string {
	return map[string]string{
		"op":                "device_registration",
		"server_id":         serverID,
		"challenge_id":      challengeID,
		"nonce":             nonce,
		"device_public_key": pubKeyB64,
		"client_type":       "web",
		"expires_at":        "2026-05-19T12:05:00Z",
	}
}

func testRedeemPayload(serverID, challengeID, nonce, pubKeyB64 string) map[string]string {
	return map[string]string{
		"op":                "device_pairing_redeem",
		"server_id":         serverID,
		"challenge_id":      challengeID,
		"nonce":             nonce,
		"device_public_key": pubKeyB64,
		"client_type":       "web",
		"expires_at":        "2026-05-19T12:05:00Z",
	}
}

func TestVerifyECDSA_ValidRegistrationPayload(t *testing.T) {
	priv := generateTestKey(t)
	pubB64 := spkiBase64URL(t, &priv.PublicKey)
	payload := testRegistrationPayload("server-123", "chal-456", "nonce-abc", pubB64)
	msg, _ := json.Marshal(payload)
	sig := signPayload(t, priv, payload)

	if err := cryptoutil.VerifyECDSA(pubB64, string(msg), sig); err != nil {
		t.Fatalf("valid signature should pass: %v", err)
	}
}

func TestVerifyECDSA_ValidRedeemPayload(t *testing.T) {
	priv := generateTestKey(t)
	pubB64 := spkiBase64URL(t, &priv.PublicKey)
	payload := testRedeemPayload("server-123", "chal-456", "nonce-abc", pubB64)
	msg, _ := json.Marshal(payload)
	sig := signPayload(t, priv, payload)

	if err := cryptoutil.VerifyECDSA(pubB64, string(msg), sig); err != nil {
		t.Fatalf("valid redeem signature should pass: %v", err)
	}
}

func TestVerifyECDSA_WrongOp_CannotCrossComplete(t *testing.T) {
	priv := generateTestKey(t)
	pubB64 := spkiBase64URL(t, &priv.PublicKey)

	// Client signed a registration payload
	regPayload := testRegistrationPayload("server-123", "chal-456", "nonce-abc", pubB64)
	regSig := signPayload(t, priv, regPayload)

	// Attacker tries to use it to complete a redeem challenge
	redeemPayload := testRedeemPayload("server-123", "chal-456", "nonce-abc", pubB64)
	redeemMsg, _ := json.Marshal(redeemPayload)

	if err := cryptoutil.VerifyECDSA(pubB64, string(redeemMsg), regSig); err == nil {
		t.Fatal("registration signature must NOT verify a redeem payload")
	}
}

func TestVerifyECDSA_TamperedServerID_Fails(t *testing.T) {
	priv := generateTestKey(t)
	pubB64 := spkiBase64URL(t, &priv.PublicKey)
	payload := testRegistrationPayload("server-123", "chal-456", "nonce-abc", pubB64)
	sig := signPayload(t, priv, payload)

	// Attacker swaps server_id
	payload["server_id"] = "attacker-server"
	tamperedMsg, _ := json.Marshal(payload)

	if err := cryptoutil.VerifyECDSA(pubB64, string(tamperedMsg), sig); err == nil {
		t.Fatal("tampered server_id must cause signature failure")
	}
}

func TestVerifyECDSA_TamperedClientType_Fails(t *testing.T) {
	priv := generateTestKey(t)
	pubB64 := spkiBase64URL(t, &priv.PublicKey)
	payload := testRegistrationPayload("server-123", "chal-456", "nonce-abc", pubB64)
	sig := signPayload(t, priv, payload)

	payload["client_type"] = "windows"
	tamperedMsg, _ := json.Marshal(payload)

	if err := cryptoutil.VerifyECDSA(pubB64, string(tamperedMsg), sig); err == nil {
		t.Fatal("tampered client_type must cause signature failure")
	}
}

func TestVerifyECDSA_DifferentPublicKey_Fails(t *testing.T) {
	priv1 := generateTestKey(t)
	priv2 := generateTestKey(t)
	pub1B64 := spkiBase64URL(t, &priv1.PublicKey)
	pub2B64 := spkiBase64URL(t, &priv2.PublicKey)

	payload := testRegistrationPayload("server-123", "chal-456", "nonce-abc", pub1B64)
	msg, _ := json.Marshal(payload)
	// Signed by key1 but verified against key2
	sig := signPayload(t, priv1, payload)

	if err := cryptoutil.VerifyECDSA(pub2B64, string(msg), sig); err == nil {
		t.Fatal("signature by key1 must not verify with key2")
	}
}

func TestVerifyECDSA_TamperedSignature_Fails(t *testing.T) {
	priv := generateTestKey(t)
	pubB64 := spkiBase64URL(t, &priv.PublicKey)
	payload := testRegistrationPayload("server-123", "chal-456", "nonce-abc", pubB64)
	msg, _ := json.Marshal(payload)
	sig := signPayload(t, priv, payload)

	// Flip a bit in the middle of the signature
	sigBytes, _ := base64.RawURLEncoding.DecodeString(sig)
	sigBytes[32] ^= 0x01
	badSig := base64.RawURLEncoding.EncodeToString(sigBytes)

	if err := cryptoutil.VerifyECDSA(pubB64, string(msg), badSig); err == nil {
		t.Fatal("tampered signature must fail verification")
	}
}

func TestVerifyECDSA_InvalidBase64PublicKey_Fails(t *testing.T) {
	if err := cryptoutil.VerifyECDSA("not-valid-base64!!!", "payload", "sig"); err == nil {
		t.Fatal("invalid base64 public key must return error")
	}
}

func TestVerifyECDSA_ShortSignature_Fails(t *testing.T) {
	priv := generateTestKey(t)
	pubB64 := spkiBase64URL(t, &priv.PublicKey)
	shortSig := base64.RawURLEncoding.EncodeToString([]byte("too-short"))

	if err := cryptoutil.VerifyECDSA(pubB64, "payload", shortSig); err == nil {
		t.Fatal("short signature (not 64 bytes) must return error")
	}
}

func TestVerifyECDSA_ZeroSignature_Fails(t *testing.T) {
	priv := generateTestKey(t)
	pubB64 := spkiBase64URL(t, &priv.PublicKey)
	zeroSig := base64.RawURLEncoding.EncodeToString(make([]byte, 64))

	if err := cryptoutil.VerifyECDSA(pubB64, "payload", zeroSig); err == nil {
		t.Fatal("all-zero signature must fail verification")
	}
}

// Ensure the signature is not trivially r=1,s=1 style exploits.
func TestVerifyECDSA_UnitSignatureComponents_Fails(t *testing.T) {
	priv := generateTestKey(t)
	pubB64 := spkiBase64URL(t, &priv.PublicKey)

	sig := make([]byte, 64)
	// r=1, s=1
	sig[31] = 1
	sig[63] = 1
	unitSig := base64.RawURLEncoding.EncodeToString(sig)

	// Craft payload so ecdsa.Verify(pub, hash, r=1, s=1) would need to hold (it won't)
	payload := testRegistrationPayload("server-123", "chal-456", "nonce", pubB64)
	msg, _ := json.Marshal(payload)
	_ = new(big.Int) // just to reference math/big import

	if err := cryptoutil.VerifyECDSA(pubB64, string(msg), unitSig); err == nil {
		t.Fatal("unit r||s signature must fail on real payload")
	}
}

// ──────────────────────────────────────────────────────────────────────────────
// Key-ordering regression tests
//
// Root cause of the invalid_signature bug:
//   Go's json.Marshal(map[string]string{}) sorts keys alphabetically.
//   The old JS client used JSON.stringify with insertion order, producing
//   different bytes → sha256 mismatch → ECDSA verification failure.
//
//   Fix: JS client now sorts keys before JSON.stringify (matching Go's output).
// ──────────────────────────────────────────────────────────────────────────────

// TestKeyOrdering_UnsortedClientJSON_FailsVerification proves that signing a
// payload with keys in JS insertion order fails verification against the same
// payload re-marshalled by Go (which sorts alphabetically).
func TestKeyOrdering_UnsortedClientJSON_FailsVerification(t *testing.T) {
	priv := generateTestKey(t)
	pubB64 := spkiBase64URL(t, &priv.PublicKey)

	// Simulate what the OLD buggy JS client sent (insertion order, not sorted):
	// op, server_id, challenge_id, nonce, device_public_key, client_type, expires_at
	unsortedJSON := `{"op":"device_registration","server_id":"srv-1","challenge_id":"chal-1","nonce":"nonce-1","device_public_key":"` + pubB64 + `","client_type":"windows","expires_at":"2026-05-19T12:00:00Z"}`

	sig := signRawBytes(t, priv, []byte(unsortedJSON))

	// Server re-marshals via json.Marshal(map) which sorts alphabetically:
	// challenge_id, client_type, device_public_key, expires_at, nonce, op, server_id
	sortedPayload := map[string]string{
		"op":                "device_registration",
		"server_id":         "srv-1",
		"challenge_id":      "chal-1",
		"nonce":             "nonce-1",
		"device_public_key": pubB64,
		"client_type":       "windows",
		"expires_at":        "2026-05-19T12:00:00Z",
	}
	sortedJSON, _ := json.Marshal(sortedPayload)

	if err := cryptoutil.VerifyECDSA(pubB64, string(sortedJSON), sig); err == nil {
		t.Fatal("unsorted-key signature must NOT verify against sorted JSON — this would be the old bug")
	}
}

// TestKeyOrdering_SortedClientJSON_PassesVerification proves that signing the
// same payload with alphabetically-sorted keys (the fix) passes verification.
func TestKeyOrdering_SortedClientJSON_PassesVerification(t *testing.T) {
	priv := generateTestKey(t)
	pubB64 := spkiBase64URL(t, &priv.PublicKey)

	// Go's json.Marshal sorts map keys alphabetically:
	// challenge_id, client_type, device_public_key, expires_at, nonce, op, server_id
	payload := map[string]string{
		"op":                "device_registration",
		"server_id":         "srv-1",
		"challenge_id":      "chal-1",
		"nonce":             "nonce-1",
		"device_public_key": pubB64,
		"client_type":       "windows",
		"expires_at":        "2026-05-19T12:00:00Z",
	}
	sortedJSON, _ := json.Marshal(payload)

	// Client signs sorted JSON (matches Go's output after the fix)
	sig := signRawBytes(t, priv, sortedJSON)

	if err := cryptoutil.VerifyECDSA(pubB64, string(sortedJSON), sig); err != nil {
		t.Fatalf("sorted-key signature must verify: %v", err)
	}
}

// TestKeyOrdering_AlphabeticOrderConfirmed checks that Go's map marshalling
// actually produces alphabetically-sorted keys, so we can rely on it.
func TestKeyOrdering_AlphabeticOrderConfirmed(t *testing.T) {
	payload := map[string]string{
		"op":                "device_registration",
		"server_id":         "s",
		"challenge_id":      "c",
		"nonce":             "n",
		"device_public_key": "p",
		"client_type":       "web",
		"expires_at":        "e",
	}
	got, _ := json.Marshal(payload)
	want := `{"challenge_id":"c","client_type":"web","device_public_key":"p","expires_at":"e","nonce":"n","op":"device_registration","server_id":"s"}`
	if string(got) != want {
		t.Fatalf("expected sorted JSON\n got:  %s\n want: %s", got, want)
	}
}
