# Agent Note：发布中途被打断后需要的是恢复路径，而不是重新开始

Status: implemented

[English](2026-10-12-publish-resume-after-interruption.md) | 中文

## Problem

During the v3.1.5 release the Publish job was cancelled mid-run on a false stalled-read, after it had already uploaded about 45 of 333 tarballs. Every subsequent attempt died for a different reason: the interrupted upload left the next version in the registry's staged state (`409 Conflict - Cannot publish over previously staged version`), and once that cleared, any retry that re-packed the tree failed on `scripts/release/publish.ts`'s digest guard (`already published with different content`) — packing is not byte-reproducible across runs, so a repack can never match the bytes of an interrupted attempt's uploads. Neither GitHub's job re-run nor a verbatim re-dispatch of the release workflow can complete once a partial publish exists. The incident also exposed an operator trap: the cancellation came from reading the Actions timestamps instead of the registry, and a healthy publish is slow by design at roughly six seconds per package.

## Decision

A publish interrupted after some versions landed is recovered by removing those versions from the local tarball set, never by touching the registry and never by weakening the digest guard. The validated shape (reference execution: run 38265470932, dispatched from a temporary branch since deleted): a copy of `release-publish.yml` inserts one step before `release:publish` that deletes from `dist/npm` every tarball whose `name@version` is already on the registry, so the unmodified publish script never sees a conflicting digest and uploads the remaining set. The partially published versions keep serving throughout; after success the branch, the workflow, and the trim script are deleted. The trim script and the temporary dispatch workflow should become product surface (an explicit resume input on `release-publish.yml`); until that lands, an interrupted publish is recovered by recreating the trim step as above.

## Alternatives considered

- **Unpublish the partially published versions, then replay the standard flow.** Rejected: registry-destructive, and npm's rules on republishing after an unpublish add a waiting risk on top of an already broken release.
- **Loosen the digest guard to warn and skip on mismatch.** Rejected for the default path: the guard's teeth had caught a real non-reproducible artifact the day before; a global relaxation reopens that hole. Trimming the local set keeps the guard intact by never showing it a conflicting version.
- **Publish the remaining set from a local checkout.** Rejected: the local publish identity carries 2FA on writes, and a developer checkout can serve stale packuments through the npm cache; CI holds the working publish identity.

## Consequences

- The next release pass should promote the trim script to `scripts/release/resume-trim.ts` on `main` and give `release-publish.yml` an explicit resume input, so recovery is one dispatch instead of a temporary branch.
- Before cancelling an in-flight publish, read registry ground truth (the packument versions and dist-tags) rather than Actions timestamps or cached `npm view` output.
- On this repository's checkout, `npm view` can serve stale packuments (`prefer-offline`); ground-truth checks read `registry.npmjs.org` directly.

## Related

- [2026-10-10 releases are on demand](2026-10-10-releases-on-demand.zh.md) owns the tag-and-Release rule this recovery flow publishes under.
