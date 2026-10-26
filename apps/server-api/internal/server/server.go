package server

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"

	"openspace/server-api/internal/admin"
	"openspace/server-api/internal/attachment"
	"openspace/server-api/internal/audit"
	"openspace/server-api/internal/auth"
	"openspace/server-api/internal/backup"
	"openspace/server-api/internal/bootstrap"
	"openspace/server-api/internal/channel"
	"openspace/server-api/internal/device"
	"openspace/server-api/internal/devicereg"
	"openspace/server-api/internal/dm"
	"openspace/server-api/internal/events"
	"openspace/server-api/internal/health"
	"openspace/server-api/internal/httputil"
	"openspace/server-api/internal/identity"
	"openspace/server-api/internal/invite"
	"openspace/server-api/internal/message"
	"openspace/server-api/internal/metrics"
	"openspace/server-api/internal/notification"
	"openspace/server-api/internal/presencehandler"
	"openspace/server-api/internal/ratelimit"
	"openspace/server-api/internal/redeem"
	"openspace/server-api/internal/relay"
	"openspace/server-api/internal/room"
	"openspace/server-api/internal/rtc"
	"openspace/server-api/internal/search"
	"openspace/server-api/internal/servermeta"
	"openspace/server-api/internal/storage"
	"openspace/server-api/internal/voice"
	"openspace/server-api/internal/wsticket"
)

type Server struct {
	http *http.Server
}

type Services struct {
	DB           *pgxpool.Pool
	Redis        *redis.Client
	Storage      *storage.Client
	Bootstrap    *bootstrap.Service
	Auth         *auth.Service
	AuthMiddle   *auth.Middleware
	Identity     *identity.Service
	Invite       *invite.Service
	Admin        *admin.Service
	Backup       *backup.Service
	Audit        *audit.Logger
	Room         *room.Service
	Channel      *channel.Service
	Presence     *presencehandler.Handler
	Message      *message.Service
	Attachment   *attachment.Service
	DM           *dm.Service
	Search       *search.Service
	RTC          *rtc.Service
	Voice        *voice.Service
	Metrics      *metrics.Metrics
	Notification *notification.Service
	DeviceReg    *devicereg.Service
	Device       *device.Service
	Redeem       *redeem.Service
	Relay        *relay.Service
	Publisher    *events.Publisher
	WSTicket     *wsticket.Service
}

