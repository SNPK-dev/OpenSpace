# Server Rail Contrast Spec

## Requirements

### Requirement: Server Initials Contrast

Server initials SHALL remain readable in inactive and active server rail states.

#### Scenario: Inactive server without avatar

GIVEN a server has no avatar
AND it is not selected
WHEN the server rail renders
THEN its initials are visible against the inactive rail item background.

#### Scenario: Active server without avatar

GIVEN a server has no avatar
AND it is selected
WHEN the server rail renders
THEN its initials are visible against the active rail item background.

#### Scenario: Server with avatar

GIVEN a server has an avatar
WHEN the server rail renders
THEN the contrast fix does not alter the avatar image behavior.

