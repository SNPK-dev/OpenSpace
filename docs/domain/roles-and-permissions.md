# Roles and Permissions

OpenSpace permissions use a stable `resource.verb` shape. This document defines vocabulary only; runtime inheritance and evaluation order are deferred.

## Seed Roles

| Role | Purpose |
| --- | --- |
| `owner` | Non-orphanable server control role with full administrative responsibility. |
| `admin` | Operational administrator for identity, rooms, settings, and audit workflows. |
| `moderator` | Conversation and media moderator for messages, room access, and voice controls. |
| `member` | Standard participant who can join rooms, send messages, upload files, DM locally, and join voice. |
| `guest` | Restricted participant whose access is granted through room visibility and overrides. |

## Permission Vocabulary

| Permission | Meaning |
| --- | --- |
| `server.manage` | Full server administration. |
| `server.view_health` | View operational health and status. |
| `server.manage_settings` | Change server settings. |
| `server.manage_backups` | Manage backup and restore operations. |
| `identity.invite` | Invite identities to the server. |
| `identity.disable` | Disable a server identity. |
| `identity.manage_roles` | Assign or remove identity roles. |
| `identity.view_audit` | View identity-related audit records. |
| `role.create` | Create roles. |
| `role.update` | Update roles. |
| `role.delete` | Delete roles. |
| `role.assign` | Assign roles to identities. |
| `room.create` | Create rooms. |
| `room.update` | Update room metadata and settings. |
| `room.archive` | Archive rooms. |
| `room.view` | View a room. |
| `room.join` | Join a room. |
| `room.manage_access` | Manage room membership and overrides. |
| `message.send` | Send messages. |
| `message.edit_own` | Edit own messages. |
| `message.delete_own` | Delete own messages. |
| `message.delete_any` | Delete any message for moderation. |
| `message.read_history` | Read message history. |
| `file.upload` | Upload attachments. |
| `file.download` | Download attachments. |
| `file.delete_own` | Delete own attachments. |
| `file.delete_any` | Delete any attachment for moderation or policy. |
| `member.search` | Search active identities on the current server. |
| `profile.view` | View privacy-safe server profiles. |
| `friend.request` | Manage server-local friend relationships. |
| `dm.create` | Create local DM threads. |
| `dm.send` | Send local DM messages. |
| `dm.receive` | Receive local DM messages. |
| `voice.join` | Join a voice session. |
| `voice.speak` | Transmit voice. |
| `voice.mute_self` | Mute self. |
| `voice.deafen_self` | Deafen self. |
| `voice.mute_others` | Mute other participants. |
| `voice.move_others` | Move participants between voice rooms. |
| `audit.view` | View audit logs. |
| `audit.export` | Export audit logs. |

## Role Baseline

- `owner`: all permissions and owner continuity responsibility.
- `admin`: server settings, identity, role assignment, room administration, audit viewing, and backup operations except owner transfer rules.
- `moderator`: room access moderation, message moderation, attachment moderation, and voice moderation.
- `member`: ordinary participation permissions for rooms, messages, files, local DMs, and voice.

Friendships and member discovery are strictly server-local. Public member profiles never expose email or authentication metadata. Server owners can enable or disable discovery, profile viewing, friendship requests, DM creation, and DM sending independently through the existing role permission settings.
- `guest`: minimal room visibility, message, and voice access when explicitly granted.
