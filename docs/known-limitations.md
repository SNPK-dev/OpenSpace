# Known limitations for v1

- macOS and mobile clients are preview only.
- English is the only supported v1 interface language.
- The official stable topology is a single-host Compose deployment; multi-host orchestration and horizontal database/storage scaling are not supported.
- Capacity claims apply only to published reference profiles backed by retained load evidence.
- Voice connectivity depends on correctly configured public DNS, TLS, UDP/TCP reachability, and TURN behavior; restrictive networks can require TURN/TLS.
- Backups are recoverable only when PostgreSQL, object storage, manifest, encryption material, and off-host retention are handled together as documented.
- The project provides community support without guaranteed response or remediation times.
- Browser extensions, modified clients, external identity providers, and third-party reverse proxies are outside the validated v1 topology unless explicitly documented.
