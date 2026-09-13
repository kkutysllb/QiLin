---
description: "Settings shell, ownerless copy, and durable product-onboarding namespace for the qilin web client: the General section, panel chrome, and onboarding ledger projection."
kind: "package-reference"
---

# @qilin/client-ui-settings-general

English | [中文](README.zh.md)

## Summary

Use this package to give the qilin web client a settings page, connection-recovery control, feature-contributed navigation, and sequential first-run onboarding. Users open it from the account menu's Settings row in the sidebar footer, retry a failed connection immediately, and access a local configuration file when the Host makes one available on a loopback browser. Feature packages supply their own settings rows, sections, and onboarding steps; this package supplies their shared presentation and does not add onboarding copy or built-in General rows.

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

Users reach the shell from the sidebar footer's account menu, whose Settings row calls `ctx.settingsShell.open()`; feature plugins contribute their pages and onboarding steps through the slot ledgers this shell projects. The shell renders no Settings control of its own. A pale-yellow **Disconnected** action in the sidebar footer indicates browser offline suspension while the panel is closed. Automatic recovery shows **Reconnecting** with one to three dots advancing every 500ms. Hover or keyboard focus changes either yellow label to **Reconnect now** without changing its background; press feedback stays within the warning palette, and selecting it starts retry 1 immediately. Recovery changes the region to pale-green **Connected** for two seconds before it disappears. The icon, left-aligned text origin, height, and width remain fixed across every visible state. Initial startup and uninterrupted healthy operation remain silent. The shell renders the settings page, the navigation built from `settings.section` entries, and exactly one mounted onboarding step at a time.

### Resizing the navigation

The settings page navigation seeds at 188px and its right edge is a vertical, pointer-captured separator: dragging reports a clamped 160–360px width, and the separator keeps the localized accessible name from the `settings` namespace. Width is viewing state local to the shell occupant, so it resets when the panel unmounts rather than persisting into the settings document.

### Section cards and About

Each settings page is centered inside a stable detail card. The header's **Back to workspace** capsule uses the same close path as the mask and Escape key. The navigation keeps the shell-owned **About QiLin** entry pinned to its bottom edge, and that page introduces the project with the two-character 麒麟 mark. The `settings.about.mark` seat lets the active QiLin brand provider render the vector seal; localized 麒麟 text remains the explicit fallback.

### The General section

The General section holds rows registered into `settings.general.item` by feature packages — it has no built-in rows. Feature plugins own the row copy and behavior; the shell only provides the section and its slot. The Appearance row, for example, lives in ui-theme.

### Onboarding steps

The onboarding ledger projects in ascending order and mounts exactly one step at a time. Registrants own durable completion, capability readiness, copy, mutations, and their visible wrapper, so independently registered flows cannot stack and the shell does not become a second configuration fact source. Visible steps own their dialog chrome and app-root `inert` lifecycle.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The shell owns the chrome and the projections; every piece of content and copy belongs to a registrant.

### Ledger projections

The navigation is a projection of the `settings.section` ledger; nav labels may be locale-following thunks, resolved through `resolveSlotLabel` and re-rendered on the section ledger bump or the locale revision (an optional `ctx.get('locale')` read; no hard locale dependency). The onboarding ledger projects in ascending order; the active registrant receives its id, `complete()`, and an `openSection(id)` callback, and completing or skipping transfers ownership to the next entry.

### Connection recovery

The shell is an explicit recovery consumer, so it injects Connection directly rather than adding lifecycle controls to `ctx.remote`. Its private hooks compartment binds `ctx.connection.state`, while the component receives only the selected state and an injected callback for `ctx.connection.reconnect()`. `ConnectionIndicator` owns the inline presentation and receives all visible and accessible copy from the `settings` locale namespace; the shell owns the two-second recovered-state timer.

### Host half

The Host half is an inert loader entry: the shell's product facts and policy live entirely in the browser half.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

These pages cover the settings surface family and the composition model.

- [ui-settings](../ui-settings/README.md) — the domain base whose slot types and scope service this shell builds on.
- [ui-sidebar](../ui-sidebar/README.md) — the sidebar shell hosting the `sidebar.settings` seat.
- [ui-settings-models](../ui-settings-models/README.md) — the feature package contributing the DeepSeek onboarding step.
- [settings](../../settings/README.md) — the durable user-settings seam and its file provider.
- [Slot system standard](../../../.agents/notes/implemented/architecture/2026-07-22-slot-type-chain-implementation.md) — the composition model behind the ledgers.

-----

<a id="model-experience"></a>
## Model Experience

None, as the package is a browser-side UI plugin layer that registers nothing model-facing.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>


These limits define what the shell itself provides versus what features must supply; they are current package constraints.

- **The General section has no built-in rows** — each row appears only when its owning feature plugin is mounted; the shell cannot fill the section alone.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>

**Runtime invariant:** No companion is published. The settings seam validates and publishes the durable onboarding section, while slot conflicts fail loud in the slot core. The local document action is browser state over typed RPC responses and is covered by store/component tests rather than a Cordis runtime relationship.
