package rtc

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha1"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"strconv"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"openspace/server-api/internal/metrics"
)

var (
	ErrChannelNotFound = errors.New("channel_not_found")
	ErrNotVoiceChannel = errors.New("not_a_voice_channel")
)

type TokenResponse struct {
	Token    string `json:"token"`
	URL      string `json:"url"`
	Identity string `json:"identity"` // full LiveKit identity for this session (unique per tab/app instance)
}

type IceServer struct {
	URLs       []string `json:"urls"`
	Username   string   `json:"username,omitempty"`
	Credential string   `json:"credential,omitempty"`
}

type IceServersResponse struct {
	IceServers []IceServer `json:"ice_servers"`
}

type Service struct {
	db         *pgxpool.Pool
	url        string
	publicURL  string
	apiKey     string
	apiSecret  string
	turnHost   string
	turnPort   int
	turnSecret string
	m          *metrics.Metrics
}

func NewService(db *pgxpool.Pool, url, publicURL, apiKey, apiSecret, turnHost string, turnPort int, turnSecret string, m *metrics.Metrics) *Service {
	return &Service{
		db:         db,
		url:        url,
		publicURL:  publicURL,
		apiKey:     apiKey,
		apiSecret:  apiSecret,
		turnHost:   turnHost,
		turnPort:   turnPort,
		turnSecret: turnSecret,
		m:          m,
	}
}

var defaultSources = []string{"camera", "microphone", "screen_share"}

func (s *Service) IssueToken(ctx context.Context, serverID, channelID, identityID string, sources []string) (*TokenResponse, error) {
	var channelType string
	err := s.db.QueryRow(ctx,
		`SELECT type FROM channels WHERE id = $1 AND server_id = $2`,
		channelID, serverID,
	).Scan(&channelType)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrChannelNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("query channel: %w", err)
	}
	if channelType != "voice" {
		return nil, ErrNotVoiceChannel
	}

	var username string
	if err := s.db.QueryRow(ctx,
		`SELECT username FROM server_identities WHERE id = $1`,
		identityID,
	).Scan(&username); err != nil {
		return nil, fmt.Errorf("query identity: %w", err)
	}

	if len(sources) == 0 {
		sources = defaultSources
	}

	// Unique per-session identity: identityID (stable UUID) + random 4-byte suffix.
	// This lets the same account connect from multiple devices (web + desktop) without
	// LiveKit kicking the first session. The client filters out cross-session self-audio
	// by checking whether a remote participant's identity starts with our identityID.
	suffix := make([]byte, 4)
	if _, err := rand.Read(suffix); err != nil {
		return nil, fmt.Errorf("generate session suffix: %w", err)
	}
	lkIdentity := identityID + "-" + hex.EncodeToString(suffix)

	token, err := GenerateJoinToken(s.apiKey, s.apiSecret, channelID, lkIdentity, 6*time.Hour, sources)
	if err != nil {
		return nil, fmt.Errorf("generate token: %w", err)
	}
	s.m.TokensIssued.Add(1)
	return &TokenResponse{Token: token, URL: s.publicURL, Identity: lkIdentity}, nil
}

// IceServers generates time-limited TURN credentials using coturn's static-auth-secret format.
func (s *Service) IceServers(identityID string) *IceServersResponse {
	s.m.IceServed.Add(1)
	expiry := time.Now().Add(24 * time.Hour).Unix()
	turnUser := strconv.FormatInt(expiry, 10) + ":" + identityID

	mac := hmac.New(sha1.New, []byte(s.turnSecret))
	mac.Write([]byte(turnUser))
	cred := base64.StdEncoding.EncodeToString(mac.Sum(nil))

	host := fmt.Sprintf("%s:%d", s.turnHost, s.turnPort)

	return &IceServersResponse{
		IceServers: []IceServer{
			{URLs: []string{"stun:" + host}},
			{
				URLs:       []string{"turn:" + host + "?transport=udp", "turn:" + host + "?transport=tcp"},
				Username:   turnUser,
				Credential: cred,
			},
		},
	}
}
