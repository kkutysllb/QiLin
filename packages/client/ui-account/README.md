---
description: "Account menu in the Web client sidebar footer: the theme and language switches, the Settings entry, and sign-out."
kind: "package-reference"
---

# @qilin/client-ui-account

English | [中文](README.zh.md)

## Summary

The account menu is the footer's account row: the signed-in username's first letter in an avatar, alone in the rail. One dropdown carries the username, Settings, Appearance and Language submenus, and Sign out; it is the Web surface for theme and language, the only Settings entry point, and the only way to sign out. Its facts come from the gate's `GET /api/auth/status` answer, so a deployment without accounts renders the row under the localized label, the same menu minus the identity, and no session to end. The plugin provides no service, owns no dialog, and contributes one list entry.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

The `qilin` Web profile mounts this package through the `web-app` bundle patch; unloading the plugin removes its footer entry and restores the foot without an account surface.

| Row | Present when | Effect |
|---|---|---|
| the signed-in username | the gate answered with an account | a menu heading; the name is not a link |
| Settings | the settings panel is mounted | reveals the settings panel |
| Appearance | always | opens the Light / Dark / Follow system submenu |
| Language | always | opens one row per registered locale, each labelled in that locale |
| Sign out | the account gate is enabled | ends the session, then lands on the public landing page |

The identity and the sign-out row arrive with the status answer, so a menu opened before that answer shows neither; the rows below them are there from the first paint. The theme row matching the current preference and the language row matching the active locale are the marked ones.

A refused or unreachable sign-out navigates nowhere: the page stays where it is, and the menu keeps the rows usable instead of closing over a request that never landed.

<a id="understand-the-implementation"></a>
## Understand the implementation

The plugin fills one list entry in `sidebar.footer.action`, the sidebar's own footer hole, and waits for that declaration through `slots.inject`; the sidebar hands the entry only its column state (`wide`). Copy lives in this package's `account` dictionaries and reaches the component through the framework's `t` seat.

The entry declares `createAccountMenuStore()`: the dropdown's open state plus the account facts one status read resolved. The component reads that snapshot through `props.useStore` and writes through `props.actions`; nothing else mutates it, and the specs build the same store handle directly.

`createAccountMenuInjected` assembles the component's inject face inside `apply`: the two browser reads (`readAccountStatus`, `endSession`), the service calls (`ctx.settingsShell.open`, `ctx.theme.setTheme`, `ctx.locale.setLocale`), and the theme, locale, and settings-panel sources the renderer binds as `useTheme`, `useLocale`, and `useSettingsPanel`. Components reach no service themselves, and the sidecar reads keep their own request paths and navigation target local. The panel is an optional neighbour: `settingsShell` is read through `ctx.get` and its presence is published on the `useSettingsPanel` source from a scoped injection, so a composition that mounts no settings panel still mounts this menu and simply offers no Settings row.

<a id="model-experience"></a>
## Model Experience

None, as the account menu renders browser chrome and registers nothing model-facing.

#### KV Cache effect

None of its own; the menu adds nothing to a request and subscribes to no cached prefix.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Submenu rows draw their own selection mark** — the shared `Menu` marks the top-level rows named in `selectedIds` and renders submenu rows unmarked, so this package draws the check for the active theme and locale row itself and still passes both ids to the primitive. Drop the local mark once the primitive marks submenu rows.
- **The account is read once per mount** — the status read runs when the footer entry mounts, so a session that changed in another tab keeps showing the previous address until the page reloads.
- **A refused sign-out is silent** — the menu stays open and the page stays put, but nothing tells the user the request failed; an error surface would need copy this package does not have.
- **No browser-level assertion covers the assembled foot** — the shipped specs drive the component with fed props and the plugin against a real slot registry; the assembled-surface check is manual.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

This Dev Note is working context for maintainers: open design questions and directions that are not decided. It is explicitly non-authoritative — shipped behavior, limits, and accepted rationale live in the sections above, the package code, and the linked Agent Notes.

- Whether the menu should show a display name or an avatar image is open; the account record behind the status read carries an address and a creation time only.
- An enabled gate on a browser that carries no session still offers Sign out, because the sign-in document reads the same status answer; distinguishing "signed out" from "gate on" would need a field the status read does not report today.
- Flattening the theme and language rows out of their submenus for a narrow column has not been asked for; the submenus keep the dropdown short while the sidebar holds a rail width.

</details>

**Runtime invariant:** No companion is published. The menu's only relationships are its own store and the injected slot face, and no independent observation of them can diverge.
