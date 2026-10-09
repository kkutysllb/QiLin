# Agent Note: OpenKylin desktop shell merged into QiLin

Status: implemented

English | [中文](2026-10-09-openkylin-desktop-merged-into-qilin.zh.md)

## Problem

The desktop shell lived in a separate OpenKyLin repository that consumed this repository as a locked upstream: `upstream/qilin.lock.json` pinned a QiLin commit, and the desktop pipeline cloned that commit into a staging checkout, applied web-branding patches, and built the engine closure from it. Every QiLin fix — including user-visible desktop fixes such as the new-session hover corrections — reached a shipped desktop only after the pin moved, so real-device bugs persisted on desktops while the fix sat in this repository. The split also kept a parallel release flow, a parallel patch layer, and a parity gate whose only job was reconciling the two copies.

## Decision

The OpenKyLin repository is merged into this one as `desktop/` (git subtree, history preserved). The engine dependency inverts: the shell builds the engine from this repository's own HEAD — `desktop/scripts/build-runtime-bundle.sh` checks out a `git worktree` of HEAD, installs, runs `build:qilin`, and collects the production closure; `desktop/scripts/dev.mjs` runs the shell against the live workspace. The upstream-lock machinery — `fetch-upstream`, `verify-upstream`, the lock file, the branding patch layer, and the web/desktop parity gate — is deleted; the former patches are ordinary source under `packages/client` and `apps/web`.

The release flow is unified on this repository's tag line: a `v*` tag drives both the engine release chain and `desktop-release.yml`, which builds, signs, verifies (artifact gates V1–V7), and attaches the desktop artifacts to the same GitHub Release; create-or-upload resolves the ordering race between the two workflows. The desktop version is the workspace version; `desktop/package/package.json` is synced from the root at packaging time.

The `desktop` profile name stays reserved: the public CLI still rejects `--profile desktop`, and the shell boots the `qilin` profile, so the reservation has no in-repo consumer to release.

This decision reverses the desktop-shell half of the [desktop and account boundary note](2026-09-25-desktop-and-account-alignment-boundaries.md); the account-stack half of that note stays in force unchanged.

## Alternatives considered

**Keep the separate repository and move the pin faster.** Rejected: pin velocity treats the symptom — the patch layer, the parity gate, and the two release flows exist only because there are two copies, and every QiLin change still reached the desktop one release late.

**Carry the shell as a vendored copy without inverting the dependency.** Rejected: vendoring keeps the lock-and-patch mechanism that produced the stale-desktop defect class; inverting the dependency (engine = this tree) is what deletes the mechanism.

## Consequences

`pnpm run build:desktop` and `pnpm run test:desktop` are the desktop entries; desktop CI runs from `desktop-release.yml` at the repository root. QiLin source changes are desktop-visible in the commit that lands them, and the desktop adaptations (seal branding, titlebar inset, sidebar sections, hover fixes) live as ordinary source rather than patches. The former standalone-repository claims in `desktop/README.md` are replaced by the in-repo flow.
