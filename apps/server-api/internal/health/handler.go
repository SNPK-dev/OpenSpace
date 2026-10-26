package health

import (
	"context"
	"encoding/json"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
)

type BootstrapChecker interface {
	IsBootstrapped(context.Context) (bool, error)
}
type StorageChecker interface{ Ping(context.Context) error }
type Handler struct {
	bootstrap BootstrapChecker
	db        *pgxpool.Pool
	redis     *redis.Client
	storage   StorageChecker
}

func NewHandler(bootstrap BootstrapChecker, db *pgxpool.Pool, redis *redis.Client, storage StorageChecker) *Handler {
	return &Handler{bootstrap: bootstrap, db: db, redis: redis, storage: storage}
}
func Live(w http.ResponseWriter, _ *http.Request) {
	write(w, http.StatusOK, map[string]any{"status": "live"})
}
func (h *Handler) Health(w http.ResponseWriter, r *http.Request) {
	bootstrapped, _ := h.bootstrap.IsBootstrapped(r.Context())
	write(w, http.StatusOK, map[string]any{"status": "ok", "bootstrapped": bootstrapped})
}
func (h *Handler) Ready(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
	defer cancel()
	failed := []string{}
	if err := h.db.Ping(ctx); err != nil {
		failed = append(failed, "postgres")
	}
	if err := h.redis.Ping(ctx).Err(); err != nil {
		failed = append(failed, "redis")
	}
	if err := h.storage.Ping(ctx); err != nil {
		failed = append(failed, "minio")
	}
	if len(failed) > 0 {
		write(w, http.StatusServiceUnavailable, map[string]any{"status": "not_ready", "dependencies": failed})
		return
	}
	write(w, http.StatusOK, map[string]any{"status": "ready"})
}
func write(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(value)
} //nolint:errcheck
