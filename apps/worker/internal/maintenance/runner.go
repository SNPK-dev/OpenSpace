package maintenance

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"sync/atomic"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type Job struct {
	Name, DeleteSQL, CountSQL string
	Enabled                   bool
	Cutoff                    time.Time
}

func (r *Runner) PolicyJobs(ctx context.Context) ([]Job, error) {
	var messageDays, auditDays, pushDays *int
	if err := r.db.QueryRow(ctx, `SELECT message_retention_days,audit_retention_days,push_token_retention_days FROM maintenance_policy WHERE singleton=TRUE`).Scan(&messageDays, &auditDays, &pushDays); err != nil {
		return nil, err
	}
	now := time.Now()
	jobs := []Job{}
	if messageDays != nil {
		jobs = append(jobs, Job{Name: "message_retention", CountSQL: `SELECT count(*) FROM messages WHERE created_at < $1`, DeleteSQL: `DELETE FROM messages WHERE id IN (SELECT id FROM messages WHERE created_at < $2 ORDER BY created_at LIMIT $1)`, Enabled: true, Cutoff: now.AddDate(0, 0, -*messageDays)})
	}
	if auditDays != nil {
		jobs = append(jobs, Job{Name: "audit_retention", CountSQL: `SELECT count(*) FROM audit_log WHERE created_at < $1`, DeleteSQL: `DELETE FROM audit_log WHERE id IN (SELECT id FROM audit_log WHERE created_at < $2 ORDER BY created_at LIMIT $1)`, Enabled: true, Cutoff: now.AddDate(0, 0, -*auditDays)})
	}
	if pushDays != nil {
		jobs = append(jobs, Job{Name: "stale_push_tokens", CountSQL: `SELECT count(*) FROM push_tokens WHERE created_at < $1`, DeleteSQL: `DELETE FROM push_tokens WHERE id IN (SELECT id FROM push_tokens WHERE created_at < $2 ORDER BY created_at LIMIT $1)`, Enabled: true, Cutoff: now.AddDate(0, 0, -*pushDays)})
	}
	return jobs, nil
}

type Stats struct {
	Runs, Failures, Affected atomic.Int64
	LastSuccess              atomic.Int64
}

type Runner struct {
	db             *pgxpool.Pool
	batch, retries int
	dryRun         bool
	stats          *Stats
}

func NewRunner(db *pgxpool.Pool, batch, retries int, dryRun bool, stats *Stats) *Runner {
	return &Runner{db: db, batch: batch, retries: retries, dryRun: dryRun, stats: stats}
}

func DefaultJobs() []Job {
	return []Job{
		{Name: "expired_sessions", CountSQL: `SELECT count(*) FROM sessions WHERE expires_at < NOW()`, DeleteSQL: `DELETE FROM sessions WHERE id IN (SELECT id FROM sessions WHERE expires_at < NOW() ORDER BY expires_at LIMIT $1)`, Enabled: true},
		{Name: "expired_pairing_tokens", CountSQL: `SELECT count(*) FROM pairing_tokens WHERE expires_at < NOW()`, DeleteSQL: `DELETE FROM pairing_tokens WHERE id IN (SELECT id FROM pairing_tokens WHERE expires_at < NOW() ORDER BY expires_at LIMIT $1)`, Enabled: true},
		{Name: "expired_relay_transfers", CountSQL: `SELECT count(*) FROM relay_transfers WHERE expires_at < NOW()`, DeleteSQL: `DELETE FROM relay_transfers WHERE id IN (SELECT id FROM relay_transfers WHERE expires_at < NOW() ORDER BY expires_at LIMIT $1)`, Enabled: true},
		{Name: "abandoned_uploads", CountSQL: `SELECT count(*) FROM attachments WHERE status='pending' AND created_at < NOW() - INTERVAL '24 hours'`, DeleteSQL: `DELETE FROM attachments WHERE id IN (SELECT id FROM attachments WHERE status='pending' AND created_at < NOW() - INTERVAL '24 hours' ORDER BY created_at LIMIT $1)`, Enabled: true},
	}
}

func (r *Runner) Run(ctx context.Context, job Job) error {
	if !job.Enabled {
		return nil
	}
	var locked bool
	if err := r.db.QueryRow(ctx, `SELECT pg_try_advisory_lock(hashtext($1))`, "openspace-maintenance:"+job.Name).Scan(&locked); err != nil {
		return err
	}
	if !locked {
		return nil
	}
	defer r.db.Exec(context.Background(), `SELECT pg_advisory_unlock(hashtext($1))`, "openspace-maintenance:"+job.Name) //nolint:errcheck
	var runID, examined int64
	if err := r.db.QueryRow(ctx, `INSERT INTO maintenance_runs(job_name,status) VALUES($1,'running') RETURNING id`, job.Name).Scan(&runID); err != nil {
		return err
	}
	countArgs := []any{}
	if !job.Cutoff.IsZero() {
		countArgs = append(countArgs, job.Cutoff)
	}
	if err := r.db.QueryRow(ctx, job.CountSQL, countArgs...).Scan(&examined); err != nil {
		return r.fail(ctx, runID, job.Name, 1, "count_failed", err)
	}
	if r.dryRun {
		_, err := r.db.Exec(ctx, `UPDATE maintenance_runs SET finished_at=NOW(),status='dry_run',examined=$2 WHERE id=$1`, runID, examined)
		return err
	}
	var last error
	for attempt := 1; attempt <= r.retries; attempt++ {
		deleteArgs := []any{r.batch}
		if !job.Cutoff.IsZero() {
			deleteArgs = append(deleteArgs, job.Cutoff)
		}
		result, err := r.db.Exec(ctx, job.DeleteSQL, deleteArgs...)
		if err == nil {
			affected := result.RowsAffected()
			r.stats.Runs.Add(1)
			r.stats.Affected.Add(affected)
			r.stats.LastSuccess.Store(time.Now().Unix())
			_, err = r.db.Exec(ctx, `UPDATE maintenance_runs SET finished_at=NOW(),status='succeeded',attempt=$2,examined=$3,affected=$4 WHERE id=$1`, runID, attempt, examined, affected)
			return err
		}
		last = err
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(time.Duration(attempt) * 100 * time.Millisecond):
		}
	}
	return r.fail(ctx, runID, job.Name, r.retries, "delete_failed", last)
}

func (r *Runner) fail(ctx context.Context, runID int64, job string, attempts int, category string, cause error) error {
	r.stats.Failures.Add(1)
	_, updateErr := r.db.Exec(ctx, `UPDATE maintenance_runs SET finished_at=NOW(),status='failed',attempt=$2,error_category=$3 WHERE id=$1`, runID, attempts, category)
	_, letterErr := r.db.Exec(ctx, `INSERT INTO maintenance_dead_letters(job_name,run_id,error_category,attempts) VALUES($1,$2,$3,$4)`, job, runID, category, attempts)
	if updateErr != nil || letterErr != nil {
		slog.Error("record maintenance failure", "category", category)
	}
	return fmt.Errorf("%s: %w", category, errors.Join(cause, updateErr, letterErr))
}
