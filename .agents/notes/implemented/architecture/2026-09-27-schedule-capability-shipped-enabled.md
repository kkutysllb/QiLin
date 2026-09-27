# Agent Note: The shipped Web profile enables the Schedule capability

Status: implemented

English | [中文](2026-09-27-schedule-capability-shipped-enabled.zh.md)

## Problem

Durable scheduled tasks already exist in the tree as one capability spread over three rows: `@qilin/schedule` owns the task store and delivers each due occurrence as a follow-up in its original Session, `@qilin/time-context` supplies the current time, browser zone, and elapsed time the model needs to resolve an unqualified date or time, and `@qilin/client-ui-schedule` is the browser half that lists, edits, and reports those tasks. `packages/bundle/web-app/cordis.patch.yml` shipped all three with `disabled: true`, so a QiLin Web profile carried a complete, tested, and unreachable feature: the sidebar entry, the task catalog, and three Host verbs had no way to be turned on. The value the upstream default encodes is that scheduling is opt-in per deployment, and the reason it cannot be reached instead is mechanical — the plugin manager excludes built-in profile bundles by design, so no in-product page can flip a row that `@qilin/web-app` owns.

## Decision

The web-app bundle enables the three rows, and only that: no new package, no second task store, and no parallel browser surface. The rows are enabled as one unit, because each alone leaves a broken shape — the service without its time context cannot resolve "tomorrow at nine", and the browser half without the service has nothing to read.

`packages/bundle/web-app/cordis.patch.yml` is the layer that owns this, because it is the profile the release actually boots: it composes the product's default plugin set, and a deployment that wants scheduling off disables the rows there or in a later overlay. `apps/web/tests/schedule-panel.e2e.ts` boots the real composition and asserts the sidebar row, the task catalog, and the absence of page errors, so a row that stops activating fails in the lane that assembles the product rather than in a unit test with hand-built seats. `apps/cli/tests/profiles/web/tests/web-default-isolation.expected.e2e.ts` pins the shipped default from the other side: the two Host rows active, the browser row delivered in the Client graph.

## Consequences

- A QiLin Web profile now answers "remind me in two hours" and "every weekday at nine" out of the box; the task lands in the Session that asked for it, survives restarts, and is visible from the sidebar entry `Automation tasks`.
- The opt-in value the upstream default carried moves to the overlay layer: disabling scheduling is a deployment edit, not a user action, and the bundle comment says so at the row.
- `docs/subsystems/schedule.md` remains the capability's home; the profile change adds no new service, event, or durable vocabulary.
- The profile default is now asserted twice — once in the profile roster golden and once in the assembled browser — so either half of the capability going quiet is a red gate rather than a missing menu entry.

## Alternatives considered

**Port a separate automation plugin with its own durable records and fresh-session execution.** Rejected: it duplicates a capability the engine already ships, with different semantics (a new root Session per run instead of a follow-up in the Session that asked), two durable vocabularies for one idea, and a second sidebar entry for the same user-facing task. `@qilin/schedule` was ported here for exactly this purpose and is covered by its own executor, delivery-history, and delivery e2e tests.

**Leave the rows disabled and document the overlay that turns them on.** Rejected: the shipped profile is the product, and a feature that needs a hand-written overlay to appear is not shipped. The upstream rationale — keep scheduling opt-in — is preserved through overlay-based opt-out instead.

**Enable `time-context` or `ui-schedule` alone.** Rejected: the three rows are one capability. A service without its time context refuses natural-language dates, and a browser half without its service renders an empty catalog with no way to fill it.
