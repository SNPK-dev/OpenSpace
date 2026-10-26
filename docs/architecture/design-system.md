# Architecture: OpenSpace Design System

> **IMPORTANT — READ BEFORE ANY UI WORK**
> All UI implementation must follow this design system.
> See also: `docs/adr/adr-001-liquid-glass-design-system.md`

## Overview

OpenSpace uses the **Liquid Glass Design System** — a dark atmospheric UI language with
graphite base, slate surfaces, restrained blue-cyan accent, adaptive translucency, and
soft lensing effects.

**Package location:** `packages/ui-kit/`
- CSS tokens: `packages/ui-kit/src/tokens.css`
- Brand assets: `packages/ui-kit/assets/`

## Visual Identity

| Property | Value |
|----------|-------|
| Base background | `#0B0D10` — near-black graphite |
| Primary accent | `#6FC3FF` — restrained blue-cyan |
| Typography | Inter (UI) · JetBrains Mono (code/IDs) |
| Vibe | Dark atmospheric, premium, less noisy than Discord, operator-grade density |

### Brand assets

| Asset | Path | Use |
|-------|------|-----|
| Logo mark (24×24) | `packages/ui-kit/assets/logo-mark.svg` | App icon, server rail header |
| Logo wordmark (200×32) | `packages/ui-kit/assets/logo-wordmark.svg` | Admin nav brand, splash |
| Favicon (32×32) | `packages/ui-kit/assets/icon-favicon.svg` | Browser tab, PWA |
| State: disconnected | `packages/ui-kit/assets/state-disconnected.svg` | Connection error screen |
| State: empty room | `packages/ui-kit/assets/state-empty-room.svg` | Empty channel state |
| State: permission denied | `packages/ui-kit/assets/state-permission-denied.svg` | 403 / no-access state |

## Token Reference

Import in any app CSS:
```css
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap');
/* then define the tokens (copy from packages/ui-kit/src/tokens.css) */
```

### Surfaces
```css
--bg-base:     #0B0D10   /* page background */
--bg-surface:  #11141A   /* cards, nav panels */
--bg-elevated: #161A22   /* buttons, dropdowns, toolbar */
--bg-inset:    #0E1116   /* inputs, code blocks, composer */
--bg-overlay:  rgba(8,10,14,0.72)  /* modal scrim */
```

### Text
```css
--text-primary:   #E6EAF2   /* body, headings */
--text-secondary: #9BA4B4   /* labels, descriptions */
--text-muted:     #6B7280   /* placeholders, overlines, timestamps */
--text-link:      #4DA3FF   /* links */
```

### Accent
```css
--accent-default: #6FC3FF   /* buttons, active states */
--accent-hover:   #8FD2FF
--accent-press:   #4FB1F0
--accent-subtle:  rgba(111,195,255,0.14)  /* bg of active items */
--accent-ring:    rgba(111,195,255,0.45)  /* focus rings */
--accent-glow:    0 0 0 1px rgba(111,195,255,0.30), 0 4px 24px rgba(111,195,255,0.20)
```

### Semantic
```css
--success: #3DBE8B  --success-subtle: rgba(61,190,139,0.14)
--warning: #E0A33C  --warning-subtle: rgba(224,163,60,0.14)
--danger:  #E5484D  --danger-subtle:  rgba(229,72,77,0.14)
--info:    #4DA3FF  --info-subtle:    rgba(77,163,255,0.12)
```

### Presence
```css
--presence-online:  #3DBE8B
--presence-away:    #E0A33C
--presence-dnd:     #E5484D
--presence-offline: #6B7280
```

### Role colours (chips)
```css
--role-owner:  #C58CFF
--role-admin:  #4DA3FF
--role-mod:    #3DBE8B
--role-member: #9BA4B4
--role-guest:  #6B7280
```

### Spacing (4-base scale)
```
4 8 12 16 20 24 32 40 56 80
```

### Radii
```
xs=3px  sm=6px  md=8px  lg=10px  full=9999px
```

### Motion
```css
--ease-out:  cubic-bezier(0.22, 0.61, 0.36, 1)
--dur-hover: 120ms
--dur-enter: 180ms
--dur-exit:   90ms
```

## Liquid Glass Material (web-client only)

The client app uses glass panels over an ambient backdrop.

