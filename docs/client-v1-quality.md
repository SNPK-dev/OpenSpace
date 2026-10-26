# V1 client quality policy

## Supported clients and locale

OpenSpace v1 supports the current stable Chromium-based web client and the signed Windows desktop client. English is the only supported v1 UI locale. macOS and mobile remain preview clients and do not carry the v1 accessibility or performance promise.

Supported source and production bundles must be valid UTF-8 and contain neither mixed Cyrillic UI nor common mojibake sequences. `pnpm client:validate` enforces the source rule; `pnpm client:budgets` builds both supported clients and checks output encoding and size.

## Accessibility baseline

Supported clients target WCAG 2.2 AA for critical journeys. Release candidates require keyboard-only operation, visible focus, dialog focus containment and restoration, accessible control names, usable 200% zoom, reduced-motion behavior, 44 px coarse-pointer targets, automated axe checks, and an NVDA smoke session.

Automated checks are necessary but not sufficient. Stable publication requires manual reports matching the contract in `docs/evidence/client-quality/README.md`; the protected release workflow downloads checksum-pinned records and retains them as CI artifacts.

## Performance budgets

Uncompressed JavaScript budgets are 700 kB for a web entry, 750 kB for a desktop renderer entry, and 1.1 MB for an explicitly separated vendor/RTC chunk. The current RTC dependency is isolated so it does not delay parsing of the primary application chunk. Five warmed voice join/leave cycles may grow the Chromium JS heap by at most 32 MB and the live DOM by at most 500 nodes after forced collection. A release must retain this evidence together with Windows cold start/initial RSS and the 5,000-message bounded-list contract.

Budget changes require retained measurements and review; they cannot be raised solely to make CI pass.

## Human acceptance

At least two consenting participants unfamiliar with the implementation must complete: invite to first message, second-device pairing and revoke, offline send/retry, file upload failure/cancel, voice reconnect, lost-device recovery, and operator backup/upgrade failure recovery. A severity-one failure or missing evidence blocks stable release.
