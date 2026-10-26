package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"syscall"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"openspace/worker/internal/maintenance"
	"openspace/worker/internal/objectstore"
)

func integer(name string, fallback int) int {
	if value, err := strconv.Atoi(os.Getenv(name)); err == nil && value > 0 {
		return value
	}
	return fallback
}

func main() {
	databaseURL := os.Getenv("DATABASE_URL")
	if databaseURL == "" {
		slog.Error("DATABASE_URL is required")
		os.Exit(1)
	}
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()
	db, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		slog.Error("database config", "error", err)
		os.Exit(1)
	}
	defer db.Close()
	stats := &maintenance.Stats{}
	runner := maintenance.NewRunner(db, integer("MAINTENANCE_BATCH_SIZE", 500), integer("MAINTENANCE_RETRIES", 3), os.Getenv("MAINTENANCE_DRY_RUN") == "true", stats)
	store, storeErr := objectstore.New(os.Getenv("STORAGE_ENDPOINT"), os.Getenv("STORAGE_ACCESS_KEY"), os.Getenv("STORAGE_SECRET_KEY"), os.Getenv("STORAGE_BUCKET"), os.Getenv("STORAGE_USE_SSL") == "true")
	if storeErr != nil {
		slog.Error("object storage config", "error", storeErr)
		os.Exit(1)
	}
	orphanCleaner := maintenance.NewOrphanCleaner(db, store, integer("MAINTENANCE_BATCH_SIZE", 500), os.Getenv("MAINTENANCE_DRY_RUN") == "true")
	mux := http.NewServeMux()
	mux.HandleFunc("GET /livez", func(w http.ResponseWriter, _ *http.Request) {
		json.NewEncoder(w).Encode(map[string]string{"status": "live"})
	}) //nolint:errcheck
	mux.HandleFunc("GET /readyz", func(w http.ResponseWriter, req *http.Request) {
		probe, cancel := context.WithTimeout(req.Context(), 2*time.Second)
		defer cancel()
		failed := []string{}
		if err := db.Ping(probe); err != nil {
			failed = append(failed, "postgres")
		}
		if err := store.Ping(probe); err != nil {
			failed = append(failed, "minio")
		}
		if len(failed) > 0 {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusServiceUnavailable)
			json.NewEncoder(w).Encode(map[string]any{"status": "not_ready", "dependencies": failed}) //nolint:errcheck
			return
		}
		json.NewEncoder(w).Encode(map[string]string{"status": "ready"})
	}) //nolint:errcheck
	mux.HandleFunc("GET /metrics", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "text/plain; version=0.0.4")
		fmt.Fprintf(w, "openspace_maintenance_runs_total %d\nopenspace_maintenance_failures_total %d\nopenspace_maintenance_affected_total %d\nopenspace_maintenance_last_success_timestamp_seconds %d\n", stats.Runs.Load(), stats.Failures.Load(), stats.Affected.Load(), stats.LastSuccess.Load())
		var backups, restores int64
		var lastBackup float64
		probe, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()
		_ = db.QueryRow(probe, `SELECT count(*) FILTER(WHERE status='ok'),count(*) FILTER(WHERE status='restore-ok'),COALESCE(EXTRACT(EPOCH FROM max(taken_at) FILTER(WHERE status='ok')),0) FROM backup_log`).Scan(&backups, &restores, &lastBackup)
		fmt.Fprintf(w, "openspace_backup_success_total %d\nopenspace_restore_success_total %d\nopenspace_backup_last_success_timestamp_seconds %.0f\n", backups, restores, lastBackup)
	})
	server := &http.Server{Addr: ":" + func() string {
		if p := os.Getenv("WORKER_PORT"); p != "" {
			return p
		}
		return "8090"
	}(), Handler: mux, ReadHeaderTimeout: 5 * time.Second}
	go func() {
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			slog.Error("health server", "error", err)
			stop()
		}
	}()
	ticker := time.NewTicker(time.Duration(integer("MAINTENANCE_INTERVAL_SECONDS", 3600)) * time.Second)
	defer ticker.Stop()
	run := func() {
		jobs := maintenance.DefaultJobs()
		policyJobs, err := runner.PolicyJobs(ctx)
		if err != nil {
			slog.Error("load maintenance policy", "error", err)
		} else {
			jobs = append(jobs, policyJobs...)
		}
		for _, job := range jobs {
			jobCtx, cancel := context.WithTimeout(ctx, 5*time.Minute)
			if err := runner.Run(jobCtx, job); err != nil {
				slog.Error("maintenance job failed", "job", job.Name, "error", err)
			}
			cancel()
		}
		orphanCtx, cancel := context.WithTimeout(ctx, 5*time.Minute)
		if err := orphanCleaner.Run(orphanCtx); err != nil {
			slog.Error("orphan cleanup failed", "error", err)
		}
		cancel()
	}
	run()
	for {
		select {
		case <-ctx.Done():
			shutdown, cancel := context.WithTimeout(context.Background(), 10*time.Second)
			defer cancel()
			server.Shutdown(shutdown)
			return
		case <-ticker.C:
			run()
		}
	}
}
