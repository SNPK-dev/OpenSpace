package maintenance

import (
	"testing"
	"time"
)

func TestEligibleOrphanRequiresGraceAndNoReference(t *testing.T) {
	cutoff := time.Now().Add(-24 * time.Hour)
	if EligibleOrphan(time.Now(), cutoff, false) {
		t.Fatal("new upload must survive grace")
	}
	if EligibleOrphan(cutoff.Add(-time.Hour), cutoff, true) {
		t.Fatal("referenced object must survive")
	}
	if !EligibleOrphan(cutoff.Add(-time.Hour), cutoff, false) {
		t.Fatal("old unreferenced object should be eligible")
	}
}
