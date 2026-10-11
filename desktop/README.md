# QiLin Desktop

English | [中文](README.zh.md)

A Chinese desktop workbench built on the QiLin engine (shipping first on macOS Apple Silicon). This directory is the Kylin repository's desktop subsystem: the engine is this repository, the desktop and Web clients consume the same build artifacts, and both release with the Kylin repository.

## Repository boundary

The desktop shell and the engine share one repository and one version: the runtime closure builds from a git worktree of this repository's HEAD (`scripts/build-runtime-bundle.sh`), the single source of truth for the version is the Kylin repository root's `package.json`, and a version tag publishes the source and the Web build only. The desktop installer is built by a manual dispatch of the root `desktop-release.yml`, and its artifacts land in that tag's GitHub Release. The former standalone OpenKyLin repository's pinned copy, brand patch layer, and parity gate are retired (see the [merge note](../.agents/notes/implemented/architecture/2026-10-09-openkylin-desktop-merged-into-qilin.md)).

## Common commands

At the Kylin repository root:

```sh
pnpm run build:desktop          # seal the closure, then package with electron-builder (dmg/zip arm64)
pnpm run test:desktop           # desktop product-layer tests (the Node native runner)
```

Inside `desktop/` (`npm test` and the rest):

```sh
npm run dev                     # start the desktop development environment (this workspace + its own Electron)
npm run verify:branding         # validate the brand manifest and contrast
npm run verify:sync -- <webDist> <desktopDist> [report.json]
npm run verify:artifact -- <desktop-runtime.json> <artifactDir> [checksumsOut]
npm run release:manifest -- <desktop-runtime.json> <sync> <checksums> [manifestOut]
```

## Desktop architecture

```
QiLin Desktop (the Electron shell, desktop/, zero npm dependencies)
  ├─ Chinese brand splash page (local assets; the failure state retries and copies diagnostics)
  ├─ spawns the engine host child process (Electron-as-Node, programmatic boot of the qilin product profile)
  ├─ the qilin-app:// private protocol carries the Web client (authenticating reverse proxy + cookie jar + desktop boot gate)
  └─ the shell window loads that protocol address — the same Web client build a browser reaches at the Web address
```

Runtime tree source: under development, `OPENKYLIN_QILIN_RUN` (the dev script passes this repository root); packaged, the first launch unpacks `Resources/runtime/qilin-runtime.tar.gz` (sha256-verified, unpacked into a commit-named directory under userData, so a version change reinstalls it naturally). The upstream contract (the readiness line, flags, bin path, home) is centralized in `main/qilin-contract.mjs`.

Security boundary: navigation may stay only on the current `qilin-app://` origin, external links go to the system browser, and every permission request is refused. Process discipline: a crashed host restarts with exponential backoff (3 attempts at most); exit walks SIGTERM → 5s grace → SIGKILL; a detached watchdog is the fallback, and no orphan process is left behind.

## Development environment

`npm run dev` uses this repository's workspace directly: when the runtime artifacts (`apps/cli/lib/profile-boot.js` and `apps/web/dist`) are missing, it builds them through this repository's toolchain (`pnpm install → build:qilin`, the product build that binds the client build environment and bakes the version badge, commit, and build profile into the artifacts). Electron is not shared (pinned to 44.0.0 — the native loader verifies an exact fingerprint — and installed under `.tmp/dev/electron-tool`, with `electron install.js` running automatically when the download is missing).

Escape hatches for restricted execution environments (CI containers, nested sandboxes); an ordinary terminal sets none of them: `OPENKYLIN_USER_DATA` (redirect Electron userData), `QILIN_HOME` (redirect the harness home), `ELECTRON_DISABLE_SANDBOX` (bypass an outer sandbox's interference with the Chromium OS sandbox), `OPENKYLIN_ELECTRON_NO_GPU=1` (append `--disable-gpu` on a headless/CPU-only runner), `OPENKYLIN_ELECTRON_ARGS` (append arbitrary Electron switches, whitespace-separated), and `OPENKYLIN_QILIN_RUN` (name the runtime tree explicitly).

## Design rules

- The Chinese cultural theme is injected into the shared Web client (`branding/brand-manifest.json` + `branding/theme/tokens.css`), identical for Web and Desktop; the desktop shell (splash, error recovery, menus) does platform adaptation only. Desktop adaptations such as the seal palette and the sidebar sections live as source in `packages/client` and `apps/web`, not as patches.
- Accent tokens (cinnabar, jade, gilt) are for ornament, large text, or status graphics only; body text always uses an ink/paper pair (contrast ≥ 4.5, enforced in CI).

## Release

The local entry point is `scripts/release.sh <version>` (gates → packaging → artifact gates V1–V7 → tag → push): the pushed tag releases the source and the Web build, so a desktop installer is produced locally or uploaded by a separate dispatch. CI runs the root `.github/workflows/desktop-release.yml` (**manual dispatch only**, macOS arm64 single platform). With signing and notarization credentials present it fails closed (any missing credential refuses); locally it produces an unsigned package. Automatic updates go through electron-updater (`latest-mac.yml` plus blockmap increments; the engine stops before installation).
