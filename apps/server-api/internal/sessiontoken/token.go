package sessiontoken

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
)

const EncodedLength = 64

func New() (string, error) {
	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		return "", err
	}
	return hex.EncodeToString(raw), nil
}

func Valid(token string) bool {
	if len(token) != EncodedLength {
		return false
	}
	_, err := hex.DecodeString(token)
	return err == nil
}

func Digest(token string) string {
	digest := sha256.Sum256([]byte(token))
	return hex.EncodeToString(digest[:])
}
