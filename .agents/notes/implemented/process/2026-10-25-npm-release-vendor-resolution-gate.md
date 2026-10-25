# Agent Note: A qilin release ships only when the registry resolves its declared ranges

Status: implemented

English | [中文](2026-10-25-npm-release-vendor-resolution-gate.zh.md)

## Problem

The 3.1.7 release published the qilin family but not the vendor family, and registry-resolved installs broke on contact: `subagent-codex@3.1.7` declares `@qilin-agent/schemastery: ~3.18.5`, the harness packages declare `@qilin-agent/kylin: ~4.0.5` as peers, and the registry still carried 3.18.3 and 4.0.3 from the 10-08 batch. The vendor versions had moved on 10-17, and nothing in the release flow noticed. Three assumptions combined into the hole. The `release-publish.yml` pack job packs the vendor family into `dist/npm-vendor` for install verification only, and its own comment says "Only dist/npm is published" — the vendor family is a separate release sequence with its own tags, and its last registry batch predated the version bump. The publish order orders only intra-family install dependencies, so cross-family references get no ordering. And the family model treats peers as advisory because npm never installs a peer on the package's behalf — true for npm 6, false since npm 7, which installs peers and fails the install when they cannot resolve.

## Decision

The publish job ends with a registry postcondition, `pnpm run release:verify-published --family qilin --from dist/npm`. The gate reads the packed set through the publish order and tarball identities, then checks the registry — with `--prefer-online`, per the stale-packument rule — for two facts: every member's own published version exists, because an interrupted publish leaves a hole; and every `@qilin-agent` dependency, optional-dependency, and peer range the published manifests declare has a satisfying version. Optional peers are skipped, because npm keeps them advisory; optional dependencies are required, because this repository uses them for engines a package advertises and a silently skipped engine is a broken release even though npm exits zero. The vendor family stays an independent sequence: when a qilin release references vendor versions, the operator publishes that family first (`release:pack --family vendor`, then `release:publish --family vendor`), and the gate holds the qilin run until the registry resolves. AGENTS.md carries the rule next to the releases-on-demand bullet.

## Alternatives considered

- **Publish the vendor family from the qilin workflow.** Rejected: the release families are independent sequences with separate version baselines and tags, so releasing one never republishes another ([sequences](2026-08-10-npm-release-sequences.md)). Coupling them would republish unchanged vendor packages on every release and blur which tag owns which bytes.
- **Relax the cross-family peer ranges to carets.** Rejected: the ranges come from `workspace:~` rewrite semantics, and a wider range trades hard install failures for silent framework-layer drift on every consumer.
- **Check the ranges before publishing, from the tree.** Rejected as the single gate: the pre-publish registry state is not the state the publish creates, and the invariant that matters is the postcondition. The verify step already prints the publish order; the missing half was the registry check.

## Consequences

- Every release publish performs about two registry reads per member, which adds minutes to a 3.1.7-sized family — the price of shipping an installable tree.
- An interrupted publish now fails the gate at its first missing member, complementing the digest guard that catches same-version content drift rather than absence.
- The 3.1.7 remediation was manual: cosmokit 1.8.6, schemastery 3.18.5, and kylin 4.0.5 were published on 2026-10-25. The gate exists so the next drift fails the run instead of the consumers.

## Related

- [2026-08-10 npm release sequences](2026-08-10-npm-release-sequences.md) owns the family split this gate joins.
- [2026-10-12 publish resume after interruption](2026-10-12-publish-resume-after-interruption.md) owns the digest guard and the stale-packument ground-truth rule this gate applies.
- [2026-10-10 releases are on demand](2026-10-10-releases-on-demand.md) owns the tag-and-Release rule this publish flow serves.
