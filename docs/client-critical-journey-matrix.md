# V1 critical-journey matrix

Stable Web and Windows releases preserve user input, explain failures in English, and expose only valid recovery actions. CI checks the following implementation and acceptance ownership.

| Journey | Automated evidence | Stable evidence |
|---|---|---|
| Invite expired/revoked/closed | Web add-server recovery E2E; server invite tests | Unfamiliar-user invite-to-message session |
| Second device and revoke | Pairing token expiry/revoke integration tests; pairing UI checks | Two-device unfamiliar-user session |
| Offline send/retry | Web draft-preservation E2E | Unfamiliar-user offline session |
| File upload/download/failure/cancel/quota | Browser MinIO round trip, cancel/retry, and local 50 MB rejection E2E | Unfamiliar-user file session |
| Voice reconnect | Web reload/auto-rejoin E2E and five-cycle heap/DOM budget | External TURN and unfamiliar-user reconnect session |
| Lost device/password | Vault recovery cryptography tests and recovery UI | Unfamiliar-user recovery session |
| Permission/revocation | Route authorization integration tests and permission-aware controls | Security review |
| Backup/upgrade failure | Corruption/incomplete/subprocess negative tests and clean-host phases | Independent-host restore/upgrade/rollback drill |

`scripts/validate-critical-journeys.mjs` fails if any required automated owner disappears. Human and independent-host columns remain mandatory; automated checks do not substitute for them.
