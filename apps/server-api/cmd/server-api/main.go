package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/redis/go-redis/v9"

	"openspace/server-api/internal/admin"
	"openspace/server-api/internal/attachment"
	"openspace/server-api/internal/audit"
	"openspace/server-api/internal/auth"
	"openspace/server-api/internal/backup"
	"openspace/server-api/internal/bootstrap"
	"openspace/server-api/internal/channel"
	"openspace/server-api/internal/config"
	"openspace/server-api/internal/database"
	"openspace/server-api/internal/device"
	"openspace/server-api/internal/devicereg"
	"openspace/server-api/internal/dm"
	"openspace/server-api/internal/events"
	"openspace/server-api/internal/identity"
	"openspace/server-api/internal/invite"
	"openspace/server-api/internal/message"
	"openspace/server-api/internal/metrics"
	"openspace/server-api/internal/migrate"
	"openspace/server-api/internal/notification"
	"openspace/server-api/internal/presenceclient"
	"openspace/server-api/internal/presencehandler"
	"openspace/server-api/internal/ratelimit"
	"openspace/server-api/internal/redeem"
	"openspace/server-api/internal/relay"
	"openspace/server-api/internal/room"
	"openspace/server-api/internal/rtc"
	"openspace/server-api/internal/search"
	"openspace/server-api/internal/server"
	"openspace/server-api/internal/storage"
	"openspace/server-api/internal/voice"
	"openspace/server-api/internal/wsticket"
)

func main() {
	setupLogger()

	cfg, err := config.Load()
	if err != nil {
		slog.Error("config error", "error", err)
		os.Exit(1)
	}

	ctx := context.Background()

	pool, err := database.New(ctx, cfg.DatabaseURL)
	if err != nil {
		slog.Error("database connection failed", "error", err)
		os.Exit(1)
	}
	defer pool.Close()

	if err := migrate.Run(ctx, pool); err != nil {
		slog.Error("migrations failed", "error", err)
		os.Exit(1)
	}

	// Warn if there are multiple server rows — this causes cross-client
	// real-time messaging to silently fail because events are partitioned by
	// server_id and clients on different rows never receive each other's messages.
	// Fix: remove the extra row(s) so all sessions share a single server_id.
	//   docker compose exec postgres psql -U openspace -c "SELECT id,created_at FROM servers;"
	var serverCount int
	if err := pool.QueryRow(ctx, `SELECT COUNT(*) FROM servers`).Scan(&serverCount); err == nil && serverCount > 1 {
		slog.Error("CRITICAL: multiple server rows detected",
			"count", serverCount,
			"action", "real-time messaging broken between clients on different server rows — run: SELECT id,created_at FROM servers; and delete the orphaned row")
	}

	opts, err := redis.ParseURL(cfg.RedisURL)
	if err != nil {
		slog.Error("redis url parse failed", "error", err)
		os.Exit(1)
	}
	rdb := redis.NewClient(opts)
	defer rdb.Close()

	storageClient, err := storage.NewClient(
		cfg.StorageEndpoint, cfg.StoragePublicEndpoint, cfg.StorageAccess, cfg.StorageSecret,
		cfg.StorageBucket, cfg.StorageUseSSL, cfg.StoragePublicUseSSL,
	)
	if err != nil {
		slog.Error("storage client failed", "error", err)
		os.Exit(1)
	}

	publisher := events.NewPublisher(rdb)
	attachSvc := attachment.NewService(pool, storageClient)
	presClient := presenceclient.New(rdb)
	presH := presencehandler.NewHandler(presClient)
	m := metrics.New()

	voiceSvc := voice.NewService(pool, rdb, publisher, m)
	if err := voiceSvc.ClearAll(ctx); err != nil {
		slog.Warn("voice clearall failed", "error", err)
	}

	reaperCtx, reaperCancel := context.WithCancel(context.Background())
	defer reaperCancel()
	go voiceSvc.StartReaper(reaperCtx)
	go voiceSvc.StartDisconnectListener(reaperCtx)

	rl := ratelimit.New(rdb, cfg.RateDisabled)

	var notifDispatcher notification.Dispatcher = notification.NoOpDispatcher{}
	if cfg.NotificationWebhookURL != "" {
		notifDispatcher = notification.NewWebhookDispatcher(cfg.NotificationWebhookURL)
	}
	notifSvc := notification.NewService(pool, rdb, notifDispatcher)

	notifCtx, notifCancel := context.WithCancel(context.Background())
	defer notifCancel()
	notifSvc.Subscribe(notifCtx)

	var auditServerID string
	_ = pool.QueryRow(ctx, `SELECT id FROM servers LIMIT 1`).Scan(&auditServerID)
	alog := audit.NewLogger(pool, auditServerID)
	adminSvc := admin.NewService(pool)
	if err := adminSvc.LoadPermissionOverrides(ctx); err != nil {
		slog.Error("permission settings load failed", "error", err)
		os.Exit(1)
	}

	srv := server.New(cfg.Port, server.Services{
		DB:           pool,
		Redis:        rdb,
		Storage:      storageClient,
		Bootstrap:    bootstrap.NewService(pool, cfg.SessionTTLDays),
		Auth:         auth.NewService(pool, cfg.SessionTTLDays),
		AuthMiddle:   auth.NewMiddleware(pool),
		Identity:     identity.NewService(pool),
		Invite:       invite.NewService(pool),
		Admin:        adminSvc,
		Backup:       backup.NewService(pool),
		Audit:        alog,
		Publisher:    publisher,
		WSTicket:     wsticket.NewService(rdb),
		Room:         room.NewService(pool),
		Channel:      channel.NewService(pool),
		Presence:     presH,
		Message:      message.NewService(pool, publisher, attachSvc),
		Attachment:   attachSvc,
		DM:           dm.NewService(pool, publisher, attachSvc),
		Search:       search.NewService(pool),
		RTC:          rtc.NewService(pool, cfg.LiveKitURL, cfg.LiveKitPublicURL, cfg.LiveKitAPIKey, cfg.LiveKitAPISecret, cfg.TurnHost, cfg.TurnPort, cfg.TurnSecret, m),
		Voice:        voiceSvc,
		Metrics:      m,
		Notification: notifSvc,
		DeviceReg:    devicereg.NewService(pool, rdb, cfg.SessionTTLDays),
		Device:       device.NewService(pool),
		Redeem:       redeem.NewService(pool, rdb, cfg.SessionTTLDays),
		Relay:        relay.NewService(pool),
	}, rl)

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)

	go func() {
		if err := srv.Start(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			slog.Error("server error", "error", err)
			os.Exit(1)
		}
	}()

	<-quit
	slog.Info("shutting down")

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := srv.Shutdown(shutdownCtx); err != nil {
		slog.Error("shutdown error", "error", err)
	}
}

func setupLogger() {
	var level slog.Level
	switch os.Getenv("LOG_LEVEL") {
	case "debug":
		level = slog.LevelDebug
	case "warn":
		level = slog.LevelWarn
	case "error":
		level = slog.LevelError
	default:
		level = slog.LevelInfo
	}
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: level})))
}
