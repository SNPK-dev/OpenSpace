# Web vault atomic persistence

## Purpose

Ensure web-client vault server mutations survive reload without stale writes replacing newer state.

## Requirements

### Requirement: ordered-vault-writes

Concurrent server mutations MUST be serialized in invocation order and MUST NOT overwrite newer state with an older snapshot.

### Requirement: reload-restores-servers

After a successful `addServer` resolves, reload and unlock MUST restore that server.
