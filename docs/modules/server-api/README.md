# server-api

Business APIs, admin APIs, auth/session, rooms, permissions, messages, files, and service health endpoints.

Shared request, response, and event DTOs must come from `@openspace/contracts` / generated Go contracts. Local structs are allowed for persistence and domain internals, but not as duplicate wire contracts.
