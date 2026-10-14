---
description: "Theme, font-size, and font-family settings for the qilin web client: --qilin-* token stylesheets, ThemeRuntime state, the General settings font rows, and the pre-plugin bootstrap."
kind: "package-reference"
---

# @qilin-agent/client-ui-theme

English | [中文](README.zh.md)

## Summary

`qilin-client-ui-theme` lets Web GUI users choose `light`, `dark`, or `system`, and set the font and font size of text, code, and the sidebar terminal separately in Settings. A loopback client stores these values in the `ui-theme` settings namespace, which the provider persists in `$QILIN_HOME/settings.yaml` by default. The plugin resolves `system` through `prefers-color-scheme` and publishes immutable `ThemeSnapshot`s; ui-layout applies each snapshot to the document. The package also ships the `--qilin-*` token stylesheets and injects a synchronous bootstrap so the selected palette, font sizes, and fonts apply before the shell loads. Third-party themes can register alias-token overrides through `ctx.theme`.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Users switch the color scheme and content typography from three rows in Settings (General section); all three choices persist across restarts on a loopback browser. Feature plugins consume the current snapshot through `ctx.theme` and read the `--qilin-*` tokens in CSS; they do not manage theme state themselves.

### Typography

The plugin registers Appearance preference cubes and the text font-size stepper in the General section. A More font settings button after the stepper expands a region below it, collapsed on every settings open, with a font row for each of text, code, and the sidebar terminal, plus the code and terminal font-size steppers. The account menu owns the light/dark/system choice, over the same service. The text stepper accepts integer values from 10 through 22 px and defaults to 14 px. It changes conversation headings and base text by the same increment, including the user bubble and composer draft; flow-row titles, summaries, and tables follow one step under the body size, while small text keeps a fixed size. The code stepper (10–16 px, default 11) sets the code-block size; inline code stays 1 px larger, and the small tool-output variant uses the same size. The terminal stepper (10–20 px, default 13) sets the sidebar terminal cell font size; changing it keeps the shell and output and refits the grid. Each accepted change writes through the Host settings API. Rapid changes serialize in gesture order with namespace revisions, and a rejected latest write reloads the durable values. Non-loopback pages keep these choices process-local.

### Fonts

Three rows set the text font (interface and conversation text), the code font (code blocks, inline code, and other `--ds-font-family-code` text), and the sidebar terminal font independently. Each field takes comma-separated family names and commits on blur or Enter; an empty field restores the built-in stack. The service normalizes each list by dropping quotes, backslashes, angle brackets, and control characters and double-quoting every name except CSS generic families, then stores it in `textFontFamily`, `codeFontFamily`, or `terminalFontFamily`. The user list precedes the role's built-in stack, so a font missing on the machine falls back to the default. The field accepts any installed font name; it does not enumerate local fonts.

### Registering a theme

A composition can register a third-party theme id with alias-token overrides through `ctx.theme`; the override layer folds into the active snapshot's tokens in registration order. Removing one never overwrites the last durable built-in preference. Third-party theme ids remain an in-process extension and do not cross the built-in settings schema.

### Pre-plugin palette

When the host composition includes an HTTP server, the host half embeds the registered `ui-theme` settings, or schema defaults, into each index response. Head CSS selects the document canvas color scheme before any script runs, including a `prefers-color-scheme` query for the `system` preference. A body script then sets `body[data-ds-dark-theme]`, `--qilin-content-font-size`, `--qilin-code-font-size`, `--qilin-terminal-font-size`, and each non-empty `--qilin-font-family-<role>` list before the loading page and application scripts, so the first paint uses the selected palette and text and code sizes, and `ThemeRuntime` starts from the saved sizes and fonts instead of rendering the defaults first.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The service owns theme, font-size, and font-family state and publishes snapshots. The ui-layout presenter applies those snapshots, and the token sheets own the color and conversation text scales.

### Stylesheets

`src/styles/` holds seven sheets imported in order by ui-theme's dynamic client entry: `base.css`, `corner-shape.css`, `design-platform.css`, `focus.css`, `scrollbar.css`, `gradient-shadow-text.css`, and `shiki.css`. The client bundle compiles and injects them as plugin-owned global styles, so unload and HMR remove them with ui-theme. `scrollbar.css` is the sole consumer of the `--qilin-alias-scrollbar-*` tokens and must follow `design-platform.css`, which declares them.

[`focus.css`](src/styles/focus.css) provides a `:focus-visible` fallback that names the ring colour through `var(--qilin-focus-ring-color, var(--qilin-alias-state-business-primary))` and the standard width through `--qilin-focus-ring-width`, never the outline style — so a control that disables its outline stays paintless, and one that declares no ring keeps the standard geometry instead of Chromium's `auto 1px`. The theme resolves this blue in both palettes; component outlines and focus-ring shadows use the same colour expression, including rings on descendants and pseudo-elements. `--qilin-focus-ring-width` (2px) is the standard width; dense tables and toolbars may keep 1px, and offsets remain component-owned.

