package metrics

import (
	"fmt"
	"net/http"
	"sync/atomic"
	"time"
)

type Metrics struct {
	TokensIssued      atomic.Int64
	IceServed         atomic.Int64
	VoiceJoins        atomic.Int64
	VoiceLeaves       atomic.Int64
	VoiceHeartbeats   atomic.Int64
	VoiceEvictions    atomic.Int64
	TokenFailures     atomic.Int64
	VoiceJoinFailures atomic.Int64
	HTTPRequests      [5]atomic.Int64
	HTTPDurationMS    atomic.Int64
}

func New() *Metrics { return &Metrics{} }

type statusWriter struct {
	http.ResponseWriter
	status int
}

func (w *statusWriter) WriteHeader(status int) {
	w.status = status
	w.ResponseWriter.WriteHeader(status)
}
func (m *Metrics) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		started := time.Now()
		sw := &statusWriter{ResponseWriter: w, status: 200}
		next.ServeHTTP(sw, r)
		class := sw.status / 100
		if class >= 1 && class <= 5 {
			m.HTTPRequests[class-1].Add(1)
		}
		m.HTTPDurationMS.Add(time.Since(started).Milliseconds())
	})
}

func (m *Metrics) ServeHTTP(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "text/plain; version=0.0.4")
	fmt.Fprintf(w, "# TYPE openspace_rtc_tokens_issued_total counter\nopenspace_rtc_tokens_issued_total %d\n# TYPE openspace_rtc_voice_joins_total counter\nopenspace_rtc_voice_joins_total %d\n# TYPE openspace_rtc_voice_leaves_total counter\nopenspace_rtc_voice_leaves_total %d\n# TYPE openspace_rtc_voice_evictions_total counter\nopenspace_rtc_voice_evictions_total %d\n", m.TokensIssued.Load(), m.VoiceJoins.Load(), m.VoiceLeaves.Load(), m.VoiceEvictions.Load())
	fmt.Fprintf(w, "openspace_rtc_token_failures_total %d\nopenspace_rtc_voice_join_failures_total %d\n", m.TokenFailures.Load(), m.VoiceJoinFailures.Load())
	for index := range m.HTTPRequests {
		fmt.Fprintf(w, "openspace_http_requests_total{status_class=\"%dxx\"} %d\n", index+1, m.HTTPRequests[index].Load())
	}
	fmt.Fprintf(w, "openspace_http_request_duration_milliseconds_total %d\n", m.HTTPDurationMS.Load())
}
