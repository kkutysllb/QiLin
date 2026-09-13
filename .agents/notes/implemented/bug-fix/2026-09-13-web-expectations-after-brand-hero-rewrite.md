# Agent Note: Web expectations after the QiLin brand and hero rewrite

Status: implemented

English | [中文](2026-09-13-web-expectations-after-brand-hero-rewrite.zh.md)

## Problem

The brand, landing, and settings-entry rewrites changed what the Web browser lane renders, and its scenarios and goldens kept expecting the surfaces those rewrites replaced — [brand surfaces and the single Settings entry point](2026-09-13-qilin-brand-surfaces-and-settings-entry-point.md), [local accounts and the landing surface](../feature/2026-09-12-qilin-local-accounts-and-landing.md).

Five scenario files anchored on the retired hero copy, `Into the Unknown`. Two waited for that text, one used its element as a DOM landmark (the brand mark was "the preceding sibling `span` of the headline"), one asserted the text was gone once a command ran, and the HMR scenario edited `'hero.headline': 'Into the Unknown'` in the locale source. The hero now renders the brand mark, a time-of-day greeting, and the product tagline, with the product name as an ambient wordmark behind them. `hero.headline` reads `QiLin` in both dictionaries, so the HMR needle matched no source line, and the sidebar brand prints the same product name, so a page-wide text anchor for it is ambiguous.

Twelve settings-dialog goldens were recorded before the MCP servers and skills pages existed, so each was missing the dialog's two newest navigation rows and the navigation's resize separator. Their scenarios passed only where a dialog was never captured.

The Models and onboarding scenarios assert what the page offers a provider that has no key, and they type into that provider's key field. The lane loads the repo-root `.env` into the process environment before any scaffold boots, and that file carries `MINIMAX_CN_API_KEY`. The credentials provider resolves the process environment above its `.env` fallbacks, so the running page presented an environment-provided credential — the field rendered read-only with `由启动环境提供（只读）`, and two goldens recorded the environment-provided deletion copy instead of the page-managed one.

Two further defects surfaced in the repaired lane and belong to the same rewrites. The sidebar account menu waited for the settings panel's service before it would activate at all, so the one scenario that mounts the shipped roster without the settings panel — a fixture surface that serves no settings traffic — booted to `web boot: 1 entry did not activate / @qilin/client-ui-account: pending (waiting for service: settingsShell)` instead of an application. And the built-boot assertion still pinned the version chip's visible text to the full `version-commit-dirty` string, which the chip carries as its tooltip while showing the bare version.

## Decision

**Hero anchors are the product's own structure, not its copy.** [lifecycle-chrome.e2e.ts](../../../../apps/web/tests/lifecycle-chrome.e2e.ts) waits for the blank-draft phase through the conversation root's `div[data-phase="hero"]` and hovers the tagline by role; [goal-command-presentation.e2e.ts](../../../../apps/web/tests/goal-command-presentation.e2e.ts) and [details-session-lifecycle.e2e.ts](../../../../apps/web/tests/details-session-lifecycle.e2e.ts) read the same phase attribute; [startup-auto-selection.e2e.ts](../../../../apps/web/tests/startup-auto-selection.e2e.ts) compares the mark's ink to the hero's `level: 1` heading and hovers the `[class*="fishHitbox"]` mark. Copy stays locale-owned and out of the assertions.

**The hero golden tokenizes the greeting.** Both captures that include the blank-draft frame pass `HERO_GREETING_TOKENS`, which maps the locale's three greetings to `{{greeting}}`, so the golden no longer encodes the hour the lane ran in.

**The HMR scenario edits every dictionary occurrence of the wordmark and anchors on the wordmark itself.** `replaceAll` over `'hero.headline': 'QiLin'` moves both locales, and the waits filter `[class*="watermark"]` for the old and the new text, because the sidebar brand prints the same product name.

**Ambient credentials are the scaffold's to hold out.** [scaffold.ts](../../../../apps/web/tests/scaffold.ts) gains `absentCredentialReferences`, which deletes the named process-environment entries for the scaffold lifetime and restores them on teardown, alongside the existing skill-root pinning and DeepSeek key mask. The Models, recovery, and onboarding scenarios name `MINIMAX_CN_API_KEY`.

**The stale dialog goldens are refreshed, not hand-patched.** A refresh run rewrote exactly the seven missing navigation lines in each of the twelve goldens, which keeps them the render's own record.

