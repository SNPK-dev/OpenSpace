package presence

import (
	"context"
	"fmt"

	"github.com/redis/go-redis/v9"
)

type Service struct {
	rdb *redis.Client
}

func NewService(rdb *redis.Client) *Service {
	return &Service{rdb: rdb}
}

func key(serverID string) string {
	return fmt.Sprintf("online:%s", serverID)
}

func (s *Service) Add(ctx context.Context, serverID, identityID string) error {
	return s.rdb.SAdd(ctx, key(serverID), identityID).Err()
}

func (s *Service) Remove(ctx context.Context, serverID, identityID string) error {
	return s.rdb.SRem(ctx, key(serverID), identityID).Err()
}

func (s *Service) Members(ctx context.Context, serverID string) ([]string, error) {
	members, err := s.rdb.SMembers(ctx, key(serverID)).Result()
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

func (s *Service) ClearAll(ctx context.Context) error {
	var cursor uint64
	for {
		keys, next, err := s.rdb.Scan(ctx, cursor, "online:*", 100).Result()
		if err != nil {
			return fmt.Errorf("scan presence keys: %w", err)
		}
		if len(keys) > 0 {
			if err := s.rdb.Del(ctx, keys...).Err(); err != nil {
				return fmt.Errorf("del presence keys: %w", err)
			}
		}
		cursor = next
		if cursor == 0 {
			break
		}
	}
	return nil
}
