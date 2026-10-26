# Bounded Contexts

The core domain is split by responsibility, not by future deployment units. Runtime services may host several contexts, but the vocabulary below should stay stable.

## Server Administration

Owns server lifecycle, settings, health, backups, owner continuity, and install-local operational controls.

## Identity/Auth

Owns server-local identities, sessions, invites, disablement, profile data, and service identities. It does not introduce global accounts.

## Authorization

Owns roles, permissions, role assignments, room overrides, and permission vocabulary. Runtime evaluation order is deferred.

## Rooms

Owns categories, text rooms, voice rooms, room membership, visibility, and room-level policy.

## Messaging

Owns durable message content, ordering, edits, deletes, read history, and moderation state.

## Files

Owns attachment metadata, object storage references, retention, and future scan/quarantine hooks.

## Direct Messages

Owns local DM threads and participants. A DM thread never includes identities from another server.

## Realtime

Owns ephemeral presence, typing state, read receipts, sequence cursors, and reconnect state.

## Media

Owns voice-session state, LiveKit room mapping, participant media controls, and moderation actions during live sessions.

## Audit/Compliance

Owns audit events, security events, export evidence, retention evidence, and future compliance reporting.
