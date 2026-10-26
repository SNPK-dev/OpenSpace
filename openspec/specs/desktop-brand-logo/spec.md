# Desktop Brand Logo

## Behavior

### Requirement: Windows client brand logo fit

The Windows client SHALL render bundled OpenSpace brand logo images fully visible on onboarding and unlock surfaces.

#### Scenario: Owner flow

GIVEN an owner uses the Windows client before entering a server

WHEN the onboarding or local vault unlock screen is shown

THEN the OpenSpace logo is centered and fully visible without cropping

#### Scenario: Admin flow

GIVEN an admin uses the Windows client before entering a server

WHEN the onboarding or local vault unlock screen is shown

THEN the OpenSpace logo is centered and fully visible without cropping

#### Scenario: Moderator flow

GIVEN a moderator uses the Windows client before entering a server

WHEN the onboarding or local vault unlock screen is shown

THEN the OpenSpace logo is centered and fully visible without cropping

#### Scenario: Member flow

GIVEN a member uses the Windows client before entering a server

WHEN the onboarding or local vault unlock screen is shown

THEN the OpenSpace logo is centered and fully visible without cropping

#### Scenario: Guest flow

GIVEN a guest uses the Windows client before entering a server

WHEN the onboarding or local vault unlock screen is shown

THEN the OpenSpace logo is centered and fully visible without cropping

#### Scenario: Failure and reconnect

GIVEN the Windows client reloads or returns to unlock after a failed password attempt

WHEN the auth surface renders again

THEN the logo remains fully visible and uses the same non-cropping fit behavior
