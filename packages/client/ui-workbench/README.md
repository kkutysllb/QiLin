---
description: "Workbench tag state owner for the qilin web client: the general/coding selection, each tag's remembered new-task preset, and the preset-to-tag session visibility fold."
kind: "package-reference"
---

# @qilin-agent/client-ui-workbench

English | [中文](README.zh.md)

## Summary

This package owns the workbench selection: which of the two workbench tags — general or coding — the client surfaces show, and which agent preset each tag's new task carries. It exposes one `workbench` client service holding the persisted selection, the per-tag preset memory, and the visibility fold that decides which blank sessions rebind to the active tag's preset after a switch. The package owns state only: surfaces that switch the tag or rebind sessions consume the service, so the dependency edge stays one-directional.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

The two tags are a filter over sessions, not a composition change. **General** shows the standard and creator presets; **coding** shows the coding and creator presets. A preset the fold does not name — a user copy or one a newer deployment ships — is visible under both tags, so a custom preset can never strand its sessions out of every list, and a session whose projection has not landed stays visible everywhere.

New tasks name their preset explicitly (dual-workbench D3): the general tag's default is `standard`, the coding tag's default is `ptc`, and a pick made inside a tag is remembered for that tag alone. Switching tags is a rendering change; rebinding an on-screen blank session to the tag's preset is the calling surface's job through the preset `select` remote, which the Host refuses for any session that already started.

The selection persists in this browser under `qilin.workbench.v1`. It is a per-browser view preference, the same family as the conversation's content width, not host user settings: another browser or another machine starts on the general tag.

### Consuming the service

Inject the `workbench` service and read `state` as an observable snapshot. `setActive(tag)` switches the tag; `presetFor(tag)` and `setPresetFor(tag, presetId)` read and remember each tag's new-task choice; `shows(preset, tag)` answers the visibility fold for one session's `agentPreset` projection value. The fold and the tag vocabulary are also exported as pure values so a test can assert membership without booting the service.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

One snapshot store persisted through the shared client-store localStorage attach: the whole state — active tag plus the two preset fields — is one JSON document, revalidated on boot against the state shape so a document written by an older or broken build resets to the defaults instead of leaking an unknown tag into the switcher. The service registers as a cordis Service named `workbench`, requires no other client service, and its host half is an inert apply so the package stays a well-formed Loader entry. Because the service holds no session or remote access, a tag switch cannot rebind anything by itself; the surface that renders the switcher calls back into session navigation for the D3 rebind, which keeps ui-workbench free of cycles with its consumers.

</details>

-----

<a id="model-experience"></a>
## Model Experience

None, as the package is browser-side workbench view state that registers nothing model-facing.

#### KV Cache effect

None of its own; the tag selection adds nothing to a request and subscribes to no cached prefix.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **The tag mapping is a shipped constant** — the preset ids each tag shows are fixed in code, not configuration. A deployment that renames or adds shipped presets edits the fold with them.
- **The selection is per browser** — a user who switches machines or browsers starts on the general tag again. Host settings would make the choice follow the account; the 2026-09-14 right-sidebar note records why this family stays browser-local.
- **No migration path from the removed preset picker** — the D4-disabled ui-agent-preset plugin remembered a single global default; that value is not read here.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

This Dev Note is working context for maintainers: open design questions and directions that are not decided. It is explicitly non-authoritative — shipped behavior, limits, and accepted rationale live in the sections above, the package code, and the linked Agent Notes.

#### Future: a settings-backed tag when a deployment asks for it

A deployment that wants the tag to follow the account registers a host settings namespace and adopts it over the localStorage document; the state shape already separates the persisted document from the fold, so the swap is confined to the owner's boot path.

</details>
