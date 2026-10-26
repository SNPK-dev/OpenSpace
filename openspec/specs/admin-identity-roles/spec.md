# Admin Identity Roles

## Behavior

### Requirement: Safe role revocation

Admin identity role revocation SHALL never make the Identities page crash and SHALL keep identities in a valid seed-role state.

#### Scenario: Owner flow

GIVEN an owner views identities

WHEN they revoke `member` from an identity with no other roles

THEN the identity is shown with `guest`

#### Scenario: Admin flow

GIVEN an admin views identities

WHEN they revoke `member` from an identity with no other roles

THEN the identity is shown with `guest`

#### Scenario: Moderator flow

GIVEN a moderator lacks identity management permissions

WHEN they attempt to access the admin identities flow

THEN existing permission enforcement applies

#### Scenario: Member flow

GIVEN a member lacks identity management permissions

WHEN they attempt to access the admin identities flow

THEN existing permission enforcement applies

#### Scenario: Guest flow

GIVEN a guest lacks identity management permissions

WHEN they attempt to access the admin identities flow

THEN existing permission enforcement applies

#### Scenario: Failure and reconnect

GIVEN the identities API returns an identity with `roles: null`

WHEN admin-web renders the identities table

THEN it treats roles as an empty array and does not crash
