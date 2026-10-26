package wsticket

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"time"

	"github.com/redis/go-redis/v9"
)

const TTL = 30 * time.Second

type ticketStore interface {
	SetNX(context.Context, string, interface{}, time.Duration) *redis.BoolCmd
}

type Service struct{ store ticketStore }

type claims struct {
	IdentityID string `json:"identity_id"`
	ServerID   string `json:"server_id"`
}

func NewService(rdb *redis.Client) *Service { return &Service{store: rdb} }

func (s *Service) Issue(ctx context.Context, identityID, serverID string) (string, error) {
	if identityID == "" || serverID == "" {
		return "", fmt.Errorf("invalid ticket claims")
	}
	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		return "", fmt.Errorf("generate ticket: %w", err)
	}
	ticket := hex.EncodeToString(raw)
	digest := sha256.Sum256([]byte(ticket))
	payload, err := json.Marshal(claims{IdentityID: identityID, ServerID: serverID})
	if err != nil {
		return "", fmt.Errorf("encode claims: %w", err)
	}
	stored, err := s.store.SetNX(ctx, "ws:ticket:"+hex.EncodeToString(digest[:]), payload, TTL).Result()
	if err != nil {
		return "", fmt.Errorf("store ticket: %w", err)
	}
	if !stored {
		return "", fmt.Errorf("ticket collision")
	}
	return ticket, nil
}
