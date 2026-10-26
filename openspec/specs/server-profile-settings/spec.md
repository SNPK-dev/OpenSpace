# Server Profile Settings Spec

## Requirements

### Requirement: Bootstrap Server Profile

The bootstrap flow SHALL allow the first server owner to configure the server name, optional description, optional public URL, and optional avatar metadata.

#### Scenario: Owner bootstraps with avatar

GIVEN the server is not bootstrapped
WHEN the owner submits bootstrap with a valid server name, owner account, and avatar metadata
THEN the server is created with the submitted profile data
AND the owner receives an authenticated session.

#### Scenario: Invalid bootstrap profile data

GIVEN the server is not bootstrapped
WHEN bootstrap profile fields exceed validation limits or the avatar value is not an accepted URL/data-image value
THEN the API returns a validation error
AND no server row is created.

### Requirement: Admin Server Profile Management

The admin console SHALL allow identities with server management permission to view and update the server profile.

#### Scenario: Owner updates profile

GIVEN an authenticated owner is using the admin console
WHEN they update name, description, public URL, or avatar metadata
THEN the settings are saved for that server
AND subsequent reads return the saved values.

#### Scenario: Admin updates profile

GIVEN an authenticated admin is using the admin console
WHEN they update server profile data
THEN the settings are saved for that server.

#### Scenario: Non-admin role is forbidden

GIVEN an authenticated moderator, member, or guest
WHEN they attempt to update server profile settings
THEN the API returns forbidden
AND settings remain unchanged.

### Requirement: Admin Profile Avatar UI

The admin UI SHALL provide avatar preview and input controls in both bootstrap and server settings flows.

#### Scenario: Select avatar file

GIVEN an admin is editing server profile UI
WHEN they choose a valid image file
THEN the UI previews the avatar
AND submits it as avatar metadata with the form.

#### Scenario: Clear avatar

GIVEN an avatar is already configured
WHEN an admin clears the avatar field and saves
THEN the server profile no longer has an avatar.
