# Independent security review gate

A stable release requires a review by a party independent from the implementation authors. The review must cover the exact RC commit, route authorization and tenancy, authentication/session/device lifecycle, WebSocket/RTC boundaries, attachments/storage, deployment topology, backup/restore, desktop sandbox/update path, and release supply chain.

The reviewer publishes a JSON evidence file containing `schema: openspace.security-review/v1`, reviewer identity and organization, report date, reviewed Git commit, scope, report URL, report SHA-256, and findings counts by severity. `critical` and `high` must both be zero after remediation. The protected release environment provides the evidence URL and expected SHA-256; CI downloads, verifies, parses, and binds it to the release commit.

Risk acceptance cannot close Critical/High findings for v1. Medium/Low exceptions require owner, rationale, compensating controls, remediation date, and expiry.
