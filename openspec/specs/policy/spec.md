# Spec: policy

## Capability

Centralized permission matrix for the five system roles. All permission checks in the codebase
use `policy.Can(role, action)` rather than comparing role name strings.

---

### Requirement: action constants

The policy package defines typed `Action` constants covering all permissioned operations for MVP.

Actions defined:

| Constant            | Description                                       |
|---------------------|---------------------------------------------------|
| CreateInvite        | Create invite codes                               |
| ManageRoles         | Assign or revoke system roles                     |
| ManageIdentities    | Disable / enable identities                       |
| ManageChannels      | Create, edit, delete channels / rooms             |
| ManageServer        | Edit server name, settings, public URL            |
| DeleteServer        | Permanently delete the server (owner only)        |
| ModerateMessages    | Delete any message, pin/unpin                     |
| MuteMembers         | Mute an identity in a channel                     |
| KickMembers         | Remove an identity from a room                    |
| SendMessages        | Send messages in accessible text channels         |
| ReadMessages        | Read messages in accessible text channels         |
| AttachFiles         | Upload files / attachments                        |
| JoinVoice           | Join voice rooms                                  |
| SendDirectMessages  | Send direct messages to other identities          |

---

### Requirement: permission matrix

`policy.Can(role string, action Action) bool` returns whether the given role has that permission.

| Action             | owner | admin | moderator | member | guest |
|--------------------|:-----:|:-----:|:---------:|:------:|:-----:|
| CreateInvite       |  ✓    |  ✓    |           |        |       |
| ManageRoles        |  ✓    |  ✓    |           |        |       |
| ManageIdentities   |  ✓    |  ✓    |           |        |       |
| ManageChannels     |  ✓    |  ✓    |           |        |       |
| ManageServer       |  ✓    |  ✓    |           |        |       |
| DeleteServer       |  ✓    |       |           |        |       |
| ModerateMessages   |  ✓    |  ✓    |    ✓      |        |       |
| MuteMembers        |  ✓    |  ✓    |    ✓      |        |       |
| KickMembers        |  ✓    |  ✓    |    ✓      |        |       |
| SendMessages       |  ✓    |  ✓    |    ✓      |  ✓     |       |
| ReadMessages       |  ✓    |  ✓    |    ✓      |  ✓     |  ✓    |
| AttachFiles        |  ✓    |  ✓    |    ✓      |  ✓     |       |
| JoinVoice          |  ✓    |  ✓    |    ✓      |  ✓     |  ✓    |
| SendDirectMessages |  ✓    |  ✓    |    ✓      |  ✓     |       |

#### Scenario: owner has all permissions

GIVEN the role "owner"
WHEN `policy.Can("owner", action)` is called for any defined action
THEN it returns true

#### Scenario: guest is read-only + voice

GIVEN the role "guest"
WHEN `policy.Can("guest", ReadMessages)` is called
THEN it returns true
WHEN `policy.Can("guest", SendMessages)` is called
THEN it returns false

#### Scenario: unknown role has no permissions

GIVEN an unknown role string
WHEN `policy.Can("unknown-role", action)` is called
THEN it returns false for all actions

---

### Requirement: multi-role check

`policy.CanAny(roles []string, action Action) bool` returns true if any of the provided roles
grants the action. Used by handlers that load an identity's full role list.

#### Scenario: identity with member + moderator

GIVEN an identity with roles ["member", "moderator"]
WHEN `policy.CanAny(roles, ModerateMessages)` is called
THEN it returns true

#### Scenario: identity with only member role

GIVEN an identity with roles ["member"]
WHEN `policy.CanAny(roles, CreateInvite)` is called
THEN it returns false
