# Agent Note: QiLin ships the web engine only, so CI runs on demand

Status: implemented

English | [中文](2026-10-07-fork-ci-runs-on-demand.zh.md)

## Problem

QiLin is the web-engine fork of the harness: it ships source, and no artifact is published from it — no npm packages, no installers, no release binaries, no hosted service. The inherited workflow set still started on every push to `main`: `CI main` (build plus the full unit suite), `CI master` (Wine-on-Linux), `Sandbox` (four OS/runner legs, including the macOS seatbelt leg that builds the tree and runs the whole unit suite), the `Release (qilin)` and `Release (vendor)` pack rehearsals, `E2E`, and the path-filtered native lanes. One main push therefore occupied hosted runners for about half an hour, and the release rule asked for a tag and a GitHub Release before that push even when the change was a one-line fix.

The workflows and their trigger contracts are inherited on purpose: `.github/workflows/ci-master.yml` keeps upstream's file name, display name, and event guards so periodic upstream imports stay diffable, and `scripts/ci-workflow.spec.ts` pins those contracts (the `on` sets of `ci-master.yml` and `ci.yml`, the post-merge job inventory, the standby guards). Pruning triggers in the files would diverge from upstream and rewrite those assertions on every alignment round.

## Decision

The CI, build, and release workflows are disabled at the GitHub level (`gh workflow disable`), so nothing in `.github/workflows/` records the choice and the files stay byte-identical with upstream. Disabled workflows: `CI`, `CI main`, `CI master`, `E2E (real DeepSeek API)`, `E2E (pi-ai Azure OpenAI and Anthropic)`, `Sandbox`, `Expected filenames`, `Release (qilin)`, `Release (vendor)`, `Release publish (qilin)`, `Release publish (vendor)`, `Release (Python)`, `Node Addon System`, `Node Addon System Release`, `Build single-exe`, and `Build PR preview`.

- No `push`, `pull_request`, or `schedule` event starts them; the repository's Actions tab reports `disabled_manually`.
- Any of them still runs on demand: `gh workflow enable "<name>"`, then `gh workflow run "<name>"`. A workflow is re-enabled per name, so a change that needs platform evidence re-enables exactly the lane that provides it.
- Repository automation that is not CI stays enabled: issue lifecycle, issue policy, weighted approval, and the manually dispatched documentation deploy.
- Verification evidence is local: `pnpm run test:gui` for the client and host packages, `QILIN_SNAPSHOT=replay pnpm run test:web` for assembled browser output, `pnpm run typecheck`, `pnpm run lint`, `pnpm run duplication`, `pnpm run test:docs`, and the narrow selection the [qilin-pre-push-checks skill](../../../skills/qilin-pre-push-checks/SKILL.md) prescribes for the outgoing diff.
- The release rule is locally enforced by the `pre-push` hook ([verify-release-tag.ts](../../../../scripts/verify-release-tag.ts)) on the release a push declares: a pushed `main` commit carrying an annotated `v*` tag must have a GitHub Release with written notes, and the manifests must name that tag's version. A push without such a tag ships no release and passes.

## Alternatives considered

**Prune the triggers in the workflow files.** The result would be identical on a push and visible in the repository, but it diverges every pruned file from upstream and forces `scripts/ci-workflow.spec.ts` (which asserts `ci-master`'s `on` set, its post-merge job inventory, and the standby guards) and `scripts/ci-compatible-selfhosted.spec.ts` to be rewritten in the same change and re-merged on every upstream import.

**Keep CI and make it cheaper — shards, path filters, nightly lanes.** Sharding the unit job and moving the seatbelt lane to a nightly schedule would cut the wall clock, but the remaining lanes still start on every push, and the fork's unique coverage (macOS seatbelt parity, Wine, the packed-distribution rehearsal) verifies upstream alignment rather than QiLin's web surface.

**Delete the workflow files.** Removes the triggers for good, but also the on-demand runs and the diffability the fork keeps for upstream imports; every import then conflicts over deleted files.

**Leave CI running and read the result later.** Keeps the full matrix as a post-push safety net, at the cost of the wait and the tag-per-push ceremony the fork's release rule imposes on every change.

## Consequences

Bought: a main push finishes in seconds; upstream imports keep their diff surface; every lane remains one command away when a change genuinely needs platform or packaging evidence; and the release rule keeps its only mechanically enforced part (the tag and its written release notes).

Cost: nothing runs automatically, so a regression reaches `main` unless a local gate catches it, and the forbidden-direction cases the hosted lanes covered — macOS seatbelt confinement, Wine-on-Linux, pack-then-install rehearsal, the nightly e2e sweep, the pull-request verdict — stay dark until someone enables that workflow. "Actions is green" is no longer available as evidence for this repository, so a change description must quote the local commands it ran. Re-introduction is per workflow, not a repository-wide switch.

## Related

- [Quality gates](2026-06-11-quality-gates.md): that record gives CI ownership of the gate matrix; this fork runs the same gates locally and keeps the workflows on demand.
- [Serial cross-platform CI reference](2026-07-21-serial-cross-platform-ci-reference.md): the serial reference lanes it describes, the seatbelt full suite included, are now on demand.
- [CI failover runbook](2026-07-26-ci-failover-runbook.md): the failover variables act only while the workflow that reads them is enabled.
