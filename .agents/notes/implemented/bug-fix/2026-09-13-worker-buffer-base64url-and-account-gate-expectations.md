# Agent Note: The worker Buffer's base64url spelling and the account surface's gate

Status: implemented

English | [中文](2026-09-13-worker-buffer-base64url-and-account-gate-expectations.zh.md)

## Problem

The browser-only worker deployment boots the shipped `web` profile out of the packed image, and that profile includes `@qilin/accounts-local` ([local accounts and the landing surface](../feature/2026-09-12-qilin-local-accounts-and-landing.md)). The plugin stores its session signing secret and keys every session cookie with Node's `base64url` encoding — `randomBytes(...).toString('base64url')`, `Buffer.from(value, 'base64url')`, `createHash(...).digest('base64url')` — and `@qilin/context-session-reference` builds a Session reference URI the same way. The worker's `node:buffer` shim is the npm `buffer` package (feross 6), which implements `base64` alone, so activation threw `Unknown encoding: base64url` and the tunnel refused the whole boot: `web-preview tunnel: boot payload failed with HTTP 503: qilin-webworker: plugin tree failed to load: failed to apply loader entry accounts (@qilin/accounts-local)`. The acceptance run ([preview-boot.e2e.ts](../../../../apps/web/tests/preview-boot.e2e.ts)) then waited its full 240-second milestone for a tree that never activated.

The account gate is on by default, and three expectations predate it. The real-host smoke asserted the printed URL as `http://127.0.0.1:<port>/?token=…`, while the launcher prints the entry path its transport owns — `authenticatedUrl` names `WEB_ENTRY_PATH`, and the site root now serves the landing page. The same scenario's Node-side probes carried only the device cookie the launch-token exchange mints, which the gate refuses on every non-auth `/api` route: three tests failed with `session/create failed over HTTP 401: unauthorized`. The assembled CLI snapshot of the same handoff ([web-browser-open.expected.e2e.ts](../../../../apps/cli/tests/web-browser-open.expected.e2e.ts)) pinned the root-path URL in three inline snapshots, and its opener fixture — a stand-in for the default browser — also presented only the device cookie, so the document it recorded became the first-run one and its `bootManifest: true` evidence read false.

Two scenario steps had outlived the surfaces they named. The preview scenario clicked a `Continue` button on a pre-release version notice that [the settings rewrite](2026-09-13-qilin-brand-surfaces-and-settings-entry-point.md) removed; the locator still resolved, because it matched `Save and continue` inside the provider onboarding dialog by substring, and that button is disabled while the key field is empty. And the bundle's browser-open fixture stubbed the connection with a root-path URL and no `entryPath`, so the canonical URL it opened fell through to the public document table and answered 404.

## Decision

**Node's `base64url` is the worker Buffer's to provide.** [base64url.ts](../../../../packages/experimental/webworker-runtime/src/polyfill/buffer/base64url.ts) restates one alphabet in the other around the package's own `base64` codec and patches the string boundary Node defines: `from`, `prototype.toString`, `prototype.write`, `byteLength`, and `isEncoding`. `fill` and `alloc` follow through `from`, which is why the boundary is patched rather than the individual codecs. [buffer.ts](../../../../packages/experimental/webworker-runtime/src/node/builtin_modules/implemented/buffer.ts) applies it before installing the global, and the `node:crypto` shim's `digest` accepts the spelling. [buffer-base64url.spec.ts](../../../../packages/experimental/webworker-runtime/tests/node/buffer-base64url.spec.ts) is a differential check: it patches Node's Buffer, compares every corpus array's encode, decode, byte count, and write against Node's own encoding, and restores the natives afterwards. The packed-worker acceptance run is what proves the same restating over the package the browser bundles, and it now boots both preview halves.

