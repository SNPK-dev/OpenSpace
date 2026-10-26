# Password Visibility

## Purpose

Define expected behavior for user-controlled show/hide controls on password fields in OpenSpace clients and admin authentication forms.

## Requirements

### Requirement: Password fields can be revealed intentionally

Password fields in local unlock and admin authentication forms MUST be masked by default and MUST provide an inline control that lets the user reveal and hide the current password value without changing the submitted value.

#### Scenario: Owner bootstrap flow

- **GIVEN** an owner is setting up the server in admin bootstrap
- **WHEN** the owner types an admin password
- **THEN** the password is masked by default
- **AND** the owner can press the inline visibility button to show the typed password
- **AND** pressing the button again masks it
- **AND** submitting the form sends the same password value regardless of visibility state

#### Scenario: Admin login flow

- **GIVEN** an admin is signing in to admin-web
- **WHEN** the admin enters a password
- **THEN** the password is masked by default
- **AND** the admin can toggle visibility from the password input
- **AND** auth errors or loading states do not remove the typed password solely because visibility changed

#### Scenario: Local profile unlock flow

- **GIVEN** a user has a local client profile protected by the vault password
- **WHEN** the user opens the local profile unlock screen
- **THEN** the password is masked by default
- **AND** the user can reveal and hide the input before unlocking

#### Scenario: Failure and retry flow

- **GIVEN** the user enters a password and toggles visibility
- **WHEN** validation fails, authentication fails, or the user retries after reopening the form
- **THEN** the visibility control remains a local UI state only
- **AND** the password value is not logged, persisted in new storage, or transmitted differently
- **AND** the user can continue editing, revealing, hiding, and submitting the password field normally
