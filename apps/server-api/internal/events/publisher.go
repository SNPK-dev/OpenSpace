package events

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/redis/go-redis/v9"
)

type Publisher struct {
	rdb *redis.Client
}

func NewPublisher(rdb *redis.Client) *Publisher {
	return &Publisher{rdb: rdb}
}

func (p *Publisher) Publish(ctx context.Context, serverID string, event any) error {
	b, err := json.Marshal(event)
	if err != nil {
		return fmt.Errorf("marshal event: %w", err)
	}
	return p.rdb.Publish(ctx, fmt.Sprintf("events:%s", serverID), string(b)).Err()
}
