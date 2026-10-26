package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"

	"openspace/realtime-gateway/internal/config"
	"openspace/realtime-gateway/internal/gateway"
	"openspace/realtime-gateway/internal/health"
	"openspace/realtime-gateway/internal/hub"
	"openspace/realtime-gateway/internal/presence"
)

func main() {
	setupLogger()

	cfg, err := config.Load()
	if err != nil {
		slog.Error("config error", "error", err)
		os.Exit(1)
	}

	ctx := context.Background()

	pool, err := pgxpool.New(ctx, cfg.DatabaseURL)
	if err != nil {
		slog.Error("database connection failed", "error", err)
		os.Exit(1)
	}
	defer pool.Close()

	opts, err := redis.ParseURL(cfg.RedisURL)
	if err != nil {
		slog.Error("redis url parse failed", "error", err)
		os.Exit(1)
	}
	rdb := redis.NewClient(opts)
	defer rdb.Close()

	if err := rdb.Ping(ctx).Err(); err != nil {
		slog.Error("redis ping failed", "error", err)
		os.Exit(1)
	}

	presenceSvc := presence.NewService(rdb)
	if err := presenceSvc.ClearAll(ctx); err != nil {
		slog.Error("clear presence failed", "error", err)
	}

	// Warn if more than one server row exists — clients on different server_id
	// values are in separate hub buckets and will not receive each other's events.
	var serverCount int
	if err := pool.QueryRow(ctx, `SELECT COUNT(*) FROM servers`).Scan(&serverCount); err == nil && serverCount > 1 {
		slog.Error("CRITICAL: multiple server rows detected — cross-client real-time messaging broken",
			"count", serverCount)
	}

	h := hub.New()
	go h.Run()

	go subscribeEvents(ctx, rdb, h)

	gatewayH := gateway.NewHandler(h, presenceSvc, rdb, cfg.AllowedOrigins)

	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", health.Live)
	mux.HandleFunc("GET /livez", health.Live)
	mux.HandleFunc("GET /readyz", health.Ready(pool, rdb))
	mux.HandleFunc("GET /metrics", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "text/plain; version=0.0.4")
		connected, connections, disconnects, broadcasts, drops := h.Stats()
		fmt.Fprintf(w, "# TYPE openspace_websocket_connections gauge\nopenspace_websocket_connections %d\n# TYPE openspace_websocket_connections_total counter\nopenspace_websocket_connections_total %d\nopenspace_websocket_disconnects_total %d\nopenspace_websocket_broadcasts_total %d\nopenspace_websocket_queue_drops_total %d\n", connected, connections, disconnects, broadcasts, drops)
	})
	mux.HandleFunc("GET /ws", gatewayH.Connect)

	srv := &http.Server{
		Addr:         fmt.Sprintf(":%s", cfg.Port),
		Handler:      mux,
		ReadTimeout:  70 * time.Second,
		WriteTimeout: 70 * time.Second,
		IdleTimeout:  120 * time.Second,
	}

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)

	go func() {
		slog.Info("gateway starting", "addr", srv.Addr)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			slog.Error("gateway error", "error", err)
			os.Exit(1)
		}
	}()

	<-quit
	slog.Info("shutting down")

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	srv.Shutdown(shutdownCtx) //nolint:errcheck
}

func subscribeEvents(ctx context.Context, rdb *redis.Client, h *hub.Hub) {
	pubsub := rdb.PSubscribe(ctx, "events:*")
	defer pubsub.Close()

	ch := pubsub.Channel()
	for msg := range ch {
		serverID := strings.TrimPrefix(msg.Channel, "events:")
		h.Broadcast <- hub.BroadcastMsg{
			ServerID: serverID,
			Payload:  []byte(msg.Payload),
		}
	}
}

func setupLogger() {
	level := slog.LevelInfo
	if os.Getenv("LOG_LEVEL") == "debug" {
		level = slog.LevelDebug
	}
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: level})))
}
