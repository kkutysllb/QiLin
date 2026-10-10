# Agent Note: Releases are on demand, not every main push

Status: implemented

English | [中文](2026-10-10-releases-on-demand.zh.md)

## Problem

QiLin inherited the harness rule that every push updating `main` ships a version: the pushed commit had to carry an annotated `v*` tag whose GitHub Release held written notes, and `pre-push` refused the push otherwise. This fork ships source and publishes no artifact, so the rule taxed ordinary work. A one-line fix needed a version bump across the workspace manifests, an annotated tag, notes, and a Release object before it could leave the machine, so review read version churn instead of the change. The rule also folded one judgement — whether a change deserves a version — into every push, and `QILIN_RELEASE_SKIP` existed mostly to get around it.

## Decision

A `main` push ships no release by itself. A release happens when the pushed commit carries an annotated `v*` tag, and that tag is the whole declaration. The `pre-push` job ([verify-release-tag.ts](../../../../scripts/verify-release-tag.ts)) then verifies it: the tag's GitHub Release must exist with written notes of at least 80 characters, and the root manifest's version must equal the tag verbatim, prerelease segment included. A push whose commit carries no release tag passes untouched. Cut a release with `pnpm run version:set <x.y.z>` over a rebuilt tree, `git tag -a vX.Y.Z -m …`, and `gh release create <tag> --notes-file <notes.md>`. `QILIN_RELEASE_SKIP=<reason>` still bypasses a dead GitHub, and a tag-only push still needs its Release to exist first because the hook falls back to comparing `main` with `origin/main`.

## Alternatives considered

- **Keep the rule and pass `QILIN_RELEASE_SKIP` per push.** Rejected: a gate that every push disables is not a gate, and it hides the day a release is genuinely half-made.
- **Require a release only for a path filter (`packages/**`, `apps/**`).** Rejected: the filter re-imports the same "does this deserve a version" judgement the rule was supposed to remove, and a documentation change can still warrant a version while a package refactor may not.
- **Drop the release checks entirely.** Rejected: a tag with no Release, a stub body, and a manifest that does not name the tag are all silent failures that surface to users as a version that never shipped. Verifying a declared release costs nothing on the pushes that declare none.

## Consequences

- A `main` push needs no version bump, tag, or Release. Releasing is one deliberate act rather than a tax on every push.
- The gate keeps its teeth for the case that matters: a declared release that cannot ship fails with the exact remedy (publish the Release, write real notes, or bump the manifests to the tag).
- `scripts/verify-release-tag.spec.ts` pins both directions: an untagged commit passes as shipping nothing, and a tagged commit without a Release fails.

## Related

- [2026-10-07 fork CI runs on demand](2026-10-07-fork-ci-runs-on-demand.md) owns the disabled-workflow decision this rule change accompanies.
