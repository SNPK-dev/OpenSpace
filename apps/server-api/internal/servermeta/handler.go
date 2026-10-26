package servermeta

import (
	"context"
	"errors"
	"log/slog"
	"net/http"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"openspace/server-api/internal/httputil"
)

type Features struct {
	Text          bool `json:"text"`
	Voice         bool `json:"voice"`
	Files         bool `json:"files"`
	DevicePairing bool `json:"device_pairing"`
}

type ServerMetadata struct {
	ServerID           string   `json:"server_id"`
	Name               string   `json:"name"`
	Description        string   `json:"description"`
	PublicURL          string   `json:"public_url"`
	AvatarURL          string   `json:"avatar_url"`
	RegistrationPolicy string   `json:"registration_policy"`
	Features           Features `json:"features"`
	TLSRequired        bool     `json:"tls_required"`
}

type Handler struct {
	db *pgxpool.Pool
}

func NewHandler(db *pgxpool.Pool) *Handler {
	return &Handler{db: db}
}

// GET /.well-known/openspace/server
func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	// Allow cross-origin fetches so Electron renderers and other clients
	// can read server metadata regardless of their origin.
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "GET, OPTIONS")
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusNoContent)
		return
	}

	meta, err := h.loadMeta(r.Context())
	if err != nil {
		slog.Error("servermeta load error", "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "internal_error")
		return
	}
	w.Header().Set("Cache-Control", "public, max-age=60")
	httputil.WriteJSON(w, http.StatusOK, meta)
}

func (h *Handler) loadMeta(ctx context.Context) (*ServerMetadata, error) {
	var id string
	err := h.db.QueryRow(ctx, `SELECT id FROM servers LIMIT 1`).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return &ServerMetadata{
			ServerID:           "not-bootstrapped",
			Name:               "OpenSpace",
			Description:        "",
			PublicURL:          "",
			AvatarURL:          "",
			RegistrationPolicy: "invite_code_only",
			Features:           Features{Text: true, Voice: true, Files: true, DevicePairing: true},
			TLSRequired:        true,
		}, nil
	}
	if err != nil {
		return nil, err
	}

	var name, description, publicURL, avatarURL, policy string
	_ = h.db.QueryRow(ctx,
		`SELECT name, COALESCE(description,''), COALESCE(public_url,''), COALESCE(avatar_url,''), COALESCE(registration_policy,'invite_code_only')
		 FROM server_settings WHERE server_id = $1`, id,
	).Scan(&name, &description, &publicURL, &avatarURL, &policy)
	if name == "" {
		name = "OpenSpace"
	}
	if policy == "" {
		policy = "invite_code_only"
	}

	tlsRequired := len(publicURL) > 5 && publicURL[:5] == "https"

	return &ServerMetadata{
		ServerID:           id,
		Name:               name,
		Description:        description,
		PublicURL:          publicURL,
		AvatarURL:          avatarURL,
		RegistrationPolicy: policy,
		Features:           Features{Text: true, Voice: true, Files: true, DevicePairing: true},
		TLSRequired:        tlsRequired,
	}, nil
}