**The smoke raises the account the way the deployment expects.** [smoke-real.e2e.ts](../../../../apps/web/tests/smoke-real.e2e.ts) asserts the printed URL against `WEB_ENTRY_PATH` and one `authenticatedWeb` helper does both halves of the handoff: exchange the printed token, then initialize the first account through `/api/auth/setup` and keep the session cookie it returns. The Node probes send that cookie, and the browser context adopts it before opening the printed URL, so the page reaches the application document instead of the first-run screen. The real-key block prepares its page the same way.

**The CLI handoff fixture raises the account its deployment lacks.** [open.mjs](../../../../apps/cli/tests/fixtures/web-browser-open/open.mjs) initializes the first account through the shipped endpoint with the device cookie, then asks for the entry path with the session it raised — the journey a browser makes against a first-run deployment. Its recorded `bootManifest: true` therefore still means the application document was reached, and the inline snapshots carry the entry path.

**The device-cookie scenario runs with the gate off.** [web-auth.e2e.ts](../../../../apps/cli/tests/web-auth.e2e.ts) covers the transport's own token-and-device-cookie authentication, which is the mode a deployment serves with `accounts: enabled false`; a fresh home enables the gate, so the scenario writes that row into the harness home's patch layer, as the scaffold lane does for its scenarios, and names the entry path in its two URL expectations.

**The worker deployment's account door renders signed out, and that is recorded rather than rerouted.** The page half reads `/api/auth/status` from its own origin, where a static host answers 404; the client treats an unreachable gate as no account surface. Routing that read through the tunnel would answer `enabled: true, authenticated: false` from a tree that holds no browser session, and the menu would then offer a sign-out row leading to a `/login` document this deployment does not serve. The reason is now the third accepted static-host miss in the preview expectation and a limitation of the worker package.

**The bundle fixture mirrors the connection the app reads.** [browser-open.spec.ts](../../../../packages/bundle/web-app/tests/browser-open.spec.ts) gives its stub `entryPath` and builds the printed URL from `WEB_ENTRY_PATH`, so the served index is the document the entry path names.

## Alternatives considered

**Drop `base64url` from the packages that use it.** Rejected: the shim's job is Node parity, and every dependency that mints URL-safe base64 would hit the same wall. The failure it produces is a late `TypeError` from inside a credentials lock, which surfaced as a 503 boot payload and a 240-second timeout rather than as an encoding gap.

**Route the page half's `/api/auth` reads through the tunnel transport.** Rejected as above: the worker deployment has no session cookie, no `/login` or `/setup` document, and a handler that never consults the installed authority, so the routed answer would offer rows that cannot work.

**Walk the first-run document in the smoke's browser half.** Rejected: `accounts-auth.e2e.ts` owns the landing, setup, sign-in, and gate journey, and those static documents carry their own locale, which would couple the smoke's English page to copy it does not own.

**Disable the accounts row in the worker composition.** Rejected: the deployment boots the shipped `web` profile verbatim on purpose, and its boot patches cover only what a browser cannot do. The plugin's gate is inert on the tunnel path, so leaving it mounted costs one startup write and keeps the image an honest copy of the profile.

## Consequences

The worker deployment boots, and its acceptance run covers the whole seeded preview: sessions, skills, settings, credentials, subagents, and history paging. `Buffer.isEncoding('base64url')` answers true for image packages that branch on the encoding table, and `Buffer.byteLength`, `write`, and `fill` accept it where the package previously answered a UTF-8 length or threw.

The account surface stays a server-deployment feature: the worker deployment's account door is signed out by design, and `/login`, `/setup`, and the `/api/auth` routes remain unreachable from its page origin. A future deployment that serves the worker behind a host which does serve those documents would have to revisit this decision.

The assembled browser-open snapshot keeps its `bootManifest: true` evidence: the fixture now reaches the application document rather than the first-run one.

The smoke's four keyless tests run in the lane; the real-key block prepares the same session but self-skips without `DEEPSEEK_API_KEY`, so its assertions remain unverified here.