```css
/* Ambient stage — apply to root shell */
background: var(--ambient-bg);   /* radial blue-cyan spills + graphite gradient */

/* Glass panel */
background: var(--glass-tint);   /* rgba(18,24,34,0.55) */
backdrop-filter: blur(22px) saturate(160%);
border: 1px solid rgba(255,255,255,0.07);
border-radius: 18px;
box-shadow: var(--glass-shadow);
```

Available glass variants:
- `.glass` — standard panel (border-radius 14px)
- `.glass-soft` — lighter blur (16px), softer shadow
- `.glass-strong` — stronger blur (32px), higher tint opacity
- `.glass-capsule` — server rail, dock bars (border-radius 22px)
- `.glass-popover` — command menus, peek panels (border-radius 12px)
- `.glass-tile` — tappable server tile, dock button

## Layout Patterns

### Web Client — 4-column Liquid Glass shell
```
┌──────┬──────────────┬────────────────────────┬───────────┐
│  76  │     264      │        flex             │    256    │
│server│   channel    │      content            │  members  │
│ rail │   tree       │  (chat / voice / DM)    │   panel   │
│glass │   glass      │       glass             │   glass   │
│capsul│              │                         │           │
└──────┴──────────────┴────────────────────────┴───────────┘
  All panels float with 10px gap over --ambient-bg stage.
  Members panel hidden in voice room view.
```

Grid:
```css
grid-template-columns: 76px 264px 1fr 256px;
gap: 10px; padding: 10px;
background: var(--ambient-bg);
```

### Admin Console — 2-column flat dark
```
┌──────────────┬──────────────────────────────────────────┐
│     240      │                flex                       │
│     nav      │          content area                     │
│  bg-surface  │           bg-base                        │
└──────────────┴──────────────────────────────────────────┘
```
Admin uses flat surfaces (not glass) — prioritises data density and readability.

## Component Conventions

### Buttons
```
.btn           — default (bg-elevated, border-strong)
.btn-primary   — accent fill, text-inverse, font-weight 600
.btn-ghost     — transparent, text-secondary
.btn-danger    — danger fill
.btn-sm        — 4px 8px padding, 12px font
.btn-icon      — square, 6px padding
```

### Chips / badges
```
.chip           — neutral (bg-elevated)
.chip-accent    — blue-cyan tint
.chip-success   — green tint
.chip-warning   — amber tint
.chip-danger    — red tint
```

### Dense data tables
```
table.dense — operator-grade: small headers, narrow rows, mono values in .mono cells
```

### State illustrations
Use the SVG state assets for empty/error/permission states — do not use emoji or plain text.

## Rules

1. **No hardcoded hex values** in component CSS. All colours come from tokens.
2. **Glass only in web-client** — admin and mobile use flat surfaces.
3. **Inter for UI, JetBrains Mono for code/IDs** — never mix with system fonts in headings.
4. **focus-ring** — always use `var(--focus-ring)` for keyboard focus, not `outline: auto`.
5. **Semantic colours** — use `--success/warning/danger/info` variants; never custom greens/reds.
6. **Role colours** — use `--role-*` tokens for role chips; do not pick arbitrary colours.
7. **Motion** — stick to the `--dur-*` / `--ease-out` variables; avoid `transition: all`.

## Mobile and Desktop

`apps/mobile` (React Native) and `apps/desktop-win` (Electron) will adapt these tokens
to their respective styling systems when those surfaces are implemented:
- React Native: StyleSheet constants derived from the same token values
- Electron/web: same tokens.css applies via the web renderer
- See the relevant change in the roadmap for implementation details

## Source of truth

The design was produced via claude.ai/design and is captured in full in this repo.
The canonical files are:
- `packages/ui-kit/src/tokens.css` — all CSS custom properties
- `packages/ui-kit/assets/` — brand SVGs
- `docs/adr/adr-001-liquid-glass-design-system.md` — decision record
- `docs/architecture/design-system.md` — this file

Do not maintain a parallel copy in Notion, Figma, or any tool not tracked in this repo.

## Content security boundary

Production UI permits bundled scripts only. Inline styles remain temporarily allowed for existing React rendering, while fonts are limited to the design-system Google font endpoints. Images/media may use secure remote, data, and blob URLs; API, realtime, and RTC connections require HTTPS/WSS. Electron enforces the same policy from its main process so renderer markup cannot relax it.
