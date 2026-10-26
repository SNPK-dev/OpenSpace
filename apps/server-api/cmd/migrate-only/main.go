// migrate-only: applies pending DB migrations and exits.
// Usage: DATABASE_URL=postgres://... go run ./cmd/migrate-only
package main

import (
	"context"
	"log/slog"
	"os"

	"github.com/jackc/pgx/v5/pgxpool"

	"openspace/server-api/internal/migrate"
)

func main() {
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		slog.Error("DATABASE_URL is required")
		os.Exit(1)
	}

	pool, err := pgxpool.New(context.Background(), dsn)
	if err != nil {
		slog.Error("connect", "error", err)
		os.Exit(1)
	}
	defer pool.Close()

	if err := migrate.Run(context.Background(), pool); err != nil {
		slog.Error("migrate", "error", err)
		os.Exit(1)
	}
	slog.Info("all migrations applied")
}
