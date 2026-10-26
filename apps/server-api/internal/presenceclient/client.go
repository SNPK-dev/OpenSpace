package presenceclient

import (
	"context"

	"github.com/redis/go-redis/v9"
)

type Client struct {
	rdb *redis.Client
}

func New(rdb *redis.Client) *Client {
	return &Client{rdb: rdb}
}

func (c *Client) Online(ctx context.Context, serverID string) ([]string, error) {
	members, err := c.rdb.SMembers(ctx, "online:"+serverID).Result()
	if err == redis.Nil {
		return []string{}, nil
	}
	if err != nil {
		return nil, err
	}
	if members == nil {
		return []string{}, nil
	}
	return members, nil
}
