# Spec: voice-participants-channel-tree

## Capability

Clients show active voice room participants under voice room names in the channel tree.

---

### Requirement: render-voice-participants-under-room

For every loaded voice room with active participants, the channel tree MUST render those participants directly below the voice room entry.

#### Scenario: voice room has participants

GIVEN the channel tree has loaded a voice room
AND the voice room has active participants
WHEN the user views the channel tree
THEN the participants are shown below that voice room name.

---

### Requirement: realtime-voice-participant-updates

The participant list in the channel tree MUST update when voice membership or state changes arrive through realtime events.

#### Scenario: participant joins

GIVEN a voice room is visible in the channel tree
WHEN a `voice.joined` event arrives for that room
THEN the participant appears under that room without opening it.

#### Scenario: participant leaves

GIVEN a participant is listed under a voice room
WHEN a `voice.left` event arrives for that room and identity
THEN the participant is removed from that room list.

#### Scenario: participant state changes

GIVEN a participant is listed under a voice room
WHEN a `voice.state_changed` event arrives for that participant
THEN muted/deafened/camera/screen indicators in the tree update.

---

### Requirement: compact-channel-tree-layout

The voice participant list MUST remain compact and visually subordinate to the channel item.

#### Scenario: many participants

GIVEN several participants are in a voice room
WHEN the sidebar renders the list
THEN rows remain compact, names truncate safely, and the channel tree layout remains usable.
