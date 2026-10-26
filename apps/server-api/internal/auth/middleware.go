package auth

import (
	"net/http"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"

	"openspace/server-api/internal/ctxkey"
	"openspace/server-api/internal/httputil"
	"openspace/server-api/internal/sessiontoken"
)

type Middleware struct {
	db *pgxpool.Pool
}

func NewMiddleware(db *pgxpool.Pool) *Middleware {
	return &Middleware{db: db}
}

func isValidToken(s string) bool {
	return sessiontoken.Valid(s)
}

func (m *Middleware) Require(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		token := extractBearer(r)
		if token == "" || !isValidToken(token) {
			httputil.WriteError(w, http.StatusUnauthorized, "unauthorized")
			return
		}

		var id, serverID, username, sessionID string
		err := m.db.QueryRow(r.Context(),
			`SELECT si.id, si.server_id, si.username, s.id
			 FROM sessions s
			 JOIN server_identities si ON si.id = s.identity_id
			 WHERE s.token_hash = $1 AND s.expires_at > NOW() AND si.is_disabled = FALSE`,
			sessiontoken.Digest(token),
		).Scan(&id, &serverID, &username, &sessionID)

		if err != nil {
			httputil.WriteError(w, http.StatusUnauthorized, "unauthorized")
			return
		}

		ctx := ctxkey.Set(r.Context(), &ctxkey.ContextIdentity{
			ID:        id,
			ServerID:  serverID,
			Username:  username,
			SessionID: sessionID,
		})
		next(w, r.WithContext(ctx))
	}
}

func extractBearer(r *http.Request) string {
	h := r.Header.Get("Authorization")
	if !strings.HasPrefix(h, "Bearer ") {
		return ""
	}
	return strings.TrimPrefix(h, "Bearer ")
}
