# Upgrading from an upstream DSH release

English | [中文](upgrading-from-upstream.zh.md)

How to pull a new upstream DSH release into this fork. This fork rewrote every package except the vendored Cordis (`vendor/`), so an upgrade is never a merge: it is a per-package alignment driven by a landed plan, and it ends with a full-repository audit. The plan lands first; no code moves before it exists on disk.

## The iron rules

1. **Plan first, code never.** Land two documents under `plans/` — the delta analysis and the alignment plan — before touching any source, manifest, or lockfile. Until both are on disk and the open questions are answered, the only permitted writes are the plans themselves.
2. **Every official release-note line maps to a code-level change.** Walk the upstream release notes item by item and mark where each item lands in this fork. Then dig for the changes the notes do not mention — the actual diff is the authority, not the notes.
3. **Built-in self-developed plugins get an item-by-item upgrade analysis.** The skills family (`packages/skill/*` + `ui-skill` + `ui-settings-skills`) and the MCP family (`packages/mcp/*` + `ui-settings-mcp`) are this fork's own code: for each, name exactly which upstream changes touch it and what its upgrade point is.
4. **Third-party and non-built-in self-developed plugins get a startup-breakage triage.** Upstream breaking changes can crash plugins this repository does not ship: walk each breaking change against the `dsh-compat` compatibility face and the cordis plugin contract, and record which external plugins start, which fail, and which compatibility shim (if any) covers them.
5. **Per-package alignment, because everything is a rewrite.** Except the vendored Cordis (pinned source copies used as-is), every package here is a rewrite of its upstream counterpart: align package by package — upstream change × local rewrite delta × adopt/adopt-with-changes/skip decision — and register opportunities to improve our own package features while the upstream work is fresh.
6. **Finish with the six-dimension repository audit.** Dead code, redundant code, security vulnerabilities, feature breakpoints, wiring omissions, business-logic breakpoints — every dimension gets a tool run or a reasoned sweep, and a verdict recorded in the alignment plan.
7. **Open questions become clarification cards.** Anything where the product semantics are uncertain goes to the user as a card — question, background, options, recommended default — and is answered before the batch that depends on it starts. Guessing product semantics is a red-line violation.

## Phase P0 — delta analysis

Produce `plans/<date>-upstream-<version>-delta-analysis.md`. Work from the actual upstream diff, not the notes alone. Required sections (see `plans/2026-09-30-upstream-0.2.0-rc.2-delta-analysis.md` as the shaped exemplar):

1. **Hard facts overview** — engine/kernel stability conclusions at a glance.
2. **Official release notes, item by item → code-level change points**, grouped as additions, fixes, optimizations, and other.
3. **Code-level changes the release notes do not mention**, split into engine/kernel (model-visible or breaking), client, upgrade breakpoints, and build/CI. This section is where undocumented behavior changes are named — an undocumented change is discovered from the diff, so this section must cite files, not the notes.
4. **Engine feature and kernel differences vs this fork's current tree.**
5. **Built-in self-developed plugins, item by item**: the skills family, the MCP family, then every other self-developed family (sidebar derivatives, terminal, and whatever else the release touches). For each: the upstream change, the local rewrite delta, and the upgrade point.
6. **Third-party and non-built-in plugin startup triage**: each breaking change × the plugin entry paths that the `dsh-compat` face and the cordis contract expose, with a start/fail/shimmed verdict per affected plugin kind.
7. **Per-package alignment inventory** (cordis excluded): one row per package — upstream change, local rewrite delta, decision, and improvement opportunity for our own feature set.
8. **Priority recommendation, brand red lines, and open items** — including the questions that will become clarification cards.

## Phase P1 — alignment plan

Produce `plans/<date>-upstream-<version>-alignment.md`. Required sections (see `plans/2026-09-30-upstream-0.2.0-rc.2-alignment.md`):

1. **Confirmed decisions** — every clarification card, with its resolution and date.
2. **Red lines** — checked before each batch starts; a hit stops the batch. Brand red lines, the vendored-Cordis freeze, released Session-format freezes, and anything the delta analysis flagged.
3. **Batch split** — typically B0 preflight, engine/kernel batches first (smallest risk-reducing batch early), then service/config/persistence seams, then client seams (the conflict-heavy three-way-merge zone), then docs/generators/gates, then the final verification batch.
4. **Risk register, deferred register, and completion criteria.**
5. **Batch execution status**, appended as the work runs, and a closing entry when done.

## Phase P2 — post-upgrade six-dimension audit

Run after the last code batch, before the release is declared. Each dimension produces a verdict and a disposition, appended to the alignment plan:

| Dimension | How |
|---|---|
| Dead code | Sweep exports and files that lost their last consumer in this upgrade (reference graph over `packages/`, `apps/`, `scripts/`); delete or record why it stays. |
| Redundant code | `pnpm run duplication` against the pre-upgrade baseline; new duplication is relocated or justified. |
| Security vulnerabilities | `pnpm audit --prod` plus a lockfile review of everything the upgrade added or bumped; each finding gets fix/accept/defer with a reason. |
| Feature breakpoints | Walk the delta analysis decision list item by item: every adopted upstream feature works in this fork, every skipped one is recorded with its reason. |
| Wiring omissions | The full verify family: `verify-client-catalog`, `verify-kylin-catalog`, `verify-config-catalog`, `verify-module-graph`, `verify-doc-graphs`, `verify-package-dependencies`, `hygiene`, `doc-sync`. A stale catalog is a missing wire. |
| Business-logic breakpoints | `pnpm run test`, `pnpm run test:snapshot`, `pnpm run test:expected`, and `pnpm run test:e2e` where a key exists; failures are business-logic breaks until proven otherwise. |

## Verification ladder

In order, before declaring the upgrade complete: `pnpm run typecheck` → `pnpm run test:gui` → `pnpm run lint` → the Phase P2 audit family → `pnpm run build` → `pnpm run test:docs`. A red gate stops the release declaration; a gate that was red before the upgrade starts is recorded as pre-existing and handed to the sweep window, not silently ignored.
