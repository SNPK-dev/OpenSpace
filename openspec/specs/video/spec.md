# Spec: video

## Capability

Video room support via LiveKit. Camera and screen tracks are published through the same
LiveKit room used for voice. Server controls publishable sources via JWT claim.
Application-level camera and screen-sharing state is tracked in Redis alongside
mute/deafen state.

---

### Overview

- LiveKit SFU handles video media transport.
- POST /api/v1/rtc/token `sources` field controls which tracks the JWT allows.
- `camera_enabled` on `Participant` is an advisory flag set by the client after
  successfully publishing a camera track.
- `screen_sharing` on `Participant` is an advisory flag set by the client after
  successfully publishing a screen-share track.
- No separate video endpoints are required; clients update camera/screen state via
  the existing voice state endpoint.

---

### Participant Object (extended)

```json
{
  "id": "uuid",
  "username": "string",
  "display_name": "string",
  "muted": false,
  "deafened": false,
  "camera_enabled": false,
  "screen_sharing": false
}
```

`camera_enabled` and `screen_sharing` are advisory — reflect client-reported state,
not authoritative SFU track presence.

---

### Screen Share Quality

Clients request high-quality screen capture:

- web-client: `setScreenShareEnabled(true, { resolution: { width: 1920, height: 1080, frameRate: 60 }, contentHint: 'detail', audio: false })`
- desktop-win: Electron source picker uses `desktopCapturer.getSources()`, then captures the selected source with `chromeMediaSource: 'desktop'`, 1920x1080 dimensions, and 60 fps constraints.

Desktop screen-share tracks are published with `source: Track.Source.ScreenShare`,
`videoEncoding.maxBitrate = 8_000_000`, `videoEncoding.maxFramerate = 60`, and
`videoSimulcast = false`.

---

### Rendering

Clients subscribe to remote LiveKit video tracks in the voice pane:

- `Track.Source.ScreenShare` renders inside `.screen-share-area`.
- `Track.Source.Camera` renders inside `.camera-area`.
- Local camera preview renders as muted `.camera-preview-local`.

When a local camera or screen-share `MediaStreamTrack` fires `ended`, the client
stops the publication, resets the UI state, and sends the corresponding false
advisory state to the server.

---

### Token Sources

| sources value              | Effect                             |
|----------------------------|------------------------------------|
| omitted / empty            | Full permissions (cam+mic+screen)  |
| `["microphone"]`           | Audio only                         |
| `["camera","microphone"]`  | Audio + video; no screen share     |
| `["screen_share"]`         | Screen only                        |

---

### Events

`voice.state_changed` carries `camera_enabled` and `screen_sharing` in the
participant payload — no new event type needed.
