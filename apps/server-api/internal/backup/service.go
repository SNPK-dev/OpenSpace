package backup

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type BackupEntry struct {
	ID            int64     `json:"id"`
	TakenAt       time.Time `json:"taken_at"`
	ManifestPath  string    `json:"manifest_path"`
	DBSizeBytes   int64     `json:"db_size_bytes"`
	SchemaVersion int       `json:"schema_version"`
	Env           string    `json:"env"`
	Status        string    `json:"status"`
}

type MigrationEntry struct {
	Name      string    `json:"name"`
	AppliedAt time.Time `json:"applied_at"`
}

type Service struct {
	db *pgxpool.Pool
}

func NewService(db *pgxpool.Pool) *Service {
	return &Service{db: db}
}

func (s *Service) ListBackups(ctx context.Context) ([]BackupEntry, error) {
	rows, err := s.db.Query(ctx, `
		SELECT id, taken_at, manifest_path, db_size_bytes, schema_version, env, status
		FROM backup_log
		ORDER BY taken_at DESC
		LIMIT 50
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var entries []BackupEntry
	for rows.Next() {
		var e BackupEntry
		if err := rows.Scan(&e.ID, &e.TakenAt, &e.ManifestPath, &e.DBSizeBytes, &e.SchemaVersion, &e.Env, &e.Status); err != nil {
			return nil, err
		}
		entries = append(entries, e)
	}
	if entries == nil {
		entries = []BackupEntry{}
	}
	return entries, rows.Err()
}

func (s *Service) ListMigrations(ctx context.Context) ([]MigrationEntry, error) {
	rows, err := s.db.Query(ctx, `
		SELECT name, applied_at
		FROM schema_migrations
		ORDER BY name ASC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var entries []MigrationEntry
	for rows.Next() {
		var e MigrationEntry
		if err := rows.Scan(&e.Name, &e.AppliedAt); err != nil {
			return nil, err
		}
		entries = append(entries, e)
	}
	if entries == nil {
		entries = []MigrationEntry{}
	}
	return entries, rows.Err()
}
