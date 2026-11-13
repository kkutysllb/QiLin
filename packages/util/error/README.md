---
description: "Dependency-free HarnessError base class with a stable machine-routable code, shared by capability packages that cannot depend on each other."
kind: "package-library"
---

# @qilin-agent/util-error

English | [中文](README.zh.md)

## Summary

`qilin-util-error` gives every harness package one error base. `HarnessError` carries a stable, machine-routable `code` distinct from the human-readable `message`, keeps the chained `cause`, and names itself after the subclass constructor. It imports nothing, so `@qilin-agent/llm` and `@qilin-agent/attachment` share the class even though `llm` depends on `attachment`.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Extend it in the package that owns a failure class:

```ts
import { HarnessError } from '@qilin-agent/util-error'

type AttachmentErrorCode = 'ATTACHMENT_MISSING' | 'ATTACHMENT_TOO_LARGE'

class AttachmentError extends HarnessError {
  constructor(message: string, code: AttachmentErrorCode, options?: ErrorOptions) {
    super(message, code, options)
    this.name = 'AttachmentError'
  }
}
```

Route on `code`, never on parsed `message`. Tool execution projects `{ name, code }` from a thrown `HarnessError`, and model-request failures keep that class's code instead of collapsing to `UNKNOWN`.

<a id="understand-the-implementation"></a>
## Understand the implementation

`HarnessError` holds no module state, registry, or constructor table: it adds one `code` string to `Error` and forwards `ErrorOptions`. `name` comes from `new.target.name`, so each subclass keeps its own name while sharing one base identity at runtime boundaries.

### Source map

| File | Contents |
|---|---|
| [`src/index.ts`](src/index.ts) | `HarnessError` |

<a id="further-exploration"></a>
## Further Exploration

- [`@qilin-agent/llm`](../../llm/llm/README.md) keeps the `LlmError` taxonomy and provider-neutral codes, and re-exports this base.
- [`@qilin-agent/attachment`](../../attachment/attachment/README.md) owns `AttachmentError` and its stable codes.
- [`@qilin-agent/tools`](../../core/tools/README.md) projects `{ name, code }` onto tool results.

<a id="known-limitations-and-deferred-work"></a>
## Known Limitations and Deferred Work

- **`instanceof` names one installation.** A profile that installs two copies of this package holds two distinct classes; the workspace links one copy, and callers crossing a host boundary pass `{ name, code }` instead of relying on prototype identity.
- **Codes are open strings.** There is no closed union here; each seam owns its code set, and consumers must tolerate unknown codes.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

`HarnessError` lives in this leaf package instead of `@qilin-agent/llm` because `llm` depends on `@qilin-agent/attachment`, and `AttachmentError` must extend the same base class. Keep the dependency-free property: any import here reintroduces the cycle this package exists to remove.

</details>
