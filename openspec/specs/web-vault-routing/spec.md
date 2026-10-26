# Specs

## Behavior

### Requirement: Web unlock routing is vault-driven

The web-client SHALL NOT navigate to device pairing from low-level API unauthorized handling.

### Scenario: Unauthorized request after unlock

GIVEN a user has unlocked a local vault

WHEN a background web-client API request returns `401`

THEN the API client clears the web-client token and throws an unauthorized error

AND the API client does not navigate to `/onboarding/pair-device`

### Requirement: Web-client and admin-web token isolation

The web-client SHALL use a browser token key that does not collide with admin-web.

### Scenario: Admin token exists in same browser

GIVEN `localStorage` contains an admin-web token under `openspace_token`

WHEN the web-client boots

THEN the web-client does not treat that admin token as its own authenticated client token

AND web-client unlock remains governed by the local vault state
