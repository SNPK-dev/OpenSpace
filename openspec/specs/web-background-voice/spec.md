# Web background voice

## Purpose

Keep one active web voice session alive while the user navigates elsewhere in the client.

## Requirements

### Requirement: route-navigation-preserves-active-voice

After voice join succeeds, navigating to a text channel or DM MUST NOT invoke voice leave or disconnect the active LiveKit session.

### Requirement: explicit-actions-leave-voice

Explicit Leave, voice-room switching, vault lock, and active-server removal MUST continue to end the active voice session.
