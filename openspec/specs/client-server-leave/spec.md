# Client Server Leave

## Behavior

### Requirement: Confirmed local server leave

Clients SHALL allow users to remove the currently selected server from their local vault through a confirmed sidebar action.

#### Scenario: Owner flow

GIVEN an owner has a selected server in the client

WHEN they click the leave button next to the server name and confirm

THEN the server is removed from the local vault and the client no longer uses its access token for active API or websocket calls

#### Scenario: Admin flow

GIVEN an admin has a selected server in the client

WHEN they click the leave button next to the server name and confirm

THEN the server is removed from the local vault and the client no longer uses its access token for active API or websocket calls

#### Scenario: Moderator flow

GIVEN a moderator has a selected server in the client

WHEN they click the leave button next to the server name and confirm

THEN the server is removed from the local vault and the client no longer uses its access token for active API or websocket calls

#### Scenario: Member flow

GIVEN a member has a selected server in the client

WHEN they click the leave button next to the server name and confirm

THEN the server is removed from the local vault and the client no longer uses its access token for active API or websocket calls

#### Scenario: Guest flow

GIVEN a guest has a selected server in the client

WHEN they click the leave button next to the server name and confirm

THEN the server is removed from the local vault and the client no longer uses its access token for active API or websocket calls

#### Scenario: Cancel leave

GIVEN a user opens the leave server confirmation dialog

WHEN they cancel or close the dialog

THEN the selected server remains in the local vault and remains active

#### Scenario: Failure and reconnect

GIVEN a selected server is offline, degraded, or reconnecting

WHEN the user confirms leaving the server

THEN the client removes the local server entry without requiring network connectivity
