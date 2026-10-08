# Agent Note: npm publish scope rescope

Status: implemented

English | [中文](2026-10-08-npm-publish-scope-rescope.zh.md)

## Problem

The `@qilin` npm scope is held by a third party that has never published a public package, so the registry can never carry the harness under the scope every manifest already uses, and publishing needs a scope this account owns. Three downstream products (LingShu, KStock, OpenKyLin) consume this repository through pinned branches or commits and embed engine copies; their product-owned code references `@qilin/*` names directly (about 480 references in total), so a rename reaches them only through each product's own engine upgrade.

## Decision

The repository renamed its publish scope from `@qilin` to `@qilin-agent` — an org this npm account owns — in one mechanical sweep over tracked current-state files: manifests, source imports, generated tsconfig paths, catalogs, docs, READMEs, recorded-session snapshots, workflows, and scripts (5,314 files). The release pipeline is otherwise unchanged; the release families' scope assertion moved with the rename. The npm org `qilin-agent` is claimed, publication credentials flow through the existing `NPM_TOKEN` repository secret, and the user-facing entry is `npx -y @qilin-agent/cli web`.

Five textual forms needed separate passes: plain `@qilin/`; regex-escaped `@qilin\/`; split path-join literals (`'@qilin', 'session'`); bare scope prose ("the `@qilin` scope"); and GitHub-slug anchor fragments (`#qilintools` → `#qilin-agenttools`), whose catalogs regenerate the new slugs through `githubSlug`. Deliberately unchanged: dated records (`.agents/notes/`, `plans/`, the `qilin/` acceptance and spec records), `pnpm-lock.yaml` (regenerated instead), the `test@qilin.invalid` fixture email, brand identifiers (`#qilin-seal-*`, `#qilin-wordmark-*`, `qilinDropOverlayClip`), and `@qilinjs/*`, a foreign scope that only shares the prefix.

Downstream follow-up contract: the rename lands as one atomic commit on `main`, and the last pre-rename release stays on its tag. Each product follows up inside its own next engine upgrade — move the pin past the rename commit, apply the same textual replacement to product-owned references (LingShu ~92, KStock ~378, OpenKyLin ~9, including split path-join forms and anchor slugs), and rerun its gates. A product that never re-pins keeps building from its frozen pre-rename copy.

## Consequences

`@qilin/*` names are dead inside this repository: a straggler reference fails resolution loudly at typecheck or install rather than silently resolving. Published packages, their READMEs, and the website all present one name, with no internal/external mapping to maintain. The three downstream products carry a scheduled one-PR cost each at their next upgrade instead of a permanent mapping mechanism here.

## Verification

`pnpm install --lockfile-only` regenerated the lockfile (3,935 `@qilin-agent/` entries, zero `@qilin/` residue in tracked current-state files). Passing gates: `rescope-vendor:check`, `constraints`, `verify-tsconfig-paths`, `verify-package-dependencies`, `verify-package-paths`, `verify-kylin-catalog`, `verify-dependency-catalog`, `verify-tool-catalog`, `verify-config-catalog`, `verify-plugin-packages`, `verify-qilin-package-licenses`, `verify-third-party-notices`, `verify-package-readme-model-experience`, and `pnpm run typecheck`. `test:docs` reports 17 passed and the same three failures the pre-rename tree already had (repository references, README summaries, translation pairing), plus the pre-existing `verify-package-meta` red on a clean checkout.

## Alternatives considered

- **Rewrite names at publish time** — keep `@qilin` internally and rewrite tarball manifests in `release:pack`. Rejected: a permanent internal/external name mapping owned by the release scripts, with published metadata (READMEs, dependency names) diverging from the repository, to avoid a cost the pinned-branch consumption model already makes schedulable per product.
- **Unscoped package names** — every candidate is taken (`qilin`, `qilin-cli`, `dsh-qilin`, …); first-come unscoped names stay exposed to squatters, while a claimed org holds the whole scope.
