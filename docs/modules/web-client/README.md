# web-client

User-facing web client for adding a server by URL/IP, server-scoped login, text, DM, files, and voice rooms.

## Screen Share (screenshare-hq-v2)

- Quality: `setScreenShareEnabled(true, { resolution: { width: 1920, height: 1080, frameRate: 60 }, contentHint: 'detail' })` — browser passes ideal 1080p/60fps constraints to `getDisplayMedia`.
- Track ended: `MediaStreamTrack.ended` event triggers auto-stop and resets UI/server state.
- Remote video rendering: incoming screen share video tracks are subscribed and rendered in `.screen-share-area` section of VoicePane.

## Camera (camera-voice-v1)

- Remote camera rendering: `Track.Source.Camera` tracks subscribed in `RoomEvent.TrackSubscribed`, rendered in `.camera-area` flex grid.
- Local preview: muted `<video>` self-preview in `.camera-preview-local` (bottom-right corner of voice pane) shown when camera is enabled.
- Track ended: `MediaStreamTrack.ended` auto-stops camera and resets UI/server state.
- E2E tests: `Voice — screen share` and `Voice — camera` verify button toggles, server state, participant icons, local camera preview, and remote `.screen-share-area` / `.camera-area` video rendering using fake media devices.
