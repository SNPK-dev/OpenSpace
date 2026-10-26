package maintenance

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type ObjectCandidate struct {
	Key      string
	Modified time.Time
}
type ObjectStore interface {
	Candidates(context.Context, time.Time, int) ([]ObjectCandidate, error)
	Remove(context.Context, string) error
}
type OrphanCleaner struct {
	db     *pgxpool.Pool
	store  ObjectStore
	batch  int
	dryRun bool
}

func NewOrphanCleaner(db *pgxpool.Pool, store ObjectStore, batch int, dryRun bool) *OrphanCleaner {
	return &OrphanCleaner{db: db, store: store, batch: batch, dryRun: dryRun}
}
func EligibleOrphan(modified, cutoff time.Time, referenced bool) bool {
	return modified.Before(cutoff) && !referenced
}
func (c *OrphanCleaner) Run(ctx context.Context) error {
	var grace int
	if err := c.db.QueryRow(ctx, `SELECT orphan_grace_hours FROM maintenance_policy WHERE singleton=TRUE`).Scan(&grace); err != nil {
		return err
	}
	cutoff := time.Now().Add(-time.Duration(grace) * time.Hour)
	objects, err := c.store.Candidates(ctx, cutoff, c.batch)
	if err != nil {
		return err
	}
	var runID int64
	if err := c.db.QueryRow(ctx, `INSERT INTO maintenance_runs(job_name,status,examined) VALUES('orphaned_objects','running',$1) RETURNING id`, len(objects)).Scan(&runID); err != nil {
		return err
	}
	affected := int64(0)
	for _, object := range objects {
		var referenced bool
		if err := c.db.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM attachments WHERE object_key=$1)`, object.Key).Scan(&referenced); err != nil {
			return err
		}
		if !EligibleOrphan(object.Modified, cutoff, referenced) {
			continue
		}
		if !c.dryRun {
			if err := c.store.Remove(ctx, object.Key); err != nil {
				return fmt.Errorf("remove orphan: %w", err)
			}
		}
		affected++
	}
	status := "succeeded"
	if c.dryRun {
		status = "dry_run"
	}
	_, err = c.db.Exec(ctx, `UPDATE maintenance_runs SET status=$2,finished_at=NOW(),affected=$3 WHERE id=$1`, runID, status, affected)
	return err
}
