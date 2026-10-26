package rtc

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"time"
)

type tokenHeader struct {
	Algorithm string `json:"alg"`
	Type      string `json:"typ"`
}

type videoGrant struct {
	RoomJoin          bool     `json:"roomJoin"`
	Room              string   `json:"room"`
	CanPublish        bool     `json:"canPublish"`
	CanSubscribe      bool     `json:"canSubscribe"`
	CanPublishSources []string `json:"canPublishSources,omitempty"`
}

type tokenClaims struct {
	Issuer    string     `json:"iss"`
	Subject   string     `json:"sub"`
	IssuedAt  int64      `json:"iat"`
	ExpiresAt int64      `json:"exp"`
	Video     videoGrant `json:"video"`
}

func b64url(data []byte) string {
	return base64.RawURLEncoding.EncodeToString(data)
}

// GenerateJoinToken creates a LiveKit HS256 JWT for joining a room.
// sources restricts which track sources the participant may publish; nil/empty = no restriction.
func GenerateJoinToken(apiKey, apiSecret, room, identity string, ttl time.Duration, sources []string) (string, error) {
	now := time.Now()

	hb, err := json.Marshal(tokenHeader{Algorithm: "HS256", Type: "JWT"})
	if err != nil {
		return "", fmt.Errorf("marshal header: %w", err)
	}
	cb, err := json.Marshal(tokenClaims{
		Issuer:    apiKey,
		Subject:   identity,
		IssuedAt:  now.Unix(),
		ExpiresAt: now.Add(ttl).Unix(),
		Video: videoGrant{
			RoomJoin:          true,
			Room:              room,
			CanPublish:        true,
			CanSubscribe:      true,
			CanPublishSources: sources,
		},
	})
	if err != nil {
		return "", fmt.Errorf("marshal claims: %w", err)
	}

	unsigned := b64url(hb) + "." + b64url(cb)
	mac := hmac.New(sha256.New, []byte(apiSecret))
	mac.Write([]byte(unsigned))
	return unsigned + "." + b64url(mac.Sum(nil)), nil
}
