# Agent Note: Kylin framework rescope

Status: implemented

English | [中文](2026-09-14-kylin-framework-rescope.zh.md)

## Problem

The vendored Cordis framework carried its upstream name at every product surface. The product decision names the framework **Kylin**: an independent framework identity based on upstream Cordis, published under our own `@qilin` scope.

## Decision

The cordis family of vendored packages moved from `@deepseek-ai/cordis*` to `@qilin/kylin*` through the standing codemod: [`scripts/rescope-vendor.ts`](../../../../scripts/rescope-vendor.ts) ran `--apply --reverse` under the old tables, its RENAMES/EXACT_EDITS/POSTCONDITIONS were updated to the new names, then `--apply` and `--check` completed the round trip. The foundation libraries (`@deepseek-ai/cosmokit`, `@deepseek-ai/schemastery`) keep their scope; they do not carry the Cordis brand. Vendor directory names stay (`vendor/cordis/`), per the rescope precedent.

Deliberately unchanged: the `cordis.yml` configuration family and the Loader's `cordis:` builtin prefix (durable on-disk formats), the `cordis/*` event domain, Inspector topics such as `cordis/tree`, the `cordis` agent-preset id (model-visible product data), `Symbol.for('schemastery')`, and upstream attribution in `THIRD_PARTY_NOTICES.md` and the `vendor/README.md` manifest (MIT obligation names the upstream project, not our scope).

[`scripts/verify-npm-install-layout.ts`](../../../../scripts/verify-npm-install-layout.ts) exempts the framework from the synthetic dual-release scheme by name: the framework is the one shared peer layer, and its per-release synthesized versions would contradict the single-shared-installation invariant it also asserts.

## Verification

`pnpm run rescope-vendor:check` verifies no residue, every exact edit landed, and idempotency; `verify-vendored-links` resolves all 9 vendored names; `verify-cordis-config` passes 144 config files; full `pnpm run typecheck` passes; core and boot suites pass 1159/1160 with the one failure an HMR watcher timing flake that passes in isolation; the typert type-model snapshot regenerated against the new module names.

## Alternatives considered

- **Rename in one blind sweep** — a plain token rewrite cannot distinguish the framework name from upstream attribution, protocol prefixes, and product keys; the codemod's delimited-token rule plus exact-edit counts own that distinction.
- **Move cosmokit and schemastery to `@qilin` as well** — they carry no Cordis brand; widening the diff buys no naming clarity. Deferred until a need appears.
- **Rename `cordis.yml` and the `cordis:` prefix together** — durable on-disk formats; a rename breaks every existing profile, preset, and recorded snapshot for zero functional gain.

## Consequences

Compositions that reference `@deepseek-ai/cordis*` rows stop resolving; the product is pre-release and ships no migration. Follow-up phases rename the harness's own `@qilin/*cordis*` packages and the documentation prose; recorded-session snapshots refresh against the new plugin row names.
