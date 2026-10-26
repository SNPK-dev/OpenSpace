package ratelimit

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"github.com/redis/go-redis/v9"
)

type Limiter struct {
	rdb      *redis.Client
	disabled bool
}

func New(rdb *redis.Client, disabled bool) *Limiter {
	return &Limiter{rdb: rdb, disabled: disabled}
}

// Allow returns true if the request is within the rate limit.
// On Redis error it fails open so a Redis blip never blocks users.
func (l *Limiter) Allow(ctx context.Context, tag, identifier string, limit int64) bool {
	if l.disabled {
		return true
	}

	bucket := time.Now().Unix() / 60
	key := fmt.Sprintf("rl:%s:%s:%d", tag, identifier, bucket)

	n, err := l.rdb.Incr(ctx, key).Result()
	if err != nil {
		slog.Warn("ratelimit: redis error", "tag", tag, "error", err)
		return true
	}
	if n == 1 {
		l.rdb.Expire(ctx, key, 60*time.Second) //nolint:errcheck
	}
	return n <= limit
}
