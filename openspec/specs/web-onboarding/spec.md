# Web Onboarding Spec

## Requirements

### Requirement: Web Onboarding Matches Windows

The web-client `/onboarding` page SHALL match the Windows client onboarding page structure and visual hierarchy.

#### Scenario: Web onboarding first screen

GIVEN a user opens the web-client `/onboarding` route
WHEN the page renders
THEN it displays the same centered onboarding card hierarchy as Windows
AND the page includes logo, welcome title, local vault subtitle, create-profile action, pair-device action, and self-hosted footer.

#### Scenario: Web onboarding actions

GIVEN a user is on `/onboarding`
WHEN they activate the create-profile or pair-device action
THEN the existing route targets remain unchanged.

### Requirement: Responsive Onboarding Layout

The web onboarding layout SHALL remain usable on desktop and mobile viewport widths.

#### Scenario: Narrow viewport

GIVEN the viewport is narrow
WHEN the onboarding page renders
THEN the card fits within the viewport
AND action labels do not overflow their buttons.
