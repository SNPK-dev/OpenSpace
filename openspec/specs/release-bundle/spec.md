# Spec: release-bundle

## Behavior

### Scenario: Interactive setup generates .env

GIVEN
- no .env file exists
- operator runs `node scripts/setup.mjs`

WHEN
- operator responds to prompts: domain, admin email (other values use defaults/generated)

THEN
- .env file written with all required keys
- POSTGRES_PASSWORD, OBJECT_STORAGE_SECRET_KEY, TURN_SECRET, LIVEKIT_API_KEY, LIVEKIT_API_SECRET generated as random hex if not provided
- next-step instructions printed
- exit 0

### Scenario: Non-interactive setup

GIVEN
- operator runs `node scripts/setup.mjs --non-interactive --domain chat.example.com --admin-email ops@example.com`

WHEN
- command executes

THEN
- .env written with domain and email applied, secrets auto-generated
- no prompts shown
- exit 0

### Scenario: Setup skips if .env already exists

GIVEN
- .env already exists

WHEN
- operator runs `node scripts/setup.mjs` without --force

THEN
- error message: ".env already exists. Use --force to overwrite."
- exit 1

### Scenario: Setup with --force overwrites existing .env

GIVEN
- .env already exists

WHEN
- operator runs `node scripts/setup.mjs --force`

THEN
- existing .env overwritten
- new values written
- exit 0

### Scenario: Build bundle produces archive

GIVEN
- operator runs `node scripts/build-bundle.mjs`

THEN
- `dist/openspace-v{version}/` directory created with bundle contents
- `dist/openspace-v{version}.tar.gz` created
- `dist/openspace-v{version}.sha256` created with sha256 of the tar.gz
- version read from package.json
- bundle contains: docker-compose.yml, docker-compose.prod.yml, .env.example, scripts/, infra/, docs/runbooks/, INSTALL.md
- bundle does NOT contain: apps/, packages/, node_modules/, .git/, .generated/, openspec/
- summary printed: version, file size, sha256
- exit 0

### Scenario: Build bundle skips validate-workspace.mjs

GIVEN
- scripts/validate-workspace.mjs exists (dev-only CI tool)

WHEN
- bundle built

THEN
- validate-workspace.mjs not included in the bundle scripts/ directory

### Scenario: validate-bundle passes on correct state

GIVEN
- all bundle artifacts are in place (setup.mjs, build-bundle.mjs, INSTALL.md)

WHEN
- `node scripts/validate-bundle.mjs` runs

THEN
- all checks pass
- exit 0

### Scenario: CI workflow runs on push/PR to main

GIVEN
- `.github/workflows/ci.yml` exists

WHEN
- push to main or PR targeting main

THEN
- Node 20 installed, pnpm via corepack
- `pnpm verify` runs
- job fails if any validator fails

### Scenario: Release workflow publishes on version tag

GIVEN
- `.github/workflows/release.yml` exists
- operator pushes tag `vX.Y.Z`

WHEN
- tag push event

THEN
- verify job runs first
- build job extracts version, runs build-bundle.mjs, verifies sha256
- publish job creates GitHub release with tar.gz + sha256 attached
- install instructions included in release body
- prerelease=true if tag contains `-`

### Scenario: validate-ci passes on correct state

GIVEN
- both workflow files exist

WHEN
- `node scripts/validate-ci.mjs` runs

THEN
- 15/15 checks pass
- exit 0
