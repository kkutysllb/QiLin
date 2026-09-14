# Agent Note: Source and artifact plane verification

Status: implemented

English | [中文](2026-09-14-source-artifact-verification.zh.md)

## Problem

TypeScript source checks resolve workspace packages through `src`, while builds emit JavaScript and declarations under `lib`. Compiler output accidentally written into a `src` directory can therefore load a second implementation or make tests depend on stale generated files.

## Decision

[`scripts/verify-source-artifacts.ts`](../../../../scripts/verify-source-artifacts.ts) scans the repository's supported source roots and rejects JavaScript, source maps, and declarations matching a TypeScript source file when they occur under `src`. It ignores build directories by construction and retains ambient declarations such as `css-modules.d.ts` and `vite-env.d.ts`. The check is exposed as `pnpm run verify-source-artifacts` and runs in the shared static and `check:all` gate inventories.

The check reports paths without deleting them. `pnpm run clean` remains the explicit cleanup operation, and source tests must run only after the verifier passes.

## Verification

[`scripts/verify-source-artifacts.spec.ts`](../../../../scripts/verify-source-artifacts.spec.ts) covers emitted JavaScript, maps, matching declarations, ambient declarations, and nested `lib/types/src` output. The static gate invokes the same command used by local development and CI.

## Alternatives considered

- **Extend `pnpm run clean` to delete source-plane artifacts** — `clean` plans removal from the TypeScript project-reference graph and deletes whole directories; deleting one file that sits beside a hand-written source needs a refusal path, and silent cleanup would erase the evidence that names the misconfiguring command.
- **Gitignore the generated extensions under `src`** — ignoring hides the accident from version control but leaves the stale implementation loadable by source tests; the defect is the file's presence, not its tracking status.
- **Detect through `git status` untracked files** — the gate must also reject artifacts a commit accidentally captured, so the check cannot depend on git dirtiness conventions.

## Consequences

A clean checkout fails closed if a compiler or bundler writes into a source directory. Build output remains available under `lib` for artifact consumers, while source tests retain one resolution plane.
