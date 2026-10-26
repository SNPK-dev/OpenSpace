# V1 release checklist

A stable tag is permitted only when every item has retained evidence.

The retained 2026-08-14 clean-host and scanner records prove the earlier source candidate only. They are historical evidence, not approval for the current working tree or a published artifact. Stable publication requires a fresh immutable RC revision and evidence produced from its downloaded release bundle, images, and Windows installer.

- [ ] Version/tag consistency and changelog finalized.
- [ ] Full verify, race, fuzz, SAST, dependency, secret, filesystem, and container scans pass with no unresolved Critical/High finding.
- [ ] Independent security review is complete and blocking findings are resolved.
- [ ] A downloaded, checksum/signature-verified RC bundle installs on a clean supported Linux host through the public DNS/TLS path; only documented ports are exposed.
- [ ] Bootstrap, user/server/room/message, reconnect, attachment, and external TURN voice paths pass.
- [ ] Backup restores PostgreSQL and MinIO data to a second clean host; measured RPO/RTO meet the published target.
- [ ] The published previous release upgrades to the downloaded RC artifacts and rolls back to published artifacts with vault and server data preserved.
- [ ] Reliability/failure suite, capacity profile, dashboards, alerts, SLOs, and incident exercise evidence pass.
- [ ] Multi-architecture images and Windows installer have immutable digests, SBOM, provenance, signatures, checksum verification, and zero unresolved Critical/High CVEs.
- [ ] Web/Windows axe, keyboard, zoom, reduced-motion, bundles, long-list, reconnect/voice memory, and cold-start budgets pass; CI artifacts retain the measurements.
- [ ] `docs/evidence/client-quality/nvda-smoke.json` and `usability-session.json` validate with no blocking finding.
- [ ] Support matrix, known limitations, license, security/contribution/conduct policies, issue templates, and release notes are published.
- [ ] RC staging soak completes without exhausting its error budget.
- [ ] Rollback owner and release approver record a final Go decision.
