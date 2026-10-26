# Security policy

## Supported versions

Security fixes are provided for the latest stable release and, when technically feasible, the immediately preceding minor release. Release candidates and preview clients receive best-effort fixes and are not covered by a stable support promise.

## Reporting a vulnerability

Use GitHub's **Report a vulnerability** private reporting feature. Do not open a public issue with exploit details, credentials, private messages, tokens, server addresses, or personal data.

Include the affected version and component, prerequisite access, reproducible steps, impact, and a minimal proof of concept. Remove all real secrets and user content. We will acknowledge receipt when a maintainer is available, coordinate validation and remediation, and publish an advisory when appropriate. This community project does not promise a fixed response or remediation time.

If private reporting is unavailable, open a public issue containing only the words “Private security contact required”; a maintainer will establish a private channel. Never include vulnerability details in that issue.

## Scope

In scope: server API, realtime gateway, worker, official deployment scripts and containers, Web client, and signed Windows client. Preview macOS/mobile builds, third-party infrastructure, social engineering, denial-of-service requiring extraordinary traffic, and findings without a security impact are outside the stable bounty/support scope. There is currently no paid bug bounty.

See [the threat model](docs/security/threat-model.md) and [vulnerability policy](docs/security/vulnerability-policy.md).