**The settings panel is an optional neighbour of the account menu.** [ui-account](../../../../packages/client/ui-account/src/client/index.ts) no longer lists `settingsShell` among its injected services: the open call resolves through `ctx.get('settingsShell')`, and a scoped injection publishes the service's presence to a `useSettingsPanel` source that gates the Settings row. A composition without the panel mounts the menu and offers no Settings row, instead of leaving its entry pending forever.

**The HMR scenario runs against a deployment without the account gate.** [hmr-live.e2e.ts](../../../../apps/web/tests/hmr-live.e2e.ts) writes the harness home's own patch layer before booting the built CLI, turning `accounts` off the way the scaffold lane does for its scenarios. The scenario is about client-plugin reloading, and the shipped gate otherwise serves the first-run document instead of the application.

**The version-chip assertion reads the chip as it renders.** [built-boot.expected.e2e.ts](../../../../apps/web/tests/built-boot.expected.e2e.ts) matches the visible version text and pins the full build string as the chip's tooltip.

## Alternatives considered

**Update the assertion strings to the new copy.** The hero's copy is locale-owned and is the part most likely to change next; an assertion built on it would break again on the next wording pass and would mis-state what the scenario is about. The phase attribute and the heading role state the same intent in the product's own terms.

**Add a test-only attribute to the hero for the lane to anchor on.** The conversation root already publishes its phase, and the hero's heading is reachable by role; a lane-only hook would be a second, weaker declaration of the same fact.

**Tokenize the greeting inside `normalizeAria`.** The greetings are locale copy, not a scenario-owned path or a volatile timestamp; the scenario that captures the frame is the one that knows which text it is flattening, and the shared normalizer would have to carry every locale's wording.

**Keep the page-wide text anchor for the HMR edit.** The wordmark is one of two places the page prints the product name, so the locator would match the sidebar brand as well and fail on strict mode once the edit lands.

**Remove `.env`, or patch the credentials row inside the scenario.** Deleting the developer's file is not a test's business, and the process environment is the documented top layer of the credentials provider; masking the one reference states the scenario's premise — this provider has no key — where that premise belongs.

**Hand-insert the navigation rows into the twelve goldens.** A golden is the render's record; a hand edit would match this render by construction rather than by proof, and would hide any further drift in the same files.

**Keep the settings panel as a hard injection and mount a stub in the panel-less scenario.** That scenario's premise is that no settings traffic exists in the deployment; a stub service would make it assert a composition the product does not ship, and the pending entry it exposes is the real defect.

**Render the Settings row anyway and let the click do nothing without a panel.** A row that opens nothing misstates the deployment: the row is the panel's entry point, so it follows the panel.

**Sign in to the account gate inside the HMR scenario.** The scenario drives hot reloading, not the account journey, and the gate's own journey already has a scenario; a deployment-level patch states the premise without duplicating the sign-in flow.

## Consequences

The greeting token list is bound to the locale's wording: a copy change turns into a loud spec failure and is folded back into the same constant.

`absentCredentialReferences` is per scenario. A new scenario that asserts a keyless provider must name the reference itself; nothing masks ambient provider keys lane-wide.

The hero and plan-active goldens carry `- paragraph: {{greeting}}` and `- heading "<tagline>" [level=1]` where they carried the retired `Into the Unknown Preview` line, and the twelve dialog goldens carry the MCP servers and skills navigation rows.

A deployment that mounts no settings panel now boots with the account menu and without a Settings row; the boot page no longer reports an unactivated entry for that composition.

Not addressed: scenarios whose recorded turns run confined shell commands need a usable sandbox backend, and the product fails closed without one. On a host where nested `sandbox-exec` is refused, [turn-tail-actions.e2e.ts](../../../../apps/web/tests/turn-tail-actions.e2e.ts) records a `SANDBOX_UNAVAILABLE` tool result instead of running the command; the same spec passes unchanged under a host policy that permits the sandbox. [smoke-real.e2e.ts](../../../../apps/web/tests/smoke-real.e2e.ts) still expects the pre-landing ready-line URL and drives `/api` without an account session, and [preview-boot.e2e.ts](../../../../apps/web/tests/preview-boot.e2e.ts) fails inside the packed worker on `Unknown encoding: base64url` while applying the accounts entry; both belong to the accounts work rather than to expectations about the brand surfaces.

Coverage: the ten repaired scenario files pass in replay (48 tests), the refresh run rewrote the seven navigation lines in each stale golden, and the full browser lane is replayed before handoff.
