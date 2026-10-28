---
description: "Model selection for the Web GUI: the /model popup and the composer model seat over one per-session provider-grouped directory; for users and maintainers of model routing."
kind: "package-reference"
---

# @qilin-agent/client-ui-model-selection

English | [中文](README.zh.md)

## Summary

The Web GUI lets users switch the model and reasoning effort for an existing session through either the `/model` popup or the composer's model control. Both surfaces present the same provider-grouped choices, and the selected model determines the available effort names and default. A complete selection applies to the next request; a running step keeps the model and effort it started with. If no adapter can serve the session's route, the composer remains disabled until routing becomes available.

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

Mount this plugin alongside `ui-conversation` and the commands package; the composer then shows the model seat next to the pending indicator, and `/model` opens the same directory as a popup. While the seat's menu is open, `↑`/`↓` move focus across the rows of the shown pane, Tab settles the focused row, and Escape and `Shift+Tab` leave a drilled pane first and otherwise close back to the trigger. Drilling lands on the row of the value in use, and going back lands on the cell that opened the pane left. Both surfaces show the host-reported current selection when the exact provider/model pair remains in the advertised groups. A selection whose model or provider is absent from the catalog stays routable and keeps its stored provider, model, and effort, while the trigger shows `Select model` without the effort caption or the saved IDs; an empty catalog says `No models available.`

### Model and effort

Models stay grouped by provider. The composer menu shows model and effort names only. The `/model` popup shows provider names and catalog descriptions; it localizes the two built-in DeepSeek descriptions and leaves external provider descriptions verbatim. The popup applies the selected model's default effort; the composer can then choose any advertised effort. An adapter without reasoning metadata leaves the Effort row absent; there is no arbitrary effort input.

### Model label extensions

`conversation.input.model.label` is a session-scoped `single` slot for the composer trigger (`placement: 'trigger'`), the root menu's current value (`'menu'`), and each model option (`'option'`). Its owner props provide `provider: { id, name }`, the exact catalog `model`, `placement`, and `selected`. Provider names are localized display names; match channels by `provider.id`, and identify a model by the provider/model ID pair. Connection URLs and credentials are not passed to the slot.

Contributions must render non-interactive content, such as a colored name or badge. The selector owns clicks, search, focus, disabled states, check marks, reasoning effort, and trigger accessibility text. An absent contribution, including after plugin disposal, displays the catalog name with its optional `model.badge` before the name in the trigger and after it in menus: a `Tag` in the badge's tone whose text is resolved for the active locale. Long catalog names ellipsize within the available width while the badge remains visible. A contribution replaces both and receives the badge in its owner props. Loading and unavailable selections do not call the slot. `/model` command rows use the command popup's separate rendering API.

Import this package's `/client` declarations type-only, then register through `ctx.slots.inject('conversation.input.model.label', () => ctx.slots.register({ name: 'conversation.input.model.label' }, ModelLabel))`. Derive `ModelLabel` props from `PropsRuntime<'conversation.input.model.label'>`; use provider IDs to choose CSS Module classes and retain `model.name` as the text. Registration follows the declaration and contributing plugin lifetimes. Without a component replacement, styles can target the enclosing label's `data-provider-id` and `data-model-id` attributes in all three placements.

### Unroutable sessions

When the Host reports that no adapter serves the session's route, this plugin raises a composer block and the input goes inert with its own copy; recovering clears it without a reload. A `null` before the first load or after one failed never blocks, and catalog membership never blocks either — a route serving a model it does not advertise is missing from the groups yet usable.

### Selection failures

When another writer owns the Session, model-selection failures tell the user to quit other running DSH instances and retry.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

Two entries over ONE per-session directory owned by `ModelDirectoryResolver` (`ctx.modelDirectories`): the `/model` popupSelect contribution (registered through `ctx.commandUi`) and the composer's named `conversation.input.model` seat both load the session's advisory directory through `session.models` and submit through `session.selectModel` via the same `ModelDirectory` instance, so a switch made in either entry is what the other shows next. Directory loads and selections share a generation counter so an older response never overwrites a newer one; a connection reset drops every resident projection and repulls the Host-restored selection before display. Directories are per-session, resolved lazily, and disposed with the session scope; addressed subagent sessions expose neither entry. Every resident directory refetches directly on forwarded `llm/adapters-updated`, `llm/models-updated`, and `settings/document-updated` owner events.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

Read these pages when the model surface is not enough. They move from the browser surfaces to the command popup shell and the selection contract.

- [ui-commands](../ui-commands/README.md) — the popupSelect shell the `/model` contribution registers into.
- [ui-conversation](../ui-conversation/README.md) — declares the composer's `conversation.input.model` seat and the composer block.
- [qilin-agent-default-model](../../core/agent-default-model/README.md) — the default-model service for sessions that never choose.
- [Client package map](../README.md) — adjacent browser UI packages.

-----

<a id="model-experience"></a>
## Model Experience

Indirectly, through the `session.selectModel` selection both entries submit: the Host snapshots the complete `ModelSelection` at the next prompt-assembly boundary and owns the model-visible effect, while a running step keeps its assembled selection.

#### KV Cache effect

Switching the route can reduce or invalidate provider-side cache reuse for subsequent requests; the prompt prefix itself is untouched.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>


These limits define the current model surface. They are current package constraints, not a general model-router comparison or a task backlog.

- **No create-time or addressed-subagent selection** — both entries require an existing ordinary session's Agent; there is no draft-phase model choice to fold into session creation, and subagent continuation deliberately exposes no independent model-selection contract.
- **Directory names are presentation-only** — selection and persistence use provider/model/effort ids; a provider whose catalog or exact-model metadata lookup fails lists as an unselectable failure row until reload.
- **No arbitrary effort input** — the composer offers only the exact model's adapter-advertised levels; an adapter without reasoning metadata leaves the Effort row absent.
- **Badges label the composer seat only** — `/model` popup rows, the trigger's accessible name, and its tooltip keep the plain catalog name.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
