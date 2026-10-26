package hub

import (
	"log/slog"
	"sync/atomic"
	"time"

	"github.com/gorilla/websocket"
)

const (
	writeWait      = 10 * time.Second
	pongWait       = 60 * time.Second
	pingPeriod     = 30 * time.Second
	maxMessageSize = 4 * 1024
)

type Client struct {
	Hub        *Hub
	Conn       *websocket.Conn
	Send       chan []byte
	ServerID   string
	IdentityID string
}

type BroadcastMsg struct {
	ServerID string
	Payload  []byte
}

type Hub struct {
	byServer                                                    map[string]map[*Client]bool
	register                                                    chan *Client
	unregister                                                  chan *Client
	Broadcast                                                   chan BroadcastMsg
	connected, connections, disconnects, broadcasts, queueDrops atomic.Int64
}

func New() *Hub {
	return &Hub{
		byServer:   make(map[string]map[*Client]bool),
		register:   make(chan *Client, 64),
		unregister: make(chan *Client, 64),
		Broadcast:  make(chan BroadcastMsg, 256),
	}
}

func (h *Hub) Register(c *Client)   { h.register <- c }
func (h *Hub) Unregister(c *Client) { h.unregister <- c }

func (h *Hub) Run() {
	for {
		select {
		case c := <-h.register:
			h.connected.Add(1)
			h.connections.Add(1)
			if h.byServer[c.ServerID] == nil {
				h.byServer[c.ServerID] = make(map[*Client]bool)
			}
			h.byServer[c.ServerID][c] = true

		case c := <-h.unregister:
			if clients, ok := h.byServer[c.ServerID]; ok {
				if _, present := clients[c]; present {
					h.connected.Add(-1)
					h.disconnects.Add(1)
					delete(clients, c)
					close(c.Send)
				}
				if len(clients) == 0 {
					delete(h.byServer, c.ServerID)
				}
			}

		case msg := <-h.Broadcast:
			h.broadcasts.Add(1)
			for c := range h.byServer[msg.ServerID] {
				select {
				case c.Send <- msg.Payload:
				default:
					h.queueDrops.Add(1)
					h.connected.Add(-1)
					h.disconnects.Add(1)
					delete(h.byServer[c.ServerID], c)
					close(c.Send)
				}
			}
		}
	}
}

func (h *Hub) Stats() (int64, int64, int64, int64, int64) {
	return h.connected.Load(), h.connections.Load(), h.disconnects.Load(), h.broadcasts.Load(), h.queueDrops.Load()
}

var pingMsg = []byte(`{"type":"pong"}`)

func (c *Client) ReadPump(onDisconnect func()) {
	defer func() {
		onDisconnect()
	}()

	c.Conn.SetReadLimit(maxMessageSize)
	c.Conn.SetReadDeadline(time.Now().Add(pongWait))
	c.Conn.SetPongHandler(func(string) error {
		c.Conn.SetReadDeadline(time.Now().Add(pongWait))
		return nil
	})

	for {
		_, msg, err := c.Conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				slog.Debug("ws read error", "identity_id", c.IdentityID, "error", err)
			}
			break
		}
		// handle ping
		if string(msg) == `{"type":"ping"}` {
			select {
			case c.Send <- pingMsg:
			default:
			}
		}
	}
}

func (c *Client) WritePump() {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		ticker.Stop()
		c.Conn.Close()
	}()

	for {
		select {
		case msg, ok := <-c.Send:
			c.Conn.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok {
				c.Conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}
			if err := c.Conn.WriteMessage(websocket.TextMessage, msg); err != nil {
				return
			}

		case <-ticker.C:
			c.Conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.Conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}
