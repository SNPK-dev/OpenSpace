package admin

import "testing"

func TestRetentionMinimumsAndDisabledPolicy(t *testing.T) {
	belowMessage, message, belowAudit, audit := 29, 30, 89, 90
	if !validRetention(nil, 30) { t.Fatal("nil must safely disable retention") }
	if validRetention(&belowMessage, 30) || !validRetention(&message, 30) { t.Fatal("message retention boundary invalid") }
	if validRetention(&belowAudit, 90) || !validRetention(&audit, 90) { t.Fatal("audit retention boundary invalid") }
}
