# Web Vault Reload Persistence Spec

## Behavior

### Scenario: Owner flow

GIVEN an owner has a web vault with a joined server

WHEN the browser reloads

THEN the app hydrates vault state before choosing onboarding and preserves the server after unlock.

### Scenario: Admin flow

GIVEN an admin adds a server through the web client

WHEN the add flow resolves

THEN the encrypted vault has already been persisted with the added server.

### Scenario: Moderator flow

GIVEN a moderator has a saved server in their web vault

WHEN the page reloads

THEN the app routes to unlock instead of onboarding while the vault exists.

### Scenario: Member flow

GIVEN a member reloads immediately after adding a server

WHEN the browser starts again

THEN the server remains in the vault after unlocking.

### Scenario: Guest flow

GIVEN a guest has no vault

WHEN the app finishes hydration

THEN onboarding is shown.

### Scenario: Failure and reconnect

GIVEN IndexedDB vault hydration fails

WHEN the app finishes attempting to load vault metadata

THEN it falls back to onboarding without clearing any server token or unrelated local data.
