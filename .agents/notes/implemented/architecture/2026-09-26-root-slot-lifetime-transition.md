# Agent Note: Root slot lifetime transitions render the crash face instead of throwing

Status: implemented

English | [中文](2026-09-26-root-slot-lifetime-transition.zh.md)

## Problem

The Web client mounts the assembled application only after the boot kernel audits every client entry as active, and `RootOutlet` in [scoped-slots.tsx](../../../../packages/client/ui-renderer/src/client/scoped-slots.tsx) treated an empty `'root'` registration set at render time as a boot-order failure: it threw `SlotAssemblyError` instead of rendering a blank. The [client boot audit](../../../../packages/client/web/src/boot-client.ts) and the ctx-level `renderSlot('root')` guard make that state unreachable while the roster is stable, so the throw described a state the mount sequence cannot produce.

The host bundle transport in [client-hmr](../../../../packages/client/hmr/src/index.ts) stat-polls every graph row's client bundle every 500 ms and reports a changed bundle through `clientModules.rebuilt(id)`; the [client plugin loading model](2026-07-23-client-plugin-loading-model.md) owns that hot-reload transport. The `/plugins/events` channel hands the resulting frame to every open page, and the page's entry controller replaces that client entry in place ([entries.ts](../../../../packages/client/modules/src/client/entries.ts)). Replacing an entry disposes the effects its fiber owns. When the replaced entry is the `'root'` occupant or a service provider on its injection chain, that disposal empties `'root'` while the React root stays mounted, and the outlet — which subscribes to the slot's version — re-rendered into the empty window and threw.

The result was an uncaught render error on a page whose interface recovered once the replacement finished. It is intermittent by construction, because it needs a rebuild during a mounted page: one hit in five runs of `file-upload-round` while other work was rebuilding client bundles, and no hit in a quiet tree.

## Decision

- `RootOutlet` records whether a commit actually rendered an occupant, and an empty `'root'` after that renders the slot's crash face (`<div data-slot-error="root" />`) instead of throwing.
- The boot-order failure stays loud where it is reachable: `SlotRegistry.renderSlot('root')` rejects a render with no registration, and a first render that never produced an occupant still throws the boot-order `SlotAssemblyError`.
- Replacing the occupant re-registers the slot, the version subscription re-renders the outlet, and the new occupant renders. The window closes without operator action.

## Trigger chain

Host HMR stat poll, `clientModules.rebuilt(id)`, the SSE `rebuilt` frame, the page's `entries.reload`, and `replace(entry)` dispose the entry fiber's effects in order. The resulting cascade clears `'root'`, the mounted outlet renders the crash face, the replacement re-registers `'root'`, and the occupant renders again.

## Alternatives considered

**Wait for a `'root'` registration before handing the mount point to the application.** This covers only the first render, so a replacement that empties the slot later still reaches the outlet. It also turns a missing layout registration into a page that waits forever, and it flashes the boot page on every replacement.

**Fix the mount order or a repeated mount.** The mount path is a single call after the roster audit, and boots instrumented for this investigation showed the registration present at mount time. There is no premature or repeated mount to reorder.

**Keep the throw.** A client entry replacement necessarily empties `'root'` between the occupant's disposal and its re-registration, so the throw keeps crashing the React root on every replacement of that entry or of a provider on its chain.

**Let the registration outlive its fiber.** The registration's lifetime is the owning fiber's effect, and Cordis disposes a fiber's effects on unload. Keeping it alive across a replacement would move ownership of the `'root'` registration out of the plugin that occupies the slot.

**Unmount the React root while the slot is empty.** Remounting the assembled application on every plugin replacement discards the page state — drafts, scroll position, open dialogs — that live entry replacement exists to preserve.

## Testing

| Evidence | Behaviour |
|---|---|
| [ui-renderer.client.spec.tsx](../../../../packages/client/ui-renderer/tests/ui-renderer.client.spec.tsx) | Disposing the occupant and registering a replacement under the mounted application renders the replacement with no uncaught error; the case failed with `SlotAssemblyError` before the change. |
| [client-plugin-live.e2e.ts](../../../../apps/web/tests/client-plugin-live.e2e.ts) | A bundle rebuild that replaces the root occupant's chain publishes a new revision, leaves the page free of page errors, and keeps the frame rendered. |
| [scoped-slots.client.spec.tsx](../../../../packages/client/ui-renderer/tests/scoped-slots.client.spec.tsx) | A fresh render with no `'root'` registration still throws the boot-order error. |
| [registry.client.spec.ts](../../../../packages/client/ui-renderer/tests/registry.client.spec.ts) | The ctx-level `renderSlot('root')` still rejects a render with no registration. |

## Consequences

- A client entry replacement that clears `'root'` no longer produces an uncaught render error; the shell shows the crash face for the window between disposal and re-registration.
- A boot-order defect remains a loud failure at the ctx-level entry and on a first render with no occupant.
- A composition whose layout never registers fails at `renderSlot('root')` rather than inside the React tree.
- The window renders an empty div, so the shell's columns and overlay are absent until the replacement arrives; that interval has no occupant to draw them.