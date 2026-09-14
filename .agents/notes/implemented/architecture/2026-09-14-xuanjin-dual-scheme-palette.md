# Agent Note: Xuanjin dual-scheme palette for the Web client

Status: implemented

English | [中文](2026-09-14-xuanjin-dual-scheme-palette.zh.md)

## Problem

The product's three visible surfaces disagreed about the brand's colors. The pre-session documents (landing and auth) carry the "Xuanjin" dark-gold VI through the `--ql-*` tokens in their stylesheets, while the workspace kept the platform's cool neutral-bluish surfaces with a green accent (`--dsw-alias-brand-primary` `#0b7a5a` light / `#3fd6a0` dark) from the three-token brand layer of [2026-09-13](../bug-fix/2026-09-13-qilin-brand-surfaces-and-settings-entry-point.md). A visitor moving from the landing page into the console crossed from warm gold-on-black into green-on-cool-grey.

The landing VI ships one scheme only, so no light-mode source existed anywhere: deriving one was required the moment the workspace's light palette had to match the same VI.

The landing page had no theme control at all, and the auth page shares the landing token names, so a toggle on one page without the other would strand a stored choice.

## Decision

**The landing tokens are the single color source, and the brand layer states both schemes for the whole surface stack.** `QILIN_TOKENS` in [tokens.ts](../../../../packages/client/ui-theme-brand/src/client/tokens.ts) grows from three tokens to fifty-five, grouped by family. The dark values transplant the landing palette verbatim: the canvas `#0d0b09`, surfaces `#16130f`/`#1d1915`, one derived third layer `#26211c`, the ink ramp `#efe9df`/`#a89f90`/`#857c6c`, and gold-500 `#c9a24a` as the accent. The light values derive the warm-paper counterpart: paper canvas `#f8f5ee`, near-white warm layers `#fdfbf5`, warm near-black ink `#221d15`, and gold-700 `#8f6f2e` as the accent. Every overridden token keeps a real component consumer; tokens with no current consumer (brand-text, module-platform, multi-select, and the rest) stay with the base palettes.

**Contrast decisions are computed, not eyeballed.** The light link gold `#7d6126` is derived rather than the VI's gold-700 because gold-700 reaches only 4.3:1 on the paper canvas while `#7d6126` holds 5.3:1 (the replaced blue link was 4.2:1). Light primary buttons are gold-700 with the palette's own white foreground at 4.7:1; dark primary buttons are gold-500 with the dark palette's near-black foreground at 7.9:1, which is the landing CTA pairing. `--dsw-alias-label-primary-foreground` is deliberately not overridden: the checkbox pairing (label-primary fill + foreground check) depends on it, and gold-700 keeps that pairing intact without any component edit. Hover keeps each platform's convention — dark brightens (gold-500 to gold-300, the landing CTA's own hover), light darkens (gold-700 to the derived link gold).

**State colors and the ongoing blue stay.** Error red, success green, warn amber, info blue, and the state-business blue family (ongoing dots, the turn navigator, user-bubble reference chips) keep their base values: gold-500 sits next to warn amber `#f59e0b` closely enough that folding "ongoing" into the brand gold would make the two states hard to tell apart.

**The pre-session pages get one shared toggle.** Both documents default to the dark VI, flip through `html[data-ql-theme='light']`, and persist one choice under the `ql-theme` storage key. Each page carries a pre-paint inline script in its own `<head>` so a stored light choice applies before first paint; the click behaviour lives in one shared module ([theme-preference.ts](../../../../apps/web/src/theme-preference.ts)) imported by both page modules; the labels and glyphs stay in each page's html. The landing stylesheet mirrors the workspace derivation (paper canvas, warm ink, gold-500 CTA with `#141006` text in both schemes) and re-bases its decorative white-alpha washes on warm ink; the auth card gains the same light variant with a corner-mounted control. The workspace's own light/dark/system preference remains separate: it is a durable product setting, while `ql-theme` is a pre-session page choice.

## Verification

The brand-token spec runs the layer through the production `ThemeRuntime` and its override stack: it pins the landing values (dark accent gold-500, dark canvas `#0d0b09`, the link pair), proves stacking and removal on unload, and now accepts `rgba()` hairline values while still requiring both modes and mode-distinct values per token. The load-bearing contrast pairs were computed against the WCAG relative-luminance formula before the values were fixed; the recorded ratios live in the tokens.ts header. `pnpm run test:gui`, `pnpm run typecheck`, and `QILIN_SNAPSHOT=replay pnpm run test:web` cover the client suites, the two page documents, and the replayed browser scenarios.

## Alternatives considered

**Override `label-primary-foreground` to the CTA ink so light primary buttons could use gold-500 fill.** The foreground token also paints the check mark inside checkboxes whose fill is `label-primary`; a near-black foreground on the light checkbox's near-black fill makes the check invisible. Gold-700 with the existing white foreground reaches every primary surface without touching the pairing.

**Make light accent gold-500 everywhere for VI fidelity.** Gold-500 text on paper is 2.2:1, and focus rings and switch tracks from gold-500 fall under the 3:1 non-text minimum on light surfaces. The deep gold is the VI's own third ramp step, so the family stays intact.

**Fold the ongoing blue into the brand gold.** Gold-500 and warn amber are close in hue and lightness; "running" and "warning" would need a second cue to stay distinct. Keeping blue preserves the state palette's semantics.

**Edit the design-platform ramps.** The `--dsw-static-*` sheet is the platform's copied layer; the brand override layer exists precisely so a product can restate its tokens, and unloading it restores the platform palette. Repainting the ramps would make the re-skin irreversible.

**Resolve the landing toggle from `prefers-color-scheme` on first visit.** The dark VI is the page's brand statement; the product decision (user-confirmed) is dark by default with the toggle persisting the choice.

## Consequences

Every `--dsw-alias-*` consumer repaints warm in both schemes with no component edits — the tokens-only styling rule is what kept the change to one file on the workspace side. The sidebar joins the canvas family in both schemes (`#f1ece0` light, `#0d0b09` dark), superseding the 2026-09-13 note's neutral-sidebar decision; that note is updated in place and links here.

The pre-session toggle is separate from the workspace theme preference, so a visitor's landing choice does not reach the product's Appearance setting, and the setting does not reach the logged-out pages.

`ql-theme` is a browser-local key on the static documents; the workspace shell never reads it, and the inline scripts fail closed to the dark default when storage is unavailable.

The light derivation is now the reference for any future surface that needs a light variant of the VI: paper canvas `#f8f5ee`, warm ink `#221d15`, gold-700 accent, derived link gold `#7d6126`. A second light consumer should take those values from this layer rather than re-deriving them.