func New(port string, svc Services, rl *ratelimit.Limiter) *Server {
	mux := http.NewServeMux()
	mid := svc.AuthMiddle

	authH := auth.NewHandler(svc.Auth, svc.Identity, svc.Audit)
	identityH := identity.NewHandler(svc.Identity)
	inviteH := invite.NewHandler(svc.Invite, svc.Identity, svc.Audit)
	adminH := admin.NewHandler(svc.Admin, svc.Identity, svc.Audit)
	backupH := backup.NewHandler(svc.Backup, svc.Identity)
	auditH := audit.NewHandler(svc.Audit, svc.Identity)
	roomH := room.NewHandler(svc.Room, svc.Identity, svc.Publisher)
	channelH := channel.NewHandler(svc.Channel, svc.Identity)
	messageH := message.NewHandler(svc.Message, svc.Identity)
	attachH := attachment.NewHandler(svc.Attachment, svc.Identity)
	dmH := dm.NewHandler(svc.DM, svc.Identity)
	searchH := search.NewHandler(svc.Search, svc.Identity)
	rtcH := rtc.NewHandler(svc.RTC, svc.Identity, svc.Voice, svc.Metrics)
	voiceH := voice.NewHandler(svc.Voice, svc.Identity)
	notifH := notification.NewHandler(svc.Notification)
	serverMetaH := servermeta.NewHandler(svc.DB)
	deviceRegH := devicereg.NewHandler(svc.DeviceReg)
	deviceH := device.NewHandler(svc.Device)
	redeemH := redeem.NewHandler(svc.Redeem)
	relayH := relay.NewHandler(svc.Relay)
	wsTicketH := wsticket.NewHandler(svc.WSTicket)

	// Health
	healthH := health.NewHandler(svc.Bootstrap, svc.DB, svc.Redis, svc.Storage)
	mux.HandleFunc("GET /healthz", healthH.Health)
	mux.HandleFunc("GET /livez", health.Live)
	mux.HandleFunc("GET /readyz", healthH.Ready)
	mux.Handle("GET /metrics", svc.Metrics)

	// Server metadata (no auth)
	mux.HandleFunc("GET /.well-known/openspace/server", serverMetaH.ServeHTTP)

	// Device registration (no auth)
	mux.HandleFunc("POST /api/auth/device-registration/challenge", rl.IPLimit("devreg:challenge", 10, deviceRegH.Challenge))
	mux.HandleFunc("POST /api/auth/device-registration/complete", rl.IPLimit("devreg:complete", 10, deviceRegH.Complete))

	// Device management (auth required)
	mux.HandleFunc("POST /api/devices/pairing-token", mid.Require(deviceH.CreatePairingToken))
	mux.HandleFunc("DELETE /api/devices/{device_id}", mid.Require(deviceH.RevokeDevice))

	// Pairing token redeem (no auth — token is the credential)
	mux.HandleFunc("POST /api/devices/redeem/challenge", rl.IPLimit("redeem:challenge", 5, redeemH.Challenge))
	mux.HandleFunc("POST /api/devices/redeem/complete", rl.IPLimit("redeem:complete", 5, redeemH.Complete))

	// Relay (no auth — IP rate limited)
	mux.HandleFunc("POST /api/relay/transfers", rl.IPLimit("relay:upload", 10, relayH.Upload))
	mux.HandleFunc("GET /api/relay/transfers/{transfer_id}", rl.IPLimit("relay:download", 20, relayH.Download))

	// Bootstrap (unauthenticated)
	bootstrapH := bootstrap.NewHandler(svc.Bootstrap, svc.Audit)
	mux.HandleFunc("GET /api/v1/bootstrap/status", bootstrapH.Status)
	mux.HandleFunc("POST /api/v1/bootstrap", rl.IPLimit("bootstrap", 3, bootstrapH.Bootstrap))

	// Auth (unauthenticated)
	mux.HandleFunc("POST /api/v1/auth/login", rl.IPLimit("auth:login", 5, authH.Login))
	mux.HandleFunc("POST /api/v1/auth/register", rl.IPLimit("auth:register", 3, authH.Register))

	// Auth (authenticated)
	mux.HandleFunc("POST /api/v1/auth/logout", mid.Require(authH.Logout))
	mux.HandleFunc("GET /api/v1/auth/sessions", mid.Require(authH.ListSessions))
	mux.HandleFunc("POST /api/v1/auth/session/rotate", mid.Require(rl.IdentityLimit("auth:rotate", 10, authH.RotateSession)))
	mux.HandleFunc("DELETE /api/v1/auth/sessions/{id}", mid.Require(rl.IdentityLimit("auth:revoke", 20, authH.RevokeSession)))
	mux.HandleFunc("POST /api/v1/realtime/ticket", mid.Require(rl.IdentityLimit("realtime:ticket", 30, wsTicketH.Issue)))

	// Identity
	mux.HandleFunc("GET /api/v1/me", mid.Require(identityH.GetMe))
	mux.HandleFunc("GET /api/v1/me/permissions", mid.Require(identityH.GetPermissions))
	mux.HandleFunc("PATCH /api/v1/me", mid.Require(identityH.UpdateMe))
	mux.HandleFunc("GET /api/v1/members", mid.Require(rl.IdentityLimit("member:search", 30, identityH.SearchMembers)))
	mux.HandleFunc("GET /api/v1/members/{id}", mid.Require(identityH.GetMember))
	mux.HandleFunc("GET /api/v1/friends", mid.Require(identityH.ListFriends))
	mux.HandleFunc("POST /api/v1/friends/{id}/{action}", mid.Require(rl.IdentityLimit("friend:change", 20, identityH.ChangeFriendship)))

	// Invites
	mux.HandleFunc("POST /api/v1/invites", mid.Require(rl.IdentityLimit("invite:create", 10, inviteH.Create)))
	mux.HandleFunc("GET /api/v1/invites", mid.Require(inviteH.List))
	mux.HandleFunc("DELETE /api/v1/invites/{code}", mid.Require(inviteH.Revoke))

	// Admin
	mux.HandleFunc("GET /api/v1/admin/server-settings", mid.Require(adminH.GetServerSettings))
	mux.HandleFunc("PATCH /api/v1/admin/server-settings", mid.Require(adminH.UpdateServerSettings))
	mux.HandleFunc("GET /api/v1/admin/permission-settings", mid.Require(adminH.GetPermissionSettings))
	mux.HandleFunc("PATCH /api/v1/admin/permission-settings", mid.Require(adminH.UpdatePermissionSettings))
	mux.HandleFunc("GET /api/v1/admin/identities", mid.Require(adminH.ListIdentities))
	mux.HandleFunc("GET /api/v1/admin/backup", mid.Require(backupH.ListBackups))
	mux.HandleFunc("GET /api/v1/admin/migrations", mid.Require(backupH.ListMigrations))
	mux.HandleFunc("GET /api/v1/admin/audit", mid.Require(auditH.List))
	mux.HandleFunc("GET /api/v1/admin/maintenance", mid.Require(adminH.GetMaintenance))
	mux.HandleFunc("PATCH /api/v1/admin/maintenance-policy", mid.Require(adminH.UpdateMaintenancePolicy))
	mux.HandleFunc("POST /api/v1/admin/identities/{id}/roles", mid.Require(adminH.AssignRole))
	mux.HandleFunc("DELETE /api/v1/admin/identities/{id}/roles/{role}", mid.Require(adminH.RevokeRole))
	mux.HandleFunc("POST /api/v1/admin/identities/{id}/disable", mid.Require(adminH.DisableIdentity))
	mux.HandleFunc("POST /api/v1/admin/identities/{id}/enable", mid.Require(adminH.EnableIdentity))

	// Rooms
	mux.HandleFunc("GET /api/v1/rooms", mid.Require(roomH.List))
	mux.HandleFunc("POST /api/v1/rooms", mid.Require(roomH.Create))
	mux.HandleFunc("GET /api/v1/rooms/{id}", mid.Require(roomH.Get))
	mux.HandleFunc("PATCH /api/v1/rooms/{id}", mid.Require(roomH.Update))
	mux.HandleFunc("DELETE /api/v1/rooms/{id}", mid.Require(roomH.Delete))

	// Channels
	mux.HandleFunc("GET /api/v1/rooms/{room_id}/channels", mid.Require(channelH.List))
	mux.HandleFunc("POST /api/v1/rooms/{room_id}/channels", mid.Require(channelH.Create))
	mux.HandleFunc("PUT /api/v1/rooms/{room_id}/channels/order", mid.Require(channelH.Reorder))
	mux.HandleFunc("GET /api/v1/rooms/{room_id}/channels/{id}", mid.Require(channelH.Get))
	mux.HandleFunc("PATCH /api/v1/rooms/{room_id}/channels/{id}", mid.Require(channelH.Update))
	mux.HandleFunc("DELETE /api/v1/rooms/{room_id}/channels/{id}", mid.Require(channelH.Delete))

	// Messages
	mux.HandleFunc("GET /api/v1/rooms/{room_id}/channels/{channel_id}/messages", mid.Require(messageH.List))
	mux.HandleFunc("POST /api/v1/rooms/{room_id}/channels/{channel_id}/messages", mid.Require(rl.IdentityLimit("msg:send", 30, messageH.Send)))
	mux.HandleFunc("DELETE /api/v1/rooms/{room_id}/channels/{channel_id}/messages/{id}", mid.Require(messageH.Delete))

	// Attachments
	mux.HandleFunc("POST /api/v1/attachments/upload-url", mid.Require(rl.IdentityLimit("attach:upload", 10, attachH.RequestUpload)))
	mux.HandleFunc("POST /api/v1/attachments/{id}/confirm", mid.Require(attachH.Confirm))

	// Direct Messages
	mux.HandleFunc("POST /api/v1/dm/conversations", mid.Require(dmH.StartConversation))
	mux.HandleFunc("GET /api/v1/dm/conversations", mid.Require(dmH.ListConversations))
	mux.HandleFunc("POST /api/v1/dm/conversations/{id}/messages", mid.Require(rl.IdentityLimit("dm:send", 30, dmH.SendDM)))
	mux.HandleFunc("GET /api/v1/dm/conversations/{id}/messages", mid.Require(dmH.ListDMs))
	mux.HandleFunc("DELETE /api/v1/dm/conversations/{id}/messages/{msg_id}", mid.Require(dmH.DeleteDM))

	// RTC
	mux.HandleFunc("POST /api/v1/rtc/token", mid.Require(rtcH.IssueToken))
	mux.HandleFunc("GET /api/v1/rtc/ice-servers", mid.Require(rtcH.IceServers))
	mux.HandleFunc("GET /api/v1/rtc/stats", mid.Require(rtcH.Stats))

	// Voice rooms
	mux.HandleFunc("POST /api/v1/rtc/rooms/{channel_id}/join", mid.Require(voiceH.Join))
	mux.HandleFunc("POST /api/v1/rtc/rooms/{channel_id}/leave", mid.Require(voiceH.Leave))
	mux.HandleFunc("POST /api/v1/rtc/rooms/{channel_id}/heartbeat", mid.Require(voiceH.Heartbeat))
	mux.HandleFunc("PATCH /api/v1/rtc/rooms/{channel_id}/state", mid.Require(voiceH.UpdateState))
	mux.HandleFunc("GET /api/v1/rtc/rooms/{channel_id}/participants", mid.Require(voiceH.ListParticipants))

	// Search
	mux.HandleFunc("GET /api/v1/search/messages", mid.Require(searchH.SearchMessages))
	mux.HandleFunc("GET /api/v1/search/dm", mid.Require(searchH.SearchDMs))

	// Presence
	mux.HandleFunc("GET /api/v1/presence", mid.Require(svc.Presence.GetPresence))

	// Push notifications
	mux.HandleFunc("POST /api/v1/push/token", mid.Require(notifH.RegisterToken))
	mux.HandleFunc("DELETE /api/v1/push/token", mid.Require(notifH.UnregisterToken))

	return &Server{
		http: &http.Server{
			Addr:              fmt.Sprintf(":%s", port),
			Handler:           svc.Metrics.Middleware(httputil.SecureHeaders(mux)),
			ReadHeaderTimeout: 5 * time.Second,
			ReadTimeout:       15 * time.Second,
			WriteTimeout:      15 * time.Second,
			IdleTimeout:       60 * time.Second,
			MaxHeaderBytes:    1 << 20,
		},
	}
}

func (s *Server) Start() error {
	slog.Info("server starting", "addr", s.http.Addr)
	return s.http.ListenAndServe()
}

func (s *Server) Shutdown(ctx context.Context) error {
	return s.http.Shutdown(ctx)
}
