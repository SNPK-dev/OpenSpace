# Server Actions Dropdown Spec

## Behavior

### Scenario: Owner flow

GIVEN an owner is signed into a selected server

WHEN the owner opens the server dropdown

THEN invite creation, server settings, create channel, profile settings, role/member management, and leave server actions are available and each opens a working dialog.

### Scenario: Admin flow

GIVEN an admin has `invite.create`, `channel.create`, `server.manage`, `identity.manage`, and `role.manage`

WHEN the admin opens the server dropdown

THEN the admin sees the matching actions and can create invites, update server settings, create channels, update their profile, and manage member roles.

### Scenario: Moderator flow

GIVEN a moderator lacks server management permissions but may have invite or channel permissions

WHEN the moderator opens the server dropdown

THEN only allowed privileged actions are visible, profile settings and leave server remain available, and forbidden admin settings are hidden.

### Scenario: Member flow

GIVEN a member has been granted `invite.create` or `channel.create` from `/admin/permissions`

WHEN the member opens the server dropdown

THEN the member sees only those granted actions plus profile settings and leave server, and can complete the granted action from a dialog.

### Scenario: Guest flow

GIVEN a guest has no privileged permissions

WHEN the guest opens the server dropdown

THEN the guest sees profile settings and leave server only, without invite, server settings, channel creation, or role management actions.

### Scenario: Failure and reconnect

GIVEN permission or settings requests fail during reconnect

WHEN the user opens the server dropdown

THEN privileged actions default hidden, dialogs surface failed saves without losing local sidebar state, and permissions are reloaded when the selected server changes.
