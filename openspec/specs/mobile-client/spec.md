# Spec: mobile-client

## Capability

iOS and Android member-facing application. Feature-equivalent to the web-client:
text chat, voice/video rooms, direct messages, and real-time presence.

---

### Requirement: auth

Login: `POST /api/v1/auth/login`. Register: `POST /api/v1/auth/register` with invite code.
Token stored in `AsyncStorage` under key `openspace_token` and loaded into memory at startup.
On 401: token cleared, navigation reset to Login screen.

---

### Requirement: navigation

Bottom tabs: **Channels** (rooms → channels → chat/voice) and **DMs** (conversation list → DM chat).
Implemented with React Navigation v6 native stack + bottom tabs.

---

### Requirement: text-chat

Same semantics as web-client: load newest 50 messages, scroll-up for older (inverted FlatList + `onEndReached`), send on submit, delete own message. Real-time via `message.created`/`message.deleted` WS events.

---

### Requirement: voice-video

Same join/leave/heartbeat flow as web-client. Uses `@livekit/react-native` for WebRTC media (requires Expo development build or bare workflow — not Expo Go). Mute and camera toggle only on mobile (screen share omitted in v1).

Voice heartbeat: `POST /api/v1/rtc/rooms/{id}/heartbeat` every 20s. Stopped and room disconnected on screen unmount.

---

### Requirement: direct-messages

Same semantics as web-client DM pane. Real-time via `dm.message.created` WS event.

---

### Requirement: websocket-client

Same WSProvider as web-client. WS base from `EXPO_PUBLIC_WS_URL` (default `ws://localhost:4000`). Auto-reconnect every 3s. 25s ping keepalive.

---

## Technology

- Expo 51, React Native 0.74, TypeScript
- React Navigation v6 (native-stack + bottom-tabs)
- `@livekit/react-native` v2 + `@livekit/react-native-webrtc`
- `@react-native-async-storage/async-storage` for token persistence
- `EXPO_PUBLIC_API_URL` / `EXPO_PUBLIC_WS_URL` for server targeting
