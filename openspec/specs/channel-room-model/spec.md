# Channel Room Model Spec

## Requirements

### Requirement: Channel Groups Contain Rooms

The product UI SHALL present the upper-level conversation container as a channel and the nested text/voice destination as a room.

#### Scenario: Existing channel group renders in client

GIVEN a server has an upper-level group named `Dota`
AND it contains nested destinations named `Party 1` and `Party 2`
WHEN a user opens the client sidebar
THEN `Dota` is shown as the channel group
AND `Party 1` and `Party 2` are shown as rooms inside it.

#### Scenario: Admin creates channel group

GIVEN an admin can manage channels
WHEN they create a channel group named `Dota`
THEN the top-level list contains `Dota`
AND it does not automatically create a nested room also named `Dota`.

#### Scenario: Admin creates room inside channel

GIVEN an admin can manage channels
AND a channel group named `Dota` exists
WHEN they create a voice room named `Party 1` inside `Dota`
THEN `Party 1` appears nested under `Dota`
AND its type is `voice`.

### Requirement: Default Server Rooms

New bootstrapped servers SHALL start with two channel groups and one default room inside each group.

#### Scenario: Bootstrap defaults

GIVEN a server is bootstrapped
WHEN the default conversation structure is created
THEN there is one text channel group
AND there is one audio channel group
AND the text group has one text room named `general`
AND the audio group has one voice room named `general`.

### Requirement: Client Creation Controls

Clients SHALL expose channel group and room creation actions when the current identity has an existing channel-management role.

#### Scenario: Role can manage channels

GIVEN the current identity has role `owner`, `admin`, or `moderator`
WHEN the sidebar renders
THEN controls to add a channel group and add a room inside a group are available.

#### Scenario: Role cannot manage channels

GIVEN the current identity has role `member` or `guest`
WHEN the sidebar renders
THEN channel group and room creation controls are hidden.

