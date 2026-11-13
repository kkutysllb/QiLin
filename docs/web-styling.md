# Web UI style reference

English | [中文](web-styling.zh.md)

This reference defines styling ownership and component rules for browser client packages. The current token values live in [`packages/client/ui-theme/src/styles/`](../packages/client/ui-theme/src/styles/); this document does not duplicate that generated-by-source inventory.

## Paper base

The platform palettes carry a warm paper neutral ramp (cream canvas, ink text, warm hairline borders) and content headings ride the system Heiti (sans) stack, so every color skin sits on the same reading surface instead of restyling the canvas. Skins override brand accent, surfaces, and state tints only; the paper ramp, the radius scale, and the heading face belong to the theme owner.

## Scales

The theme owner publishes four scales that feature components consume instead of literal values:

- **Spacing** `--qilin-space-1..8` (4/8/12/16/24/32/48/64) for padding, margin, and gaps.
- **Type** `--qilin-text-xs..2xl` (11/12/13/14/16/18/22) with `--qilin-leading-tight/normal/relaxed`; the content-size deltas stay additive so the user's font-size preference composes with the scale.
- **Radius** `--qilin-radius-xs..xl`, `-panel`, `-pill` (4/6/10/14/18/20/999), with `corner-shape: round` pairing for pill radii.
- **Density** `body[data-qilin-density='compact' | 'standard' | 'comfortable']` publishes `--qilin-density-gap`, `--qilin-density-control-height`, and `--qilin-density-font-delta`; components read them with the standard value as the fallback.

The accent is a single measured pair: `--qilin-alias-accent` (with `-hover`, `-tint`, `-ring`) resolves to `#2563EB` on the paper base (4.87:1) and `#7C9BFF` on the dark base (6.74:1). `--qilin-alias-state-business-primary` routes through it, and the shared focus ring falls back to the same accent. The ui-theme contrast spec fails when either pair drops below 4.5:1.

**Migrated packages** (the list in `scripts/verify-css-tokens.ts`) must express colors, font sizes, spacing, and radius through these tokens; `pnpm run verify-css-tokens` rejects raw `#hex`/`rgb()`, `font-size: <n>px`, `padding/margin/gap: <n>px`, and `border-radius: <n>px` there. Gradient and mask image values remain exempt.

## Ownership

[`ui-theme`](../packages/client/ui-theme/README.md) owns the `--qilin-*` static scale, semantic aliases, typography, motion, gradients, shadows, scrollbar styles, the light/dark preference, and the selectable color skins layered over it. [`ui-layout`](../packages/client/ui-layout/README.md) applies the resolved theme snapshot to the document. Feature packages consume semantic aliases and do not define another global theme.

Global style sheets belong in `ui-theme/src/styles/`. Component styles live beside their component as CSS Modules. A component may define a local custom property when its value is part of that component's layout or presentation contract; shared colors, typography, elevation, and motion belong to the theme package.

## Component rules

- Reuse the control before restyling one: the [ui-primitives component catalog](../packages/client/ui-primitives/README.md#component-catalog) is the only channel that crosses feature packages, and a deliberate visual difference belongs in a prop there rather than in a second copy ([decision](../.agents/notes/implemented/architecture/2026-09-05-shared-client-control-primitives.md)).
- Use CSS Modules and `clsx`; do not add a component library or Tailwind.
- Use `--qilin-alias-*` semantic tokens in feature components. Do not copy static palette values or write literal colors there; spacing, type size, and radius come from the scales above.
- Keep theme selectors out of feature component CSS. Light/dark overrides belong to the theme owner.
- Pair font sizes with line heights and use the theme typography variables when an existing role matches.
- Keep source text, terminal output, and diff lines unwrapped when their component contract requires column preservation; use the shared scrollbar styles rather than component-specific scrollbar selectors.
- Put presentation in CSS. Inline React styles may pass component-local custom-property values but must not encode theme branches.
- Preserve keyboard focus visibility and reduced-motion behavior when adding transitions or hover-only controls.
- Rounded corners inherit the global superellipse smoothing from ui-theme's `corner-shape.css` on supporting engines. Pair `corner-shape: round` with every full-round `border-radius` (`50%`, `100%`, or a pill radius) so circles and capsules keep circular arcs; the ui-theme corner-shape spec enforces the pairing.
- Elevated surfaces (menus, popovers, modals, panels, floating buttons, the composer) set `border: 0` and take `box-shadow: var(--qilin-elevation-panel)`, `var(--qilin-elevation-prominent)`, or the composer's `var(--qilin-elevation-soft)` (larger blur at lower alpha): the 1px rule is the first shadow layer, and `--qilin-elevation-stroke-color` rebinds or suppresses it per surface or state. Never pair a `--qilin-alias-border-*` border with an lv/elevation shadow — the ui-theme elevation spec rejects the pairing; state-colored borders (warn panels) stay real borders.
- Flat borders and separators that use a neutral `--qilin-alias-border-*` token draw at `1px` — buttons, inputs, cards, row dividers, and separators drawn as filled boxes (menu separators, the conversation header seam, markdown `hr`, vertical rails) share that rule weight, and one device pixel on a 1x display. Dashed affordances and state-colored borders keep 1px; spinner ring tracks keep their width through the spec's explicit allowlist. The ui-theme elevation spec rejects the retired 0.5px hairline as well as any wider neutral solid border.
- Clickable artifact links (markdown anchors, prose file mentions, web source and fetch links, produced-file chips, workflow member links) color through `--qilin-alias-link` at `font-weight: 500`, with no underline at rest and a dotted 3px-offset underline on hover/focus. Compact Thinking Markdown keeps tertiary text color and a resting dotted underline ([compact presentation](../.agents/notes/implemented/bug-fix/2026-09-17-thinking-markdown.md)). Text-leading anchors also lead with the ui-primitives `LinkIcon` category glyph riding `currentColor`, which for a well-known external host is that site's own mark instead of the globe; workflow member links and image-only anchors carry no glyph, and tool-row file links keep their grey dotted affordance ([clickable-link Agent Note](../.agents/notes/implemented/feature/2026-09-04-web-clickable-link-styles.md), [known-site mark Agent Note](../.agents/notes/implemented/feature/2026-09-16-known-site-link-marks.md)).

## Changing the system

Add or change a shared token in the owning `ui-theme` sheet, then consume its semantic alias from feature packages. Update the owning package reference when a public styling contract changes. Visual behavior follows the [testing policy](testing.md); the [styling-system Agent Note](../.agents/notes/implemented/process/2026-07-19-web-styling-system.md) records framework rationale.
