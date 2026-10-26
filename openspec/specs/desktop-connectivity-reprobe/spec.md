# Spec: desktop-connectivity-reprobe

## Capability

Desktop server connectivity status is recalculated after startup and while the client remains open.

### Requirement: ephemeral-connectivity-state

The client MUST NOT persist connectivity state as authoritative vault data.

### Requirement: periodic-reprobe

Joined servers MUST be probed immediately and periodically.
