---
description: "Offer plugin browsing and a Creator draft in three navigation regions."
kind: "package-reference"
---

# @qilin-agent/client-ui-entry-customization

English | [中文](README.zh.md)

Desktop product events use the optional [product analytics service](../../api/product-analytics/README.md); ordinary Web interactions are excluded.

## Summary

Browse plugins and prepare a reviewable Creator draft from the right-sidebar guide's More menu. The Web app loads this package by default. The guide region draws its own More button; this package stores nothing.

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

Open **More tools** after the right-sidebar guide cards. The menu offers only **Browse other plugins** and **Create your plugin**, and provides no pin controls or sorting.

**Browse other plugins** opens the Plugins main list without opening an installation dialog. **Create your plugin** opens a new or reusable blank Session with the Creator preset and adds a short localized request for a plugin in that region to its draft: an empty draft takes the request as its text, and an existing draft keeps its text, references, and attachments with the request appended as a new paragraph. It never sends a message. Review and send the draft yourself. Both actions remain available regardless of the region's entries; a separator appears above browsing only when folded Views precede it.

On Desktop, **Browse other plugins** and **Create your plugin** report `more_menu_item_click` before they act, with `action=browse_plugins` or `action=create_plugin` and the menu's `region`: `rightbar`. The menu reports no exposure events. Without the analytics service, both actions behave the same and report nothing.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

[`apply`](src/client/index.ts) registers [`EntryMenuContent`](src/client/EntryMenuContent.tsx) under id `entry-customization` into `sidebar.right.tab.guide.actions` through `ctx.slots.inject`, so the registration follows the region's declaration lifetime. The region renders this slot inside its own `Menu`; the rows call `onDismiss` before browsing or creating.

The registration's `inject` supplies its region and two callbacks. Each callback first calls `ctx.get('productAnalytics')?.track('more_menu_item_click', { region, action })`. Browsing then calls `pluginNavigation.openList()`. Creation then calls `uiWorkspace.startSession(undefined, { agentPreset: 'ptc', prompt, whenDraftExists: 'append' })` with the region's localized prompt; it does not go through `ui-agent-preset`, so the preset chip plays no introduction. The [web-app bundle patch](../../bundle/web-app/cordis.patch.yml) mounts the browser plugin.

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
