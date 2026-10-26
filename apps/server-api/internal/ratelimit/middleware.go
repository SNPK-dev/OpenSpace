package ratelimit

import (
	"net/http"

	"openspace/server-api/internal/ctxkey"
	"openspace/server-api/internal/httputil"
)

// IPLimit wraps a handler with a per-IP rate limit.
func (l *Limiter) IPLimit(tag string, limit int64, next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !l.Allow(r.Context(), tag, httputil.ExtractIP(r), limit) {
			w.Header().Set("Retry-After", "60")
			httputil.WriteError(w, http.StatusTooManyRequests, "rate_limit_exceeded")
			return
		}
		next(w, r)
	}
}

// IdentityLimit wraps a handler with a per-identity rate limit.
// Must be used inside auth.Middleware.Require (identity must be in context).
func (l *Limiter) IdentityLimit(tag string, limit int64, next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := ctxkey.Get(r.Context())
		if !l.Allow(r.Context(), tag, id.ID, limit) {
			w.Header().Set("Retry-After", "60")
			httputil.WriteError(w, http.StatusTooManyRequests, "rate_limit_exceeded")
			return
		}
		next(w, r)
	}
}
