# desktop-win

Electron Windows client target after core web and voice flows are stable.

## Screen Share (screenshare-hq-v2)

- Electron source picker: clicking "Share Screen" calls `electronAPI.getScreenSources()` via IPC → `desktopCapturer.getSources()` in main process → shows `ScreenSourcePicker` modal with thumbnails.
- Quality: after source selection, `getUserMedia({ video: { mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId, minWidth: 1920, maxWidth: 1920, minHeight: 1080, maxHeight: 1080, minFrameRate: 60, maxFrameRate: 60 } } })` captures at 1920×1080/60fps. Fallback: `setScreenShareEnabled` with ideal quality hints.
- Track ended: auto-stop when OS terminates capture.
- Remote video: same as web-client.

## Camera (camera-voice-v1)

- Remote camera rendering: `Track.Source.Camera` tracks subscribed in `RoomEvent.TrackSubscribed`, rendered in `.camera-area` flex grid (same DOM-mounting pattern as screen share).
- Local preview: muted `<video>` self-preview in `.camera-preview-local` shown when camera is on.
- Track ended: `MediaStreamTrack.ended` auto-stops camera and resets UI/server state.
- E2E tests verify camera/screen toggles, server state, participant icons, local camera preview, Electron source-picker constraints, and remote `.camera-area` / `.screen-share-area` video rendering using fake media devices.
