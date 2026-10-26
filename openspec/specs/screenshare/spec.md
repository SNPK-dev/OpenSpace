# screenshare Specification

## Purpose
Define high-quality screen sharing in voice rooms, including Electron source
selection, remote video rendering, and local track-ended cleanup.
## Requirements
### Requirement: Screen share captures at ≥1080p and ≥60fps ideal constraints

Screen share capture MUST request ideal quality constraints (1920×1080, 60fps, contentHint detail) via the appropriate API for each client platform.

#### Scenario: Web-client quality constraints

- **GIVEN** a user is joined to a voice channel on web-client
- **WHEN** the user clicks "Share Screen" and selects a source in the browser picker
- **THEN** `setScreenShareEnabled` is called with `resolution: { width: 1920, height: 1080, frameRate: 60 }` and `contentHint: 'detail'`
- **AND** the browser requests those ideal dimensions and frame rate from `getDisplayMedia`

#### Scenario: Electron quality constraints via chromeMediaSource

- **GIVEN** a user is joined to a voice channel on Electron desktop-win
- **WHEN** the user selects a source in the Electron picker
- **THEN** `getUserMedia` is called with `mandatory: { chromeMediaSource: 'desktop', minWidth: 1920, maxWidth: 1920, minHeight: 1080, maxHeight: 1080, minFrameRate: 60, maxFrameRate: 60 }`
- **AND** the resulting track is published to LiveKit with `videoEncoding: { maxBitrate: 8_000_000, maxFramerate: 60 }`

### Requirement: Electron desktop-win MUST present a source picker before capture begins

The Electron client MUST show a modal listing all available screens and windows with thumbnails when the user clicks "Share Screen".

#### Scenario: Source picker appears and allows selection

- **GIVEN** a user joined to a voice channel clicks "Share Screen" on desktop-win
- **WHEN** `electronAPI.getScreenSources()` returns sources from the main process
- **THEN** a picker modal appears with thumbnail images and source names
- **AND** clicking any source tile starts capture of that specific source at high quality
- **AND** the button changes to "Stop Share"
- **AND** `screen_sharing: true` is sent to the server

#### Scenario: Picker cancel does not start share

- **GIVEN** the Electron source picker is open
- **WHEN** the user presses ESC or clicks Cancel
- **THEN** no stream is captured and no server state update is sent
- **AND** the button remains "Share Screen"

### Requirement: Remote screen share video MUST be rendered in the voice pane

When another participant is sharing their screen, all viewing clients MUST subscribe to and display the screen share video track in the voice pane.

#### Scenario: Observer sees sharer's screen

- **GIVEN** User A starts screen sharing in a voice channel
- **WHEN** User B is viewing the same channel
- **THEN** User B's LiveKit client subscribes to User A's Video+ScreenShare track
- **AND** a video element appears inside `.screen-share-area` in the voice pane showing User A's screen

#### Scenario: Video removed when sharing stops

- **GIVEN** User A was sharing their screen and User B was viewing it
- **WHEN** User A stops sharing
- **THEN** the LiveKit TrackUnsubscribed event fires on User B's client
- **AND** the video element is removed from User B's `.screen-share-area`

### Requirement: Client MUST auto-stop sharing when OS terminates the capture track

When the underlying `MediaStreamTrack` fires the `ended` event, the client MUST stop publishing and update UI and server state without requiring user action.

#### Scenario: OS terminates screen capture

- **GIVEN** a user is actively sharing their screen
- **WHEN** the OS closes the capture session (user closed sharing bar, tab lost focus, system cancelled)
- **THEN** `MediaStreamTrack.ended` fires
- **AND** the client stops the screen share track publication
- **AND** the button reverts to "Share Screen"
- **AND** the server receives `PATCH /rtc/rooms/{id}/state` with `screen_sharing: false`

### Requirement: Web-client voice E2E suite MUST include a screen share test

The web-client E2E voice spec MUST include a test that verifies screen share button toggle and server state via API poll.

#### Scenario: Screen share E2E test with mocked getDisplayMedia

- **GIVEN** `getDisplayMedia` is mocked to return a 1920×1080 canvas stream at 60fps
- **WHEN** the screen share test runs in headless Playwright
- **THEN** clicking "Share Screen" changes button to "Stop Share" within 5s
- **AND** `GET /rtc/rooms/{id}/participants` returns `screen_sharing: true` within 6s
- **AND** clicking "Stop Share" changes button back to "Share Screen"
- **AND** server returns `screen_sharing: false`
