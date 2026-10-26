# Spec: persistent-active-voice-room

## Capability

Web and Windows desktop clients keep one active voice room session alive independently from the currently selected room route.

---

### Requirement: background-voice-session

After a user joins a voice room, changing the selected room, channel, or server in the client MUST NOT leave that voice room.

#### Scenario: navigate from voice to text

GIVEN a user has joined voice room A
WHEN the user selects a text room
THEN the client remains joined to voice room A
AND the client does not call the voice leave API for room A
AND microphone/audio media remain controlled by the active voice session.

#### Scenario: navigate to another server

GIVEN a user has joined a voice room on server A
WHEN the user selects another added server
THEN the active voice room remains joined unless the action explicitly closes server A state.

---

### Requirement: single-active-voice-room

The client MUST allow only one active voice room at a time.

#### Scenario: join a second voice room

GIVEN a user is joined to voice room A
WHEN the user joins voice room B
THEN the client leaves voice room A first
AND then joins voice room B
AND only voice room B is active in client state.

---

### Requirement: explicit-closing-actions-leave-voice

Explicit closing actions MUST leave the active voice room and clean up media resources.

#### Scenario: explicit leave

GIVEN a user is joined to a voice room
WHEN the user clicks Leave in the voice UI
THEN the client leaves the voice room
AND stops local media tracks
AND disconnects the LiveKit room
AND stops voice heartbeats.

#### Scenario: vault or server state closes

GIVEN a user is joined to a voice room
WHEN the user locks the vault, logs out, removes the server, or leaves the server
THEN the client leaves the active voice room before clearing the related client state.

---

### Requirement: no-duplicate-media-session

Route changes and voice-room switches MUST NOT create duplicate LiveKit sessions or leaked media tracks.

#### Scenario: return to active voice route

GIVEN a user is joined to voice room A
WHEN the user navigates away from A and then returns to A
THEN the client reuses the active voice UI/session
AND does not create a second LiveKit room for A.
