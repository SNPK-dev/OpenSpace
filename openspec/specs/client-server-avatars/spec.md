# Specs

## Behavior

### Requirement: Server rail avatar display

Clients SHALL display a server avatar image in the left server rail when the server has a configured avatar URL.

### Scenario: Avatar exists

GIVEN a user has a server in their client vault

AND the server entry has a non-empty avatar URL

WHEN the server rail renders

THEN the rail shows the avatar image instead of server initials

### Scenario: Avatar missing

GIVEN a user has a server in their client vault

AND the server entry has no avatar URL

WHEN the server rail renders

THEN the rail shows server initials

### Scenario: Avatar image fails

GIVEN a user has a server in their client vault

AND the server entry has an avatar URL that fails to load

WHEN the image load fails

THEN the rail falls back to server initials

### Requirement: Server avatar metadata persistence

Clients SHALL persist server avatar URLs from server metadata when adding, refreshing, or importing server access.

### Scenario: Add server from URL

GIVEN server metadata contains an avatar URL

WHEN a user adds the server from a client

THEN the stored server entry includes that avatar URL

### Scenario: Refresh known server

GIVEN a stored joined server has no avatar URL or has a stale avatar URL

WHEN the client successfully refreshes server metadata

THEN the stored server entry is updated with the metadata avatar URL

### Scenario: Pair device import

GIVEN a pairing bundle includes a server avatar URL

WHEN a user imports the bundle on another client

THEN the imported server entry includes that avatar URL
