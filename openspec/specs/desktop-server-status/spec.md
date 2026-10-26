# Desktop Server Status Spec

## Behavior

### Requirement: Windows Client Online Server Indicator

The Windows client MUST render a joined online server with the same green status indicator used by the web client.

#### Scenario: Online joined server

GIVEN a user has a joined server in the Windows client
AND the server connectivity state is `online`
WHEN the server rail renders
THEN the server status dot is visible
AND its computed background color matches the online presence token.

#### Scenario: Connectivity refresh

GIVEN a joined server starts without a resolved connectivity state
WHEN the desktop client marks it `checking` and later receives an `online` connectivity result
THEN the status dot updates from the checking style to the online green style without requiring a client restart.
