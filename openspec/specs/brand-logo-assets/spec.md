# Brand Logo Assets Spec

## Requirements

### Requirement: Canonical PNG Brand Asset

The repository SHALL use the provided `logo.png` as the canonical brand logo asset in the UI asset package.

#### Scenario: Source logo location

GIVEN the root `logo.png` has been provided
WHEN the change is complete
THEN the canonical source file exists at `packages/ui-kit/assets/logo.png`
AND the root-level `logo.png` is no longer the active source location.

### Requirement: Browser PNG Favicons

Web and admin browser apps SHALL use PNG favicon assets derived from `logo.png`.

#### Scenario: Web favicon

GIVEN the web-client app is served
WHEN the browser loads its HTML shell
THEN the favicon link points to a runtime `assets/favicon.png` path.

#### Scenario: Admin favicon

GIVEN the admin-web app is served
WHEN the browser loads its HTML shell
THEN the favicon link points to a runtime `assets/favicon.png` path.

### Requirement: Visible App Logos

Visible OpenSpace logo placements SHALL render the PNG brand logo instead of the previous inline/text/SVG brand mark.

#### Scenario: Onboarding and unlock logos

GIVEN a user opens onboarding or unlock screens
WHEN the logo is visible
THEN it uses the PNG asset
AND no broken image icon is displayed.

### Requirement: Desktop Package Icons

Windows and mac desktop package configurations SHALL point to PNG icon assets derived from `logo.png`.

#### Scenario: Electron build config

GIVEN desktop app package configuration is read
WHEN electron-builder runs
THEN Windows and mac icon configuration references the generated PNG icon asset.
