# client-content-security Specification

## Purpose
TBD - created by archiving change client-content-security-hardening. Update Purpose after archive.
## Requirements
### Requirement: Production browser CSP

Web and admin responses SHALL enforce a CSP that blocks remote/eval scripts, objects, framing, base replacement, and untrusted form actions while preserving supported secure application resources.

#### Scenario: Any authenticated role loads supported clients

- **GIVEN** an owner, admin, moderator, member, or guest opens web/admin over HTTPS
- **WHEN** the SPA loads and connects to a secure OpenSpace server
- **THEN** bundled UI, HTTPS/WSS API/realtime/media, fonts, avatars, and blob workers function under CSP

#### Scenario: Injected executable content

- **GIVEN** rendered content contains an inline/eval/remote executable payload
- **WHEN** the browser evaluates policy
- **THEN** execution is blocked

### Requirement: Trusted Electron renderer boundary

Electron SHALL enable sandbox/context isolation, reject untrusted renderer navigation and IPC, and grant media permissions only to the trusted application renderer.

#### Scenario: Hostile navigation or popup

- **GIVEN** compromised content requests navigation, a popup, or a custom-protocol external launch
- **WHEN** Electron handles the request
- **THEN** it is denied without replacing the renderer or invoking the OS handler

#### Scenario: Safe external HTTPS link

- **GIVEN** the trusted renderer requests an HTTPS external link
- **WHEN** Electron handles the new-window request
- **THEN** it opens only in the operating-system browser and no Electron child window is created

#### Scenario: Untrusted permission or IPC caller

- **GIVEN** a non-application frame requests media or screen-source IPC
- **WHEN** Electron evaluates the caller
- **THEN** access is denied

### Requirement: Development and production separation

Security policy SHALL allow exact local development origins only when the Electron application is not packaged and SHALL never enable production DevTools shortcuts or `unsafe-eval`.

#### Scenario: Packaged reconnect

- **GIVEN** a packaged client reconnects to an HTTPS/WSS server
- **WHEN** API and realtime connections resume
- **THEN** CSP permits them without relaxing script execution or renderer trust
