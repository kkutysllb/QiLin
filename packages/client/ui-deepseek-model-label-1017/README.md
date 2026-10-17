---
description: "Temporary 1017 release badge beside the official DeepSeek Flash labels in the composer model selector."
kind: "package-reference"
---

# @qilin-agent/client-ui-deepseek-model-label-1017

English | [中文](README.zh.md)

## Summary

This package shows `1017` beside `DeepSeek-V4.1-Flash` in the composer model selector: the input trigger, the root menu's current-model row, and every model option. It decorates the recognized official entries with the shared `Tag` primitive while preserving their catalog names and request ids. Web composes it by default; disabling its row restores the plain catalog names.

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

The Web bundle includes this plugin, including when Desktop uses that bundle. It has no configuration fields.

The badge appears only when the provider is `deepseek-official` or `deepseek-account`, the model id is `deepseek-flash`, and the catalog name is exactly `DeepSeek-V4.1-Flash`. Any other provider, id, or name keeps its catalog text, including an already dated release name. This fork composes no account route, so the `deepseek-account` half of that condition never matches here; it stays upstream-shaped so a later port needs no edit.

The badge needs the model-label slot that [model selection](../ui-model-selection/README.md) declares. Remove that package and this one contributes nothing.

Disable the following row through a profile patch to restore the catalog name:

```yaml
- id: ui-deepseek-model-label-1017
  disabled: true
```

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The browser entry contributes to the existing `conversation.input.model.label` slot through `ctx.slots.inject()`, so it waits for the declaration, reruns after a redeclaration, and leaves with its own fiber. The component derives the label from the owner props and uses the shared `Tag` primitive; it owns no cache, subscription, network request, or model-selection state. The `deepseek-model-label-1017` dictionaries register as one effect. The Host entry is an empty `apply` that keeps the package on the host roster.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

These packages own the selector and its catalog source.

- [Model selection](../ui-model-selection/README.md) — label placement and selection behavior.
- [DeepSeek transport](../../llm/llm-deepseek/README.md) — built-in model catalog.

-----

<a id="model-experience"></a>
## Model Experience

None, as the package only decorates browser labels without changing model requests or Session events.

#### KV Cache effect

None; provider requests and their cached prefixes are unchanged.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

The fixed release marker has these presentation limits:

- The settings editor, the `/model` command, the trigger's accessibility text, and existing tooltips keep the original catalog name.
- This package occupies a `single` slot. Another model-label plugin at the same priority conflicts; the two presentations do not compose automatically.
- The badge matches one exact catalog name. A catalog that renames the Flash entry hides the marker instead of decorating the new name.
- The `1017` marker is fixed client presentation, not a server capability assertion, and upstream ships it as temporary. Remove this package and its bundle row when a structured release label replaces it.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
