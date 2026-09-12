# Agent Note: QiLin local accounts and the public landing surface

Status: implemented

English | [中文](2026-09-12-qilin-local-accounts-and-landing.zh.md)

## Problem

The QiLin Web GUI had one document. The site root served the application, and the only browser credential was the process launch token in the URL the launcher printed: it minted an authority-bound cookie and every /api request needed it. A browser that typed the loopback address without that token received 401 text. There was no product front door, no way to reach the console from a link, and no account concept at all — anyone who could reach the port within a launch was the user.

The 2.0.x product generation had all three: a landing page at the site root, a sign-in page with an account toggle, a first-run page that initialized the administrator, and a session cookie behind every API call. This change restores that shape on the 3.0.0 architecture without adopting 2.0.x's multi-user server: accounts gate access to one harness home.

## Decision

**The application document moves to the transport entry path `/workspace`, and the site root becomes a public landing page.** `WEB_ENTRY_PATH` in `client-connection` is the one path the launch-token handoff targets, and `ctx.connection.entryPath` publishes it, so a dist server can seat its index there without a second copy of the literal.

**The pre-session surfaces are static documents, not client plugins.** `apps/web/landing.html` and `apps/web/auth.html` are Vite entries with their own plain-CSS and vanilla-TypeScript sources; they share the built asset pipeline, import no React, and depend on nothing the client plugin tree provides. `frontend-static` serves them through a new `documents` configuration: a public document is served as its own bytes, with the site-root `<base href="/">` anchor, and never runs index taps or the index gate. Its sibling `indexPaths` defaults to the transport's entry path plus `/index.html`, so the path a deployment hands a browser is always one the server answers.

**Accounts live in `@qilin/accounts-local`, a host plugin that owns the whole surface.** It reads `$QILIN_HOME/auth/accounts.json` (0600, atomically replaced) with scrypt password hashes, signs authority-bound HttpOnly cookies with an HMAC secret held by the credential provider, registers the `/api/auth` endpoints on Connection's Fetch registry, and — when enabled — installs the account-session gate. The plugin ships no service: nothing else reads an account.

**Connection owns the enforcement points; the authentication capability owns the verdicts.** `ctx.connection.session.install(authority)` seats one `ConnectionSessionAuthority`. An installed authority makes `requestRejection` require a session for every `/api` request except the ones the authority declares public, and makes `authorizeIndex` serve a gated index only for a verified session, redirecting an anonymous browser to the first-run document while no account exists and to `/login?next=<path>` afterwards. Without an authority the transport keeps its previous launch-token behavior, which is what `enabled: false` restores.

**The gate is server-side, in the operation that serves the resource.** An unauthenticated browser never receives the application document, so no client-side check can be bypassed by navigating directly, and the client needs no authentication state of its own.

**Registration defaults to open, with the caveat stated where an operator will read it.** The shipped deployment binds loopback and holds one user; the row's comment and the package README say that a deployment binding beyond loopback closes registration, because an account created there reaches the same Sessions, credentials, and files.

## Alternatives considered

**Render the sign-in screen as a client plugin and keep the site root as the application.** That requires a new occupant above `ui-layout`'s `AppFrame` (root has one occupant), which mounts the entire shell — and its RPCs — for a visitor who cannot use it, or an overlay that hides a shell already running. The pre-session pages would also inherit the client locale system and the theme presenter for copy that never changes.

**Import the sign-in paths into the composition instead of stating them per row.** `web-app` needs the two paths to build the document table while `accounts-local` needs them as redirect targets. Importing them across packages would add entries to `safeHostDependencyExports`, whose policy forbids automated additions; passing them through Cordis config would make the paths user-tunable. The composition states its document table and the gate owns its redirect targets, so the two facts meet only in a shipped deployment — where the e2e lane proves a redirected browser lands on a document the server serves.

**Require the launch token and an account session.** Both credentials are authority-bound cookies minted by the same server, and the account session is strictly stronger: requiring the token too would make a bookmarked `/workspace` fail until the launcher printed a fresh URL.

**Per-user tenancy.** Accounts would then need per-user harness homes, session roots, credentials, and files. This change keeps one home and states in the package README that accounts are an access gate, not a boundary.

**Server-side locale negotiation for the two static pages.** They carry Chinese copy, matching the 2.0.x pages they reproduce; the client locale system starts at the session, and these documents are served before one exists.

## Consequences

Sessions survive a process restart because the cookie is a signed token and the secret is durable; a password or email change bumps the account's credential generation, so every session issued before it stops verifying. Losing `auth/accounts.json` loses the accounts (the operator deletes it to start over), and losing the credential record rotates the signing secret, which invalidates every session without touching the accounts.

An open registration on a non-loopback bind is a full-access grant to anyone who can reach the port; the shipped row and the README state the closure, and the gate itself is the only thing standing between a browser and the harness.

The landing page and the sign-in page are unversioned product copy in Chinese outside the locale system, and the tab icon is the cinnabar seal drawn from the same outlines the in-app brand mark uses, so neither depends on a font being installed.

The PWA manifest now starts at `/workspace`, because installing the application should open the console rather than the marketing page.
