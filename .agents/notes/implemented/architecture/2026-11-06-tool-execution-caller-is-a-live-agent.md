# Agent Note: A tool call carries the live Agent

Status: implemented

English | [中文](2026-11-06-tool-execution-caller-is-a-live-agent.zh.md)

## Problem

`ToolExecutionInput.agent` is typed as the live `Agent`, while tool implementations read it in narrow ways: `exec.agent.session` for a directory or a durable append, `exec.agent.id` for job ownership, `exec.agent.options` for route selection. Those reads make a structural subset look like the honest contract. One keyless PTC e2e test built exactly that subset by hand — `{ id, session, ctx }` — and asserted it into `Agent`, because directory resolution calls `agent.ctx.fiber.assertActive()` on the caller.

The same field has two kinds of consumer, and a subset derived from either one misstates the other. Observer tools read the caller's identity, Session, and route. Driver tools act as the caller: they send messages as it, create children under it, and read its lifecycle state.

## Decision

`ToolExecutionInput.agent` and `PtcDispatchLog.agent` carry the live `Agent`. The field states the caller a tool may drive, not a projection of the facts one tool happens to read.

Driver tools set what the field must satisfy. `tool-agent-team` passes the caller to `agentTeams.sendMessage`, `agentTeams.interrupt`, and `agentTeams.createTask`; `tool-ralph` and `tool-subagent` create children under it; `tool-workflow` and `plan-mode` hand it to their own services; `goal/tool-goal` reads `agent.status` for authority. Observer tools read `session` and `id` only (`tool-bash`, `session-checkpoint-policy`, `tool-todo`), but they consume the same field and cannot lower its type.

The PTC e2e harness therefore composes what a caller is: `typedPtcModeHarness` mounts `LlmRuntime`, `AgentRegistry`, and `AgentLoop`, and the typed suite obtains its caller from `ctx.agentLoop.create(...)` — a published Agent on the product's own creation path.

This keeps `ToolExecution.agent` explicit as the [initiator-scope decision](2026-07-15-agent-initiator-scope.md) requires, and states what that explicit field carries.

## Cost of a narrowed caller type

Replacing the field type with `{ id, session, options, ctx, inject }` produced 90 type errors in 36 files before any test was touched. `tool-agent-team` alone accounts for nine call sites that drive the caller. `ApprovalService` defaults its approver's subject to `Agent`, so the `EscalationApprover` comparisons in the shell, filesystem, and plugin-manager rows fail. `goal/tool-goal/src/authority.ts` reads `agent.status`, and several in-repository specs read `exec.agent.inbox`.

Satisfying those errors leaves one of two shapes, both worse than the current contract: widen about fifteen public service signatures to a type that promises less than they use, or have every driver recover the live Agent from `ctx.agents` by id and fail when it is absent. The first weakens the services; the second adds a lookup and a failure mode to recover a caller the loop already held.

## Alternatives considered

**Narrow `ToolExecutionInput.agent` to a tool-caller view.** The measured cascade above: either fifteen widened service contracts or a live-Agent lookup inside every driver. No current consumer requires the narrow view, and the only requester was a test double whose scenario did not depend on it.

**Carry a narrow caller view and the live Agent as two fields.** One identity on two fields, and every consumer must state which one it accepts; a tool that receives only the first fails in the same place the single field would have failed.

**Declare the narrow type for observers only, at their call sites.** Observers receive the same `Agent`, so the declaration would be an unused second name for `Pick<Agent, …>`.

**Implement every `Agent` member on the test double.** The double would satisfy the interface without proving anything: its `inbox`, `status`, `cancel`, and `whenIdle` would never run, and directory resolution would still assert a Context that no Agent lifecycle created.

**Keep the baseline entry.** The recorded cast states that the test composed an incomplete caller. Composition, not the cast, was the missing piece.

## Consequences

The keyless typed PTC suite now runs a published Agent and exercises the product's creation path, so `fiber.assertActive()` observes a real lifecycle instead of a borrowed Context. The harness is heavier: the file mounts `LlmRuntime`, `AgentRegistry`, and `AgentLoop` for every typed case, including the ones that never pass a caller.

The request field keeps the full handle, so a tool can drive its caller without a new type or a lookup. A future consumer that needs a read-only view needs its own evidence that no driver shares the field; sharing is why this one could not be narrowed.

## Verification

- `apps/cli/tests/profiles/headless/tests/ptc.e2e.ts` runs the keyless typed suite beside the with-key real-model case: seven tests covering directory resolution, PTC dispatch, and runtime inspection through a published Agent.
- `pnpm run verify-no-unknown-casts` reports 1494 recorded assertions and no new ones.
