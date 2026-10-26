package httputil

import (
	"net/http"
	"strings"
)

// ExtractIP returns the client IP from X-Real-IP, X-Forwarded-For, or RemoteAddr.
// X-Real-IP is preferred as it is set by Caddy in production.
func ExtractIP(r *http.Request) string {
	if ip := r.Header.Get("X-Real-IP"); ip != "" {
		return ip
	}
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		parts := strings.SplitN(xff, ",", 2)
		return strings.TrimSpace(parts[0])
	}
	host, _, _ := strings.Cut(r.RemoteAddr, ":")
	return host
}
