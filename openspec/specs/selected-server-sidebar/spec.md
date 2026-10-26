# Selected Server Sidebar Spec

## Requirements

### Requirement: Selected Server Header

The client sidebar above rooms SHALL display the selected server name.

#### Scenario: Web selected server

GIVEN a web-client user has selected a server named `Team Space`
WHEN the room sidebar renders
THEN the sidebar header displays `Team Space`
AND it does not display the static `OpenSpace` label.

#### Scenario: Desktop selected server

GIVEN a desktop-win user has selected a server named `Team Space`
WHEN the room sidebar renders
THEN the sidebar header displays `Team Space`
AND it does not display the static `OpenSpace` label.

#### Scenario: No selected server

GIVEN no server is selected
WHEN the sidebar renders
THEN the header uses a coherent fallback label.

### Requirement: Header Layout Safety

The server name header SHALL not break the sidebar layout for long names.

#### Scenario: Long server name

GIVEN the selected server name is longer than the sidebar width
WHEN the sidebar header renders
THEN the name is truncated or clipped without overlapping room/channel content.

