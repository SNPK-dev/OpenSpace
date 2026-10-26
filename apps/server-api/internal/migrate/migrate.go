package migrate

import (
	"context"
	"embed"
	"fmt"
	"io/fs"
	"log/slog"
	"sort"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"
)

//go:embed sql/*.sql
var sqlFiles embed.FS

func Run(ctx context.Context, pool *pgxpool.Pool) error {
	if err := ensureMigrationsTable(ctx, pool); err != nil {
		return fmt.Errorf("ensure migrations table: %w", err)
	}

	files, err := listMigrationFiles()
	if err != nil {
		return fmt.Errorf("list migration files: %w", err)
	}

	for _, name := range files {
		applied, err := isMigrationApplied(ctx, pool, name)
		if err != nil {
			return fmt.Errorf("check migration %s: %w", name, err)
		}
		if applied {
			slog.Info("migration already applied, skipping", "name", name)
			continue
		}

		if err := applyMigration(ctx, pool, name); err != nil {
			return fmt.Errorf("apply migration %s: %w", name, err)
		}
		slog.Info("migration applied", "name", name)
	}

	return nil
}

func ensureMigrationsTable(ctx context.Context, pool *pgxpool.Pool) error {
	_, err := pool.Exec(ctx, `
		CREATE TABLE IF NOT EXISTS schema_migrations (
			name       TEXT PRIMARY KEY,
			applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)
	`)
	return err
}

func listMigrationFiles() ([]string, error) {
	var names []string
	err := fs.WalkDir(sqlFiles, "sql", func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if !d.IsDir() && strings.HasSuffix(path, ".sql") {
			names = append(names, path)
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	sort.Strings(names)
	return names, nil
}

func isMigrationApplied(ctx context.Context, pool *pgxpool.Pool, name string) (bool, error) {
	var count int
	err := pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM schema_migrations WHERE name = $1`, name,
	).Scan(&count)
	return count > 0, err
}

func applyMigration(ctx context.Context, pool *pgxpool.Pool, path string) error {
	data, err := sqlFiles.ReadFile(path)
	if err != nil {
		return fmt.Errorf("read file: %w", err)
	}

	tx, err := pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	if _, err := tx.Exec(ctx, string(data)); err != nil {
		return fmt.Errorf("exec sql: %w", err)
	}

	if _, err := tx.Exec(ctx,
		`INSERT INTO schema_migrations(name) VALUES($1)`, path,
	); err != nil {
		return fmt.Errorf("record migration: %w", err)
	}

	return tx.Commit(ctx)
}
