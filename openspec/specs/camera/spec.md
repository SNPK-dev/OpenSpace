# camera Specification

## Purpose
Define camera publishing in voice rooms, including local preview, remote camera
video rendering, and local track-ended cleanup.
## Requirements
### Requirement: Remote camera video tracks MUST be rendered in the voice pane

When another participant enables their camera, all viewing clients MUST subscribe to and display the camera video track in the voice pane.

#### Scenario: Observer sees participant's camera video

- **GIVEN** User A enables their camera in a voice channel
- **WHEN** User B is viewing the same channel
- **THEN** User B's LiveKit client subscribes to User A's `Track.Kind.Video` + `Track.Source.Camera` track
- **AND** a video element appears inside `.camera-area` in the voice pane showing User A's camera feed

#### Scenario: Camera video removed when participant turns off camera

- **GIVEN** User A had their camera on and User B was viewing it
- **WHEN** User A disables their camera
- **THEN** the LiveKit `TrackUnsubscribed` event fires on User B's client
- **AND** the video element is removed from User B's `.camera-area`

### Requirement: Local camera preview MUST be shown to the user who enabled it

When a participant enables their own camera, a muted self-preview video element MUST appear in the voice pane.

#### Scenario: Local camera preview appears on enable

- **GIVEN** a user is joined to a voice channel
- **WHEN** the user clicks "Cam On"
- **THEN** `setCameraEnabled(true)` succeeds
- **AND** a muted `<video>` element attached to the local camera `MediaStreamTrack` appears as `.camera-preview-local`

#### Scenario: Local camera preview disappears on disable

- **GIVEN** a user has their camera enabled and the preview is visible
- **WHEN** the user clicks "Cam Off"
- **THEN** the `.camera-preview-local` video element is removed from the DOM

### Requirement: Client MUST auto-stop camera when OS terminates the camera track

When the local camera `MediaStreamTrack` fires the `ended` event, the client MUST disable the camera publication, reset UI state, and update server state without requiring user action.

#### Scenario: OS terminates camera track

- **GIVEN** a user has their camera enabled
- **WHEN** the OS closes the camera session (device unplugged, permission revoked)
- **THEN** `MediaStreamTrack.ended` fires
- **AND** the client calls `setCameraEnabled(false)` or equivalent cleanup
- **AND** `cameraOn` UI state resets to false (button returns to "Cam On")
- **AND** the server receives `PATCH /rtc/rooms/{id}/state` with `camera_enabled: false`

### Requirement: Web-client voice E2E suite MUST include a camera test

The web-client E2E voice spec MUST include a test that verifies camera button toggle and server state via API poll using the fake device already configured in `playwright.config.ts`.

#### Scenario: Camera E2E test with fake device

- **GIVEN** Playwright is launched with `--use-fake-device-for-media-stream` and `--use-fake-ui-for-media-stream`
- **WHEN** the camera test runs in headless Chromium
- **THEN** clicking "Cam On" changes the button to "Cam Off" within 5s
- **AND** `GET /rtc/rooms/{id}/participants` returns `camera_enabled: true` within 6s
- **AND** clicking "Cam Off" changes the button back to "Cam On"
- **AND** the server returns `camera_enabled: false`
