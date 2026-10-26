package cryptoutil

import (
	"crypto/ecdsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"errors"
	"fmt"
	"math/big"
)

// VerifyECDSA verifies a P-256 ECDSA signature.
// publicKey: base64url-encoded SPKI (WebCrypto exportKey("spki")).
// nonce:     the challenge string that was signed.
// signature: base64url-encoded raw r||s (64 bytes, IEEE P1363 format from WebCrypto sign()).
func VerifyECDSA(publicKeyB64, nonce, signatureB64 string) error {
	pkBytes, err := base64.RawURLEncoding.DecodeString(publicKeyB64)
	if err != nil {
		return fmt.Errorf("decode public key: %w", err)
	}
	pub, err := x509.ParsePKIXPublicKey(pkBytes)
	if err != nil {
		return fmt.Errorf("parse public key: %w", err)
	}
	ecPub, ok := pub.(*ecdsa.PublicKey)
	if !ok {
		return errors.New("not an ECDSA public key")
	}

	sigBytes, err := base64.RawURLEncoding.DecodeString(signatureB64)
	if err != nil {
		return fmt.Errorf("decode signature: %w", err)
	}
	if len(sigBytes) != 64 {
		return errors.New("invalid signature length, expected 64 bytes (P-256 r||s)")
	}

	r := new(big.Int).SetBytes(sigBytes[:32])
	s := new(big.Int).SetBytes(sigBytes[32:])

	hash := sha256.Sum256([]byte(nonce))
	if !ecdsa.Verify(ecPub, hash[:], r, s) {
		return errors.New("signature verification failed")
	}
	return nil
}
