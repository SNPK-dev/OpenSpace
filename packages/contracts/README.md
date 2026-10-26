# @openspace/contracts

Shared protobuf contracts for OpenSpace server services and clients.

`proto/openspace/v1` is the source of truth. Generated files under `gen/` are reproducible build outputs and must not be edited by hand.

## Commands

```powershell
corepack pnpm --filter @openspace/contracts lint
corepack pnpm --filter @openspace/contracts build
corepack pnpm --filter @openspace/contracts test
corepack pnpm --filter @openspace/contracts typecheck
```

## Versioning

`openspace.v1` is additive-only. Do not reuse field numbers, change field meanings, or mutate existing event semantics in place. Breaking changes require a new protobuf package version.

## Event Envelope

`RealtimeEvent` carries event identity, server scope, stream sequence, timestamp, trace ID, actor identity, and a typed `oneof` payload. Clients must ignore unknown future fields.
