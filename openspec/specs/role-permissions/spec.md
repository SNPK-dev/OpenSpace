# Role Permissions Spec

## Requirements

### Requirement: Admin Permission Matrix

Admins SHALL be able to configure which seed roles are allowed for supported permission actions.

#### Scenario: Admin reads permission settings

GIVEN an identity can manage the server
WHEN they open permission settings
THEN they see each supported action
AND they see the allowed roles for that action.

#### Scenario: Admin updates permission settings

GIVEN an identity can manage the server
WHEN they set `channel.create` to `owner` and `admin`
THEN only those roles are allowed by the effective policy for channel creation.

#### Scenario: Invalid role is rejected

GIVEN an identity can manage the server
WHEN they submit a role outside the seed role set
THEN the API rejects the update.

### Requirement: Effective Client Permissions

Clients SHALL fetch effective permissions for the current identity and use them to show or hide action controls.

#### Scenario: Create channel button allowed

GIVEN the current identity has an effective `channel.create` permission
WHEN the sidebar renders
THEN the create channel control is shown.

#### Scenario: Create channel button denied

GIVEN the current identity lacks effective `channel.create`
WHEN the sidebar renders
THEN the create channel control is hidden.

#### Scenario: Invite button denied

GIVEN the current identity lacks effective `invite.create`
WHEN invite UI renders in the client
THEN the create invite action is hidden or disabled.

### Requirement: Server Enforcement

Server handlers SHALL enforce the effective permission settings, not only client visibility.

#### Scenario: Denied channel creation

GIVEN `channel.create` excludes role `moderator`
AND a moderator calls the create channel API
WHEN the request is handled
THEN the server returns forbidden.

#### Scenario: Delete other messages

GIVEN `message.delete_any` excludes role `moderator`
AND a moderator attempts to delete another identity's message
WHEN the request is handled
THEN the server returns forbidden.

