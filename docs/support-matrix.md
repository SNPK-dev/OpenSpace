# OpenSpace v1 support matrix

| Component | v1 status | Platforms | Release evidence |
|---|---|---|---|
| Server + Web | Supported | Ubuntu 24.04 LTS; amd64 and arm64 OCI | Clean-host acceptance, signed digest, SPDX SBOM, provenance |
| Windows desktop | Supported | Windows 10/11 x64 | Authenticode signature, CI install/update/uninstall smoke, signed manifest |
| macOS desktop | Preview | Not guaranteed | No v1 notarization or update SLA |
| Mobile | Experimental | Android/iOS development builds | No v1 store, signing, privacy-manifest, or device-test SLA |

Supported server releases receive security fixes according to `SECURITY.md`. Preview and experimental clients must not be presented as stable v1 deliverables.

Production server installation uses `scripts/install-release.sh`, verifies the keyless release-manifest signature and artifact checksum, and writes `.release-images.env` containing digest-qualified first-party images. Start Compose with both `.env` and `.release-images.env`; never replace these values with mutable tags for a stable deployment.
