# Spec: desktop-win

## Capability

Windows desktop client. Electron 31 app wrapping React UI.
Server-agnostic: no server URL is baked in at build time. Users add servers at runtime via the vault flow.

---

### Requirement: electron-shell

`BrowserWindow` with `contextIsolation: true`, `nodeIntegration: false`. Renderer cannot access Node.js APIs. Preload exposes only `window.electronAPI.getConfig()` and `window.electronAPI.platform`.

Custom `openspace://` URI scheme registered for deep-link support.

External `window.open()` calls from the renderer are redirected to the OS default browser.

---

### Requirement: server-agnostic-client

No server URL is injected at build time. The Vite `define` block is absent.

The renderer's `api/client.ts` keeps module-level `_apiBase`, `_wsBase`, `_token`. These are set by `VaultContext` when the user selects a server via `selectServer()`. `setActiveServer(apiBase, wsBase, token)` and `clearActiveServer()` are the only write paths.

WS URL is derived from the server URL at selection time:
- `https://` → `wss://`
- `http://` → `ws://`

---

### Requirement: vault-flow

The vault is the single source of identity and server configuration. There is no username/password login form.

Routing is driven by vault state:
- `no_vault` → `/onboarding` (create vault + profile)
- `locked` → `/unlock` (enter password to decrypt vault)
- `unlocked` → main app (ServerRail + Sidebar + content panes)

`VaultContext` is backed by IndexedDB (`openspace_vault` database). The master key lives in memory only and is never written to disk.

On unlock, the first joined server is auto-selected and `setActiveServer()` is called.
On lock, `clearActiveServer()` is called and all server state is cleared from memory.

---

### Requirement: server-rail

`ServerRail` renders one button per vault server entry. Clicking a server calls `selectServer()` in `VaultContext`, which calls `setActiveServer()` and updates `selectedServerId` state. Active server is visually highlighted. An "Add server" button opens `AddServerModal`.

`<WSProvider key={selectedServerId}>` ensures a fresh WS connection is opened when the active server changes.

---

### Requirement: feature-parity

Identical feature set to `web-client`:
- Rooms → channels sidebar (text + voice)
- Text chat with real-time WS events and load-more pagination
- Voice/video rooms via LiveKit WebRTC with mute/camera/screen-share/deafen controls
- DM conversations
- WebSocket keepalive (25s ping) and auto-reconnect
- Voice heartbeat every 20s

Identity is fetched directly via `api.me.get()` in components that need it, keyed on `selectedServerId` change.

---

### Requirement: packaging

`electron-builder` with `win: { target: "nsis" }`. Produces an NSIS `.exe` installer.
`electron-vite build && electron-builder --dir` produces an unpacked portable build for testing.
Build requires no environment variables.

---

## Technology

- Electron 31, electron-vite 2, electron-builder 25
- React 18 + TypeScript, react-router-dom v6 (HashRouter for file://), livekit-client v2
- IndexedDB vault (no localStorage for auth tokens)
- `client_type: 'windows'` sent in device registration and pairing API calls
