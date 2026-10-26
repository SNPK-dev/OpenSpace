# realtime-gateway

Realtime websocket gateway for presence, typing, read state, and RTC coordination events.

The gateway emits and consumes `RealtimeEvent` payloads from `packages/contracts/proto/openspace/v1/events.proto`. Event sequence is scoped to the stream named by the envelope.