In pointer modality, `html[data-input-modality='pointer'] body :focus-visible:not(:read-write)` makes the ring colour transparent. Descendants and pseudo-elements inherit that value; the rule does not clear `box-shadow`, so elevation and selected-state borders remain independent of ring visibility. Editable text controls matching `:read-write` retain their own focus feedback on click. [Input modality](../ui-primitives/README.md#input-modality) determines when keyboard focus styling resumes; it does not move DOM focus.

`base.css` suppresses only the outline of focused elements marked `data-dsh-automatic-focus` by the [primitive focus helper](../ui-primitives/README.md); ordinary keyboard focus styling, borders, shadows, and error states remain intact.

`corner-shape.css` smooths every rounded corner: inside `@supports (corner-shape: superellipse(1.5))` it defines `--qilin-corner-shape` and applies it to all elements and their `::before`/`::after` through the universal selector, so engines without `corner-shape` keep circular corners. Full-round shapes — `border-radius: 50%` circles and pill radii — pair `corner-shape: round` with their radius in the owning component sheet because a superellipse deforms them; the corner-shape stylesheet spec enforces that pairing across every package stylesheet.

`gradient-shadow-text.css` derives `--qilin-content-font-delta` from `--qilin-content-font-size` and shifts the Markdown heading and base-text ladder by that increment. It also declares `--qilin-content-leading` on `body` at `0px`; every ladder line height adds that term, so the presenter's leading adjustment moves the rows a tier occupies without changing the size relationships. It also derives the secondary tier `--qilin-content-font-size-secondary` (setting −1 at ≤14, setting −2 above; 13px at the default) with its own `--qilin-content-font-delta-secondary` for the table variants and the flow rows one step under the body. Dense small variants stay fixed. The code variants (`--dsw-font-markdown-code`, `-code-block`, `-code-block-small`) shift size and line height by `--qilin-code-font-delta`, the difference between `--qilin-code-font-size` and 11 px. Outside the ladder, the user bubble and composer draft read the body pair directly, and flow-row titles and summaries read the secondary pair. The sheet also owns the shadow scale (`--qilin-shadow-lv*`) and the elevation tokens: `--qilin-elevation-stroke` draws a 0.5px hairline through the rebindable `--qilin-elevation-stroke-color`, and `--qilin-elevation-panel`/`--qilin-elevation-prominent`/`--qilin-elevation-soft` (the composer's larger-blur, lower-alpha tier) layer two faint soft shadows over that stroke, so elevated surfaces set `border: 0` and carry no layout-consuming outline; the derived tokens are re-declared per element so a surface's stroke-color rebind takes effect.

### Scrollbar rebinding

`scrollbar.css` binds `--qilin-scrollbar-thumb` and `--qilin-scrollbar-thumb-hover` on `body` to the l1 base-surface tokens; an elevated surface (menu, popover, dialog) rebinds them to the l2 tokens on its own container, and the pair's other legal target is `transparent` (ui-sidebar rebinds its column that way while the pointer is elsewhere). WebKit-based browsers also read `--qilin-scrollbar-width`, `--qilin-scrollbar-thumb-border`, and `--qilin-scrollbar-track-margin`; a scroll surface may rebind them to keep a wide draggable rail around a narrower visible thumb or to inset the track from rounded ends. The two rendering paths are mutually exclusive by construction: Firefox takes the standard thin scrollbar inside `@supports not selector(::-webkit-scrollbar)`, and WebKit-based engines take the pseudo-elements, so geometry and hover customization apply only through the pseudo-element path.

### Preference persistence

The service provides itself immediately with the schema defaults on a loopback browser, then loads the `ui-theme` namespace and writes each accepted theme, font-size, or font-family change through the Host settings API. Pushed settings changes and reconnects refetch the namespace. While its own writes are pending, the service ignores refetched sections, so an echo of an earlier write cannot revert a later change; it adopts the durable section once the writes settle. Non-loopback pages do not create that Host-backed scope. The persistence boundary is owned by the [Host-backed preferences note](../../../.agents/notes/implemented/bug-fix/2026-08-06-host-backed-web-preferences.md).

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

These pages cover the layout presenter, the token consumers, and the styling rules.

- [ui-layout](../ui-layout/README.md) — the presenter that applies the resolved theme snapshot.
- [ui-sidebar](../ui-sidebar/README.md) — a consumer of the scrollbar rebinding contract.
- [ui-conversation](../ui-conversation/README.md) — a consumer of `--qilin-scrollbar-width` for the composer seat.
- [Web styling](../../../docs/web-styling.md) — the authoritative styling rules for web client components.
- [Host-backed preferences](../../../.agents/notes/implemented/bug-fix/2026-08-06-host-backed-web-preferences.md) — the persistence boundary decision.

-----

<a id="model-experience"></a>
## Model Experience

None, as the package is a browser-side UI plugin layer that registers nothing model-facing.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>


These limits define the theme extension surface and the color authority; they are current package constraints.

- **Third-party themes are an extension point, not a product** — registering one means overriding same-named alias variables; no validation exists that an override set is complete.
- **The token sheets are the sole color authority** — values absent from the design system are deliberately not appended; the nearest semantic token wins, and design-owner-approved additions enter as a static step plus a semantic alias in the same change.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
