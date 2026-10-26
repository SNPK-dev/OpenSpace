# Spec: vault-identity

## Capability

Local Vault lifecycle, server-scoped device identities, Device Pairing, and rendezvous relay for OpenSpace clients.


## Summary

- Local Vault: AES-GCM encrypted IndexedDB storage, master key wrapped by password-derived key (PBKDF2) and recovery-code-derived key. Recovery code shown once; not stored plaintext.
- First-run onboarding: two buttons only — "Создать локальный профиль" / "Перенести доступ с другого устройства". No "Create account" language.
- Server list: always visible in main layout. Each server has a connection_state (not_joined, pending_approval, joined, etc.).
- Default Space: open-space.online added as not_joined. Auto-registration prohibited.
- Device registration: ECDSA P-256 keypair + proof-of-possession. Server stores public_key only.
- Pairing token: one-time, short-lived, stored on server as SHA-256 hash only.
- Transfer bundle: AES-GCM encrypted; decrypt key in URL fragment only, never on relay.
- Relay: one-time download; used_at enforced in DB.
- Registration policy: open | invite_code_only | approval_required | closed (enum on server_settings).
