package gateway

import (
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
)

func FuzzTicketFromProtocols(f *testing.F) {
	f.Add("openspace.v1, ticket.0123456789abcdef")
	f.Add("ticket.a, ticket.b")
	f.Add("")
	f.Fuzz(func(t *testing.T, protocols string) {
		r := httptest.NewRequest("GET", "http://example.test/ws", nil)
		r.Header.Set("Sec-WebSocket-Protocol", protocols)
		got := ticketFromProtocols(r)
		if len(got) > len(protocols) {
			t.Fatal("parser returned bytes not present in bounded input")
		}
	})
}

func FuzzOriginPolicy(f *testing.F) {
	f.Add("https://chat.example.test", "https://chat.example.test")
	f.Add("https://chat.example.test", "https://chat.example.test.evil.invalid")
	f.Add("https://chat.example.test", "null")
	f.Fuzz(func(t *testing.T, configured, supplied string) {
		h := &Handler{allowedOrigins: normalizeOrigins([]string{configured})}
		r := httptest.NewRequest("GET", "http://example.test/ws", nil)
		r.Header.Set("Origin", supplied)
		allowed := h.originAllowed(r)
		trimmed := strings.TrimSpace(supplied)
		if trimmed == "" {
			return
		} // Origin-less non-browser clients authenticate by one-time ticket.
		u, err := url.Parse(trimmed)
		canonical := ""
		if err == nil && (u.Scheme == "http" || u.Scheme == "https") && u.Host != "" && (u.Path == "" || u.Path == "/") && u.RawQuery == "" && u.Fragment == "" {
			canonical = strings.ToLower(u.Scheme + "://" + u.Host)
		}
		_, exact := h.allowedOrigins[canonical]
		if allowed && !exact && trimmed != "file://" {
			t.Fatalf("non-exact origin accepted: configured=%q supplied=%q", configured, supplied)
		}
	})
}
