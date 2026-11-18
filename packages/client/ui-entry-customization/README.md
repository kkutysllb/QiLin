---
description: "List unpinned sidebar panels, folded Conversation Views, and Creator actions in three More menus."
kind: "package-reference"
---

# @qilin-agent/client-ui-entry-customization

English | [中文](README.zh.md)

Desktop product events use the optional [product analytics service](../../api/product-analytics/README.md); ordinary Web interactions are excluded.

## Summary

Fill the More menu of the left sidebar, the Conversation View tab row, and the right-sidebar guide: unpinned panel launchers with a pin control, folded Views, plugin browsing, and a reviewable Creator draft. The Web app loads this package by default. Each region draws its own More button; this package stores nothing.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

The `@qilin-agent/web-app` bundle loads this package by default; it needs no Plugins switch or profile selection. A region shows its More button only while its actions slot has a registration, so unloading this package removes all three buttons.

The left sidebar's More menu lists the panel launchers the person unpinned, in registration order, each with a pin control. Choosing the pin action calls the sidebar's `onPinnedChange(id, true)`; the row then returns to the sidebar at its registration position rather than the end of the list. A row also opens its panel without changing the pin state. Pinned panels are not repeated in this menu because they already show as sidebar rows. The pin list itself is owned by `ui-sidebar` and stays in memory, so a reload restores every launcher.

The Conversation View tab row's More menu lists the folded Views and marks the active one; it has no pin controls. The right-sidebar guide's More menu lists neither entries nor pins.

**Browse other plugins** opens the Plugins main list without opening an installation dialog; the row appears only while the Plugins page provides its optional `pluginNavigation` service. **Create your plugin** opens a new or reusable blank Session with the Creator preset and adds a short localized request for a plugin in that region to its draft: an empty draft takes the request as its text, and an existing draft keeps its text, references, and attachments with the request appended as a new paragraph. It never sends a message. Review and send the draft yourself. A separator appears above browsing only when entries precede it.

On Desktop, **Browse other plugins** and **Create your plugin** report `more_menu_item_click` before they act, with `action=browse_plugins` or `action=create_plugin` and the menu's `region`: `sidebar`, `conversation`, or `rightbar`. The menu reports no exposure events. Without the analytics service, both actions behave the same and report nothing.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

[`apply`](src/client/index.ts) registers [`EntryMenuContent`](src/client/EntryMenuContent.tsx) under id `entry-customization` into `sidebar.panellist.actions`, `conversation.session.header.views.actions`, and `sidebar.right.tab.guide.actions` through `ctx.slots.inject`, so each registration follows its region's declaration lifetime. The region renders this slot inside its own `Menu`; the rows call `onDismiss` before browsing, creating, or pinning.

The registration's `inject` supplies its region, an optional `pluginNavigation` presence source, and two callbacks. The presence source flips through `ctx.inject(['pluginNavigation'])`, so the discovery row follows the Plugins page's access gate. Each callback first calls `ctx.get('productAnalytics')?.track('more_menu_item_click', { region, action })`. Browsing then calls `ctx.get('pluginNavigation')?.openList()`. Creation then calls `uiWorkspace.startSession(undefined, { agentPreset: 'coding', prompt, whenDraftExists: 'append' })` with the region's localized prompt; it does not go through `ui-agent-preset`, so the preset chip plays no introduction. The [web-app bundle patch](../../bundle/web-app/cordis.patch.yml) mounts the browser plugin.

</details>

-----

<a id="model-experience"></a>
## Model Experience

None, as the package manages browser launchers and prepares an unsent, reviewable draft; only user submission sends its text to the model.

#### KV Cache effect

None; the package neither assembles nor sends model requests.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- The More menu provides no visibility controls; plugin reload restores defaults.
- Legacy pin values in localStorage are neither read nor written.
- **Create your plugin** does not check whether the Creator preset exists. Without it, Session creation fails, the Workspace shows its creation-failure notice, and no draft is prepared. Draft preparation also requires a resolvable Workspace; without one, the existing flow reports that a Workspace is required.
- Conversation owns the estimated tab split; the menu provides no sorting.
- Conversation controls follow the existing nonblank-Session header and Coding Tools eligibility. Right-sidebar controls require a selected Session and appear on its guide page.
- The menus do not list plugins; use the browsing action to open the Plugins page.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
