# Spec: web-client

## Capability

Member-facing single-page application. Provides text chat, voice/video rooms, direct messages,
and real-time presence for regular users. Vault-based identity: no server URL or credentials are
baked in. Users add servers at runtime via the vault flow.

---

### Requirement: vault-flow

The vault is the single source of identity and server configuration.

Routing is driven by vault state:
- `no_vault` → `/onboarding` (create vault + profile)
- `locked` → `/unlock` (enter password to decrypt vault)
- `unlocked` → main app (ServerRail + Sidebar + content panes)

`VaultContext` is backed by IndexedDB (`openspace_vault` database). The master key lives in memory only.

On unlock, the first joined server is auto-selected. `App.tsx` useEffect syncs the active server's `access_token` → `AuthContext.setAuth(token)` whenever vault unlocks or `selectedServerId` changes.

---

### Requirement: server-rail

`ServerRail` renders one button per vault server entry. Clicking a server calls `selectServer()`, which updates `selectedServerId` in `VaultContext`, triggering a re-sync of the access token into `AuthContext`.

`<WSProvider key={selectedServerId}>` ensures a fresh WS connection is opened when the active server changes.

---

### Requirement: server-navigation

Sidebar shows rooms fetched from `GET /api/v1/rooms`. Clicking a room expands it and
fetches channels via `GET /api/v1/rooms/{room_id}/channels`. Text channels navigate to
`/channels/{id}` (ChatPane), voice channels to `/channels/{id}` (VoicePane).

DM conversation list fetched from `GET /api/v1/dm/conversations`. Each entry navigates
to `/dm/{conversation_id}` (DMPane).

Sidebar reloads identity, rooms, and DM conversations on `selectedServerId` change.

---

### Requirement: text-chat

**ChatPane** — rendered for `type = "text"` channels.

- Load messages: `GET .../messages?limit=50` (newest-first). "Load older" button pages with `before=` cursor.
- Send message: Enter key or send (no Shift+Enter). `POST .../messages`.
- Delete own message: ✕ button (visible on hover). `DELETE .../messages/{id}`.
- Real-time: `message.created` event prepends message; `message.deleted` event removes it.

---

### Requirement: voice-video

**VoicePane** — rendered for `type = "voice"` channels.

Join flow:
1. `POST /api/v1/rtc/rooms/{channel_id}/join` → participant list
2. `GET /api/v1/rtc/ice-servers` + `POST /api/v1/rtc/token` (sources: camera, microphone, screen_share)
3. `LivekitRoom.connect(livekit_url, token, { iceServers })`

Controls (while joined): mute, deafen, camera on/off, screen share on/off, leave.
Each toggle calls `PATCH /api/v1/rtc/rooms/{id}/state` and the LiveKit local participant API.

Voice heartbeat: `POST /api/v1/rtc/rooms/{id}/heartbeat` every 20 seconds while joined.

Real-time events: `voice.joined` adds tile, `voice.left` removes tile, `voice.state_changed` updates icons.

---

### Requirement: direct-messages

**DMPane** — rendered for DM conversations.

- Load messages: `GET /api/v1/dm/conversations/{id}/messages` with load-more cursor.
- Send: Enter key. `POST .../messages`.
- Delete own: `DELETE .../messages/{msg_id}`.
- Real-time: `dm.message.created` event prepends message.

---

### Requirement: websocket-client

`WSProvider` opens `ws://{host}/ws?token={token}`. Auto-reconnects every 3s on disconnect.
Sends `{"type":"ping"}` every 25s for keepalive. Pong frames are silently discarded.

`useWSEvent(type, handler)` hook subscribes a component to specific event types, auto-unsubscribing on unmount.

Connected state shown as green dot in the user bar.

---

## Technology

- React 18 + TypeScript, Vite 6, React Router v6 (BrowserRouter)
- `livekit-client` v2 for WebRTC media
- Plain CSS (dark theme, no external UI library)
- `client_type: 'web'` sent in device registration and pairing API calls
- Dev proxy: `/api` → `localhost:8080`, `/ws` → `localhost:4000`; port 5174
