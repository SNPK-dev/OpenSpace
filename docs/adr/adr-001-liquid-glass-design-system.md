# ADR-001: Liquid Glass Design System

Date: 2026-05-13
Status: Accepted

## Context

OpenSpace needs a consistent visual language across three surfaces:
- `apps/web-client` — end-user communication client
- `apps/admin-web` — operator admin console
- `apps/mobile` — React Native mobile client (future)
- `apps/desktop-win` — Electron Windows client (future)

No brand assets, Figma file, or design specification existed. A design system was produced
via claude.ai/design based on `idea.md` and `main.md`, iterated toward a "Liquid Glass"
visual direction inspired by premium collaboration shells (dense, dark, premium, less noisy
than Discord).

## Decision

Adopt the **OpenSpace Liquid Glass Design System** as the canonical visual foundation for
all UI surfaces.

The canonical token file lives at `packages/ui-kit/src/tokens.css`.
SVG brand assets live at `packages/ui-kit/assets/`.

### Visual direction

- **Base**: graphite (#0B0D10) with 5-level surface stack
- **Accent**: restrained blue-cyan (#6FC3FF) — not Discord purple, not generic blue
- **Liquid Glass material**: `backdrop-filter: blur(22px) saturate(160%)` on glass panels,
  concentric geometry, specular top highlight, ambient color spill orbs
- **Typography**: Inter (UI) + JetBrains Mono (code, IDs, mono values)
- **Motion**: 120ms hover, 180ms enter, 90ms exit — `cubic-bezier(0.22, 0.61, 0.36, 1)`

### Token categories

| Category | Prefix | Notes |
|----------|--------|-------|
| Surfaces | `--bg-*` | 5-level stack: base → surface → elevated → inset → overlay |
| Borders | `--border-*` | default / strong / subtle |
| Text | `--text-*` | primary / secondary / muted / inverse / link |
| Accent | `--accent-*` | default / hover / press / subtle / ring / glow |
| Glass | `--glass-*` | tint / blur / saturation / border / specular / shadow |
| Semantic | `--success`, `--warning`, `--danger`, `--info` | each with -subtle variant |
| Presence | `--presence-*` | online / away / dnd / offline |
| Roles | `--role-*` | owner / admin / mod / member / guest |
| Spacing | `--space-*` | 4-base scale: 1→4→8→12→16→20→24→32→40→56→80 |
| Radii | `--radius-*` | xs(3) / sm(6) / md(8) / lg(10) / full(9999) |
| Motion | `--dur-*`, `--ease-*` | hover / enter / exit |
| Focus | `--focus-ring` | double ring: base + accent |

### Layout patterns

**Web client** (`apps/web-client`): Liquid Glass 4-column shell
```
[server rail 76px glass-capsule] [channel tree 264px glass] [content glass] [members 256px glass]
```
All panels float with 10px gap over the ambient-bg stage (radial gradient spills + film grain).

**Admin console** (`apps/admin-web`): Flat dark 2-column
```
[nav 240px bg-surface] [content bg-base]
```
Admin uses flat surfaces (not glass) — appropriate for operator density and data table readability.

## Consequences

- Every UI change in `apps/web-client`, `apps/admin-web`, `apps/mobile`, `apps/desktop-win`
  **must** reference tokens from `packages/ui-kit/src/tokens.css` (or its React Native / Tailwind
  equivalent), not hardcoded hex values.
- New components must follow the token system. When a token doesn't exist for a value,
  add it to `tokens.css` — do not use inline hardcoded values.
- `apps/admin-web` intentionally uses flat surfaces (not glass); this is correct for operator UI.
- Glass layout (`backdrop-filter`) requires a secure context (HTTPS) in production — consistent
  with the existing requirement for browser media APIs.
- Before starting any UI implementation change, read `docs/architecture/design-system.md`
  and reference the design kit at `packages/ui-kit/`.

## References

- Design kit source: `packages/ui-kit/`
- Design canvas: produced via claude.ai/design (Liquid Glass iteration)
- Token file: `packages/ui-kit/src/tokens.css`
- Brand assets: `packages/ui-kit/assets/`
- Architecture doc: `docs/architecture/design-system.md`
