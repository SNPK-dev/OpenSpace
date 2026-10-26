# Backup, restore, upgrade, and rollback

OpenSpace recovery bundles are one consistency-scoped copy of authoritative data: a PostgreSQL custom dump, every object in the configured MinIO bucket, `manifest.json`, SHA-256 metadata, and a `COMPLETE` marker. Redis is intentionally excluded because sessions, presence, tickets, and rate limits are transient and are recreated or require reauthentication.

## Backup

```bash
node scripts/backup.mjs --env .env --root /srv/openspace/backups --daily 7 --weekly 4 --monthly 6
node scripts/verify-backup.mjs /srv/openspace/backups/<bundle>
```

The script creates `<name>.incomplete`, stops API and realtime writers for the measured consistency window, streams `pg_dump`, mirrors MinIO, hashes each artifact, writes the manifest, atomically renames the directory, verifies it, invokes the optional off-host command, and applies retention. Interrupted directories retain `INCOMPLETE` and `FAILED`; they cannot be restored or selected by retention.

Configure a non-shell off-host program with `OPENSPACE_BACKUP_TRANSFER` or `--transfer-command`. The program receives the verified bundle path as its final argument. A transfer failure leaves the local bundle intact and exits non-zero. Use an encrypted destination and never place credentials in the command value.

Bundles contain messages, identity records, audit data, attachments, and avatars. Keep the root mode `0700`, use encrypted storage and transport, restrict operator access, log custody, and securely expire remote copies. Built-in UTC daily/weekly/monthly tiers retain the newest verified bundle in each selected period; `--keep N` remains a compatibility alias for N daily points.

## Restore on a clean host

1. Install the same compatible OpenSpace release and copy `.env` plus the bundle to the new host.
2. Provision enough free space for the bundle, database, object store, and temporary restore overhead.
3. Start PostgreSQL and MinIO and confirm their health.
4. Run preflight independently: `node scripts/verify-backup.mjs <bundle>`.
5. Restore: `node scripts/restore.mjs --backup-dir <bundle> --env .env --yes`.
6. Confirm the JSON result, service health, login/reconnect, message history, avatar display, and attachment download.

Restore validates all artifacts before destructive work. It replaces the database and bucket together. If anything fails after mutation begins, writers remain stopped. Diagnose and repeat from an intact bundle; do not manually start writers on partial state.

## Upgrade and rollback

Git-checkout installations use `upgrade.mjs` and `rollback.mjs`. Immutable release-bundle installations use `deploy-release.sh`, `upgrade-release.mjs`, and `rollback-release.mjs`; the two extracted releases share an explicit Compose project so named volumes remain stable across directory changes.

Before an immutable upgrade, extract and verify both releases and preserve their generated `.release-images.env` files. From the candidate directory run:

```bash
node scripts/upgrade-release.mjs --previous /opt/openspace/releases/previous --env /etc/openspace/.env --project openspace
```

The command creates and verifies a PostgreSQL + MinIO pre-upgrade bundle before switching digest-qualified images. To roll back application artifacts and authoritative data:

```bash
node scripts/rollback-release.mjs --state /etc/openspace/.openspace/releases/artifact-rollback.json
```

```bash
node scripts/upgrade.mjs --target v1.0.1 --env .env
node scripts/rollback.mjs --yes
```

Upgrade requires a clean Git worktree and a locally available target tag/commit. It fails before deployment mutation unless a labeled pre-upgrade bundle is created and verified, records `.openspace/releases/rollback.json`, checks out the exact target revision, validates/builds Compose, and deploys. Rollback refuses missing/invalid metadata, revision, or bundle, checks out the recorded source revision, then restores matching authoritative data. Keep pre-upgrade bundles through the observation window.

## Disaster-recovery drill and RPO/RTO

Run `pnpm backup:drill` on Linux CI/staging with Docker. The isolated drill creates PostgreSQL and MinIO data, backs up, deletes both, restores, and asserts both payloads. Its JSON result publishes measured `rtoSeconds`; production drills must record:

- RPO: time between the last completed off-host bundle and the simulated loss.
- RTO: time from declaring recovery until health and user-path verification complete.

Initial release targets are RPO <= 24 hours and RTO <= 4 hours. These are targets, not evidence: record dated staging/production drill results and revise the targets from observed data. Drill at least quarterly and before a stable release.

## Scheduling and monitoring

Example daily job:

```cron
0 3 * * * cd /srv/openspace && /usr/bin/node scripts/backup.mjs --env .env --root /srv/openspace/backups --keep 14 >> /var/log/openspace-backup.log 2>&1
```

Alert on non-zero exit, missing daily success, `offHost` other than `complete` when required, capacity below two bundle sizes, or an incomplete bundle older than the job timeout. Save the final JSON result in job logs.

## Failure handling

- Hash/size/path error: quarantine the bundle; no restore mutation has occurred.
- Disk full or interrupted backup: keep the incomplete directory for diagnosis, free capacity, then retry.
- Off-host failure: local backup is valid; repair transfer and copy the existing verified bundle.
- Restore failure after mutation: keep writers stopped and rerun recovery from a verified bundle.
- Object-count mismatch: keep writers stopped; inspect MinIO logs and available capacity.
- Lost backup encryption key: the bundle is unrecoverable; test key recovery during every drill.
