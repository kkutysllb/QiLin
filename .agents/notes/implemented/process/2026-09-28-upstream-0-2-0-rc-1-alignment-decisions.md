# Agent Note: Upstream 0.2.0-rc.1 alignment decision gate

Status: implemented

English | [中文](2026-09-28-upstream-0-2-0-rc-1-alignment-decisions.zh.md)

## Problem

The [upgrade plan](../../../../plans/2026-09-28-upstream-0.2.0-rc.1-alignment.md) spanning batches B0–B9 needed eleven owner decisions settled before dependent batches could start: landing strategy, target version, telemetry defaults, account boundaries, plugin distribution, and product analytics.

## Decision

All gates were adopted on 2026-09-29 with the plan's recommended defaults, recorded in plan §3.1.

- **D0-a**: land directly on `main`, one commit per batch.
- **D0-b**: target version `3.0.6`.
- **D1**: `session-log-deepseek.enabled` stays default `true`, becomes a per-request `Volatile<boolean>` with a General settings row and compliance copy.
- **D2**: switch to the `dsh-otel-collector.deepseeksvc.com` endpoint and introduce the shared `otel` line; environment variables keep the `QILIN_TELEMETRY_OTLP_URL` prefix.
- **D3**: do not port the account-search host path; only the four decoupled pieces (`SearchAuth` discrimination, `x-dsh-auth-token` header, 401-account copy, relaxed `available()`), with `resolveAccountToken` staying an optional parameter QiLin never injects.
- **D4**: write the plugin peer fence as an explicit distribution convention in the dsh-plugins README; do not restore the `isRuntimePeer` check.
- **D5**: this round lands the mechanism only; icon/locale completion for the twelve satellite plugins is deferred.
- **D6**: adopt the upstream optional-bundle mechanism and withdraw QiLin's own `time-context`/`schedule`/`ui-schedule` enablement rows from `bundle/web-app`; the overlap with `dsh-kylin-automation` is a separate project.
- **D7**: self-author the preview release-notes copy (QiLin version string, own feedback channel); the mechanism (settings document key with exact equality) ports as-is.
- **D8**: do not adopt product analytics this round; no `ctx.get('productAnalytics')?.track(...)` call appears in QiLin code, and analytics-only consumer modules are skipped rather than left orphaned.
- **D9**: keep the settings save path unchanged; the upstream release-notes item about `boot/config-editor` is recorded as not applicable.
- **D10**: adopt the `agent-experience` skill content at QiLin's own preset-skill level under `packages/preset/agent-presets/presets/cordis/skills/`; execution belongs to the B8 satellite batch and is deferred with it.

## Alternatives considered

**Restoring `isRuntimePeer` for the peer fence (D4).** Rejected because the check hid the distribution requirement inside plugin code; an explicit README convention keeps each satellite repo's owner on the hook at publish time.

**Adopting product analytics with the telemetry batch (D8).** Rejected because the stack depends on the upstream account surface QiLin never ports; keeping the calls would have meant dead code and orphaned modules.

## Consequences

Batches B0–B9 executed against one recorded intent, and §9.1 of the plan links each batch to its acceptance commands and results. Within-round decision deltas that surfaced during execution are recorded separately, notably the [running-status shimmer re-adoption](../feature/2026-09-29-running-status-shimmer-redecision.md). Deferred work stays visible in the plan: the `agent-experience` skill adoption (D10, with B8), satellite icon/locale completion, the `dsh-kylin-automation` overlap project, B7 browser-infrastructure tests, and the B8 satellite-repo execution owned by each repository.

## Verification

Plan §3.1 records each decision with its date; plan §9.1 records per-batch status, upstream coverage, acceptance commands, and leftovers. The B9 release ran the full gate aggregate, regenerated artifacts without drift, and tagged `v3.0.6` matching the workspace version.
