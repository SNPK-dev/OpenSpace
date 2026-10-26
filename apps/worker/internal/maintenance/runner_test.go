package maintenance

import (
	"strings"
	"testing"
)

func TestDefaultJobsAreBoundedAndDoNotTargetLiveRecords(t *testing.T) {
	seen := map[string]bool{}
	for _, job := range DefaultJobs() {
		if seen[job.Name] {
			t.Fatalf("duplicate job %s", job.Name)
		}
		seen[job.Name] = true
		if !job.Enabled {
			t.Fatalf("safe transient job disabled: %s", job.Name)
		}
		if !strings.Contains(job.DeleteSQL, "LIMIT $1") {
			t.Fatalf("job is unbounded: %s", job.Name)
		}
		if !strings.Contains(job.CountSQL, "< NOW()") {
			t.Fatalf("job lacks expiry cutoff: %s", job.Name)
		}
	}
}

func TestContentRetentionIsNotEnabledByDefault(t *testing.T) {
	for _, job := range DefaultJobs() {
		if strings.Contains(job.Name, "message") || strings.Contains(job.Name, "audit") {
			t.Fatalf("destructive content retention enabled")
		}
	}
}
