# public-release-readiness Specification

## Purpose
TBD - created by archiving change public-github-v1-readiness. Update Purpose after archive.
## Requirements
### Requirement: Legal and governance files

The public repository MUST contain an explicit license, security policy, contribution guide, code of conduct, support policy, changelog, compatibility matrix, known limitations, and release checklist.

#### Scenario: Required file is absent

- **GIVEN** a release candidate
- **WHEN** repository readiness validation runs
- **THEN** the release is blocked and the missing artifact is named

### Requirement: Truthful release status

Public documentation MUST NOT claim stable or production-ready status before all stable gates have retained evidence.

#### Scenario: RC documentation is rendered

- **GIVEN** one or more evidence gates remain incomplete
- **WHEN** a user reads repository status
- **THEN** the project is identified as an RC and remaining supported-platform limitations are visible

### Requirement: Actionable collaboration intake

Issue and pull-request templates MUST collect reproducible, privacy-safe information and redirect vulnerabilities to private reporting.

#### Scenario: Reporter selects security issue

- **GIVEN** a potential vulnerability
- **WHEN** the reporter opens repository guidance
- **THEN** they are instructed not to publish secrets or exploit details in a public issue and are given the private reporting path

### Requirement: Explicit support boundary

Supported versions, platforms, browsers, upgrade paths, and response expectations MUST be documented without unsupported guarantees.

#### Scenario: Operator evaluates an upgrade

- **GIVEN** a deployed prior supported release
- **WHEN** the operator checks compatibility and support policy
- **THEN** they can determine whether the target version, platform, and upgrade/rollback path are supported
