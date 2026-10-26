package gateway

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/gorilla/websocket"
	"github.com/redis/go-redis/v9"

	"openspace/realtime-gateway/internal/hub"
	"openspace/realtime-gateway/internal/presence"
)

const protocolName = "openspace.v1"

type Handler struct {
	hub            *hub.Hub
	presence       *presence.Service
	rdb            *redis.Client
	tickets        ticketStore
	allowedOrigins map[string]struct{}
	upgrader       websocket.Upgrader
}

type ticketStore interface {
	GetDel(context.Context, string) *redis.StringCmd
}

type identity struct {
	ID       string `json:"identity_id"`
	ServerID string `json:"server_id"`
}

func NewHandler(h *hub.Hub, ps *presence.Service, rdb *redis.Client, origins []string) *Handler {
	handler := &Handler{hub: h, presence: ps, rdb: rdb, tickets: rdb, allowedOrigins: normalizeOrigins(origins)}
	handler.upgrader = websocket.Upgrader{
		ReadBufferSize: 1024, WriteBufferSize: 1024,
		CheckOrigin:  handler.originAllowed,
		Subprotocols: []string{protocolName},
	}
	return handler
}

func normalizeOrigins(origins []string) map[string]struct{} {
	result := make(map[string]struct{}, len(origins))
	for _, origin := range origins {
		origin = strings.TrimSpace(origin)
		if origin == "file://" {
			result[origin] = struct{}{}
			continue
		}
		u, err := url.Parse(origin)
		if err == nil && (u.Scheme == "http" || u.Scheme == "https") && u.Host != "" && (u.Path == "" || u.Path == "/") && u.RawQuery == "" && u.Fragment == "" {
			result[strings.ToLower(u.Scheme+"://"+u.Host)] = struct{}{}
		}
	}
	return result
}

func (h *Handler) originAllowed(r *http.Request) bool {
	origin := strings.TrimSpace(r.Header.Get("Origin"))
	if origin == "" {
		return true
	}
	if origin == "file://" {
		_, ok := h.allowedOrigins[origin]
		return ok
	}
	u, err := url.Parse(origin)
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" || (u.Path != "" && u.Path != "/") || u.RawQuery != "" || u.Fragment != "" {
		return false
	}
	_, ok := h.allowedOrigins[strings.ToLower(u.Scheme+"://"+u.Host)]
	return ok
}

func ticketFromProtocols(r *http.Request) string {
	found := ""
	for _, value := range websocket.Subprotocols(r) {
		if strings.HasPrefix(value, "ticket.") {
			if found != "" {
				return ""
			}
			found = strings.TrimPrefix(value, "ticket.")
		}
	}
	return found
}

func (h *Handler) consumeTicket(ctx context.Context, ticket string) (*identity, error) {
	if len(ticket) != 64 || strings.ToLower(ticket) != ticket {
		return nil, fmt.Errorf("invalid format")
	}
	if _, err := hex.DecodeString(ticket); err != nil {
		return nil, fmt.Errorf("invalid format")
	}
	digest := sha256.Sum256([]byte(ticket))
	payload, err := h.tickets.GetDel(ctx, "ws:ticket:"+hex.EncodeToString(digest[:])).Bytes()
	if err != nil {
		return nil, fmt.Errorf("expired or replayed")
	}
	var ident identity
	if json.Unmarshal(payload, &ident) != nil || ident.ID == "" || ident.ServerID == "" {
		return nil, fmt.Errorf("invalid claims")
	}
	return &ident, nil
}

func (h *Handler) publish(ctx context.Context, serverID string, event any) {
	b, err := json.Marshal(event)
	if err == nil {
		h.rdb.Publish(ctx, fmt.Sprintf("events:%s", serverID), string(b))
	}
}

func (h *Handler) Connect(w http.ResponseWriter, r *http.Request) {
	if !h.originAllowed(r) {
		slog.Warn("ws rejected", "reason", "disallowed_origin")
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}
	if r.URL.RawQuery != "" || !websocket.IsWebSocketUpgrade(r) || !slicesContains(websocket.Subprotocols(r), protocolName) {
		slog.Warn("ws rejected", "reason", "invalid_protocol")
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}
	ticket := ticketFromProtocols(r)
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	ident, err := h.consumeTicket(ctx, ticket)
	cancel()
	if err != nil {
		slog.Warn("ws rejected", "reason", err.Error())
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}
	conn, err := h.upgrader.Upgrade(w, r, nil)
	if err != nil {
		slog.Error("ws upgrade failed", "error", err)
		return
	}
	client := &hub.Client{Hub: h.hub, Conn: conn, Send: make(chan []byte, 256), ServerID: ident.ServerID, IdentityID: ident.ID}
	h.hub.Register(client)
	if err := h.presence.Add(r.Context(), ident.ServerID, ident.ID); err != nil {
		slog.Error("presence add failed", "error", err)
	}
	h.publish(r.Context(), ident.ServerID, map[string]string{"type": "presence.joined", "identity_id": ident.ID})
	slog.Info("ws connected", "identity_id", ident.ID, "server_id", ident.ServerID)
	go client.WritePump()
	client.ReadPump(func() {
		h.hub.Unregister(client)
		bgCtx := context.Background()
		if err := h.presence.Remove(bgCtx, ident.ServerID, ident.ID); err != nil {
			slog.Error("presence remove failed", "error", err)
		}
		h.publish(bgCtx, ident.ServerID, map[string]string{"type": "presence.left", "identity_id": ident.ID})
		if b, err := json.Marshal(map[string]string{"server_id": ident.ServerID, "identity_id": ident.ID}); err == nil {
			h.rdb.Publish(bgCtx, "sys:voice-evict", string(b))
		}
		slog.Info("ws disconnected", "identity_id", ident.ID)
	})
}

func slicesContains(values []string, target string) bool {
	for _, value := range values {
		if value == target {
			return true
		}
	}
	return false
}
