# Client Room Create UI Spec

## Behavior

### Requirement: Permission-Aware Per-Channel Room Creation

Clients MUST expose room creation from each channel group row when the current identity has the `channel.create` permission.

#### Scenario: Permission granted

GIVEN a user has `channel.create`
WHEN the channel tree renders
THEN each channel group row shows a plus action
AND clicking the plus opens a create-room modal with that channel preselected.

#### Scenario: Create text or voice room

GIVEN the create-room modal is open
WHEN the user selects room type `text` or `voice`, enters a room name, and submits
THEN the client creates the room through the existing channel creation API
AND refreshes the target channel group.

#### Scenario: Permission denied or unavailable

GIVEN a user does not have `channel.create`
OR the permission fetch fails
WHEN the channel tree renders
THEN room creation controls are hidden.
