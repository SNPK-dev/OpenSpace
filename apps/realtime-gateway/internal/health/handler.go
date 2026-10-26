package health

import (
	"context"
	"encoding/json"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
)

func Live(w http.ResponseWriter, _ *http.Request) {
	json.NewEncoder(w).Encode(map[string]string{"status": "live"})
} //nolint:errcheck
func Ready(db *pgxpool.Pool, redis *redis.Client) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
		defer cancel()
		failed := []string{}
		if err := db.Ping(ctx); err != nil {
			failed = append(failed, "postgres")
		}
		if err := redis.Ping(ctx).Err(); err != nil {
			failed = append(failed, "redis")
		}
		w.Header().Set("Content-Type", "application/json")
		if len(failed) > 0 {
			w.WriteHeader(http.StatusServiceUnavailable)
			json.NewEncoder(w).Encode(map[string]any{"status": "not_ready", "dependencies": failed})
			return
		}
		json.NewEncoder(w).Encode(map[string]string{"status": "ready"}) //nolint:errcheck
	}
}
