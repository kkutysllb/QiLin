---
description: "Local browser accounts for the Web surface: one account file under the harness home, scrypt password hashes, signed HttpOnly session cookies, the /api/auth endpoints, and the account-session gate over the application document and every other /api request."
kind: "package-reference"
---

# @qilin/accounts-local

English | [中文](README.zh.md)

## Summary

Mount this package in a Web deployment to require a sign-in before a browser reaches the harness. The first visitor initializes the administrator account; afterwards every browser signs in with a username or the account's email address. The account-session gate serves the application document and answers `/api` only to a session this deployment minted, and sends a browser without one to the public landing page. Accounts gate one harness home, so a second account reaches the same Sessions, credentials, and files. Registration is open by default, and a deployment bound beyond loopback closes it.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Compose this plugin beside [`qilin-client-connection`](../../client/connection/README.md) and a dist server, and the Web surface asks for an account before it hands out the application. It injects the `connection` and `credentials` services.

### Minimal configuration

```yaml
- name: '@qilin/accounts-local'
  config:
    registration: closed
```

| Field | Default | Meaning |
|---|---|---|
| `enabled` | `true` | Require an account session for the gated index paths and every non-public `/api` request |
| `registration` | `'open'` | Whether an anonymous visitor may create an additional account |
| `sessionMaxAgeDays` | `7` | Absolute browser-session lifetime in days |
| `qilinHome` | `$QILIN_HOME`, then `~/.qilin` | Harness home holding `auth/accounts.json` |

The generated [configuration catalog](../../../docs/config-catalog.md#qilinaccounts-local) is the exhaustive source for every accepted field and its JSDoc.

### The sign-in flow

An anonymous browser that asks for a gated index path is redirected to the public landing page with `?next=<request path>`, never to a credential form. The landing page reads `GET /api/auth/status` and points its entry calls to action at the document this deployment can serve: the first-run document while the account file holds no account, otherwise the sign-in document, either way carrying the requested path. That document renders the form and posts the credentials; the successful answer already carries the session cookie, so the browser then navigates to the validated `next` destination or to the application entry path. Because the gate lives in the operation that serves the document, no client-side check can be bypassed by navigating directly, and signing out returns the browser to the landing page.

### The endpoints

Every endpoint answers JSON with `cache-control: no-store`, and every refusal is `{ "error": { "code", "message" } }`.

| Endpoint | Answers |
|---|---|
| `GET /api/auth/status` | 200 `{ enabled, needsSetup, registrationOpen, authenticated, user }`; `user` is `{ id, username, email, createdAt }` or `null`, with `email` null for an account that registered without one |
| `POST /api/auth/setup` | 200 `{ user }` plus the session cookie; 409 `already-initialized` once an account exists |
| `POST /api/auth/register` | 200 `{ user }` plus the session cookie; 403 `registration-closed`; 409 `username-taken` or `email-taken` |
| `POST /api/auth/login` | 200 `{ user }` plus the session cookie; 401 `invalid-credentials` for an unknown identifier or a wrong password |
| `POST /api/auth/logout` | 204 with this authority's cookie cleared |
| `POST /api/auth/change-password` | 200 `{ user }` plus a fresh session cookie; 401 `unauthorized` without a session or `invalid-credentials` for a wrong current password; 409 `username-taken` or `email-taken` |

`setup` and `register` read `{ username, email?, password }`; `login` reads `{ identifier, password }` and accepts either the username or the account's address; `change-password` reads `{ currentPassword, newPassword, username?, email? }` and changes each identity field it names, with an empty address clearing the stored one. Usernames are 3 to 32 characters of letters, digits, dot, dash, or underscore starting with a letter or digit, trimmed and lowercased before storage and lookup so one account cannot be spelled two ways; addresses are trimmed and lowercased the same way, and passwords are at least 8 characters. A body that is not a JSON object, a missing credential field, a name or address of the wrong form, and a request that names no authority are refused with 400 `invalid-body`, `invalid-username`, `invalid-email`, `password-too-short`, or `invalid-authority`.

### The account-session gate

The plugin installs one `ConnectionSessionAuthority` at `ctx.connection.session` while `enabled` is true, and Connection owns both enforcement points. Index requests go through the authority's `authorizeIndex`: a verified session serves the document, and every other request is answered with the 302 above. On the shared `/api` route, `isPublicApiRequest` exempts the `/api/auth/` prefix so a browser can sign in, and `verify` requires an account session for everything else — a request without one receives 401 after the connection package's Host and Origin checks pass. `enabled: false` leaves all six endpoints mounted, reports `enabled: false` in the status read, and leaves the launch-token cookie in charge of the index paths and the `/api` route.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

This section explains what the plugin owns and points at the files that realize it; the observable behavior is covered in [Use this package](#use-this-package).

### Design concept

The package is one function plugin. `apply` opens the account file of the resolved harness home, loads or creates the deployment's session-signing secret through `ctx.credentials` under the key `accounts-local/session-secret`, builds the cookie owner, registers the six routes on `ctx.connection.fetch`, and — while the gate is enabled — installs the session authority on `ctx.connection.session`, whose seat accepts one owner and fails the installer's load on a second. It provides no Kylin service: nothing else reads an account, and the composition reaches this surface through the endpoints and the gate.

### The account file

`$QILIN_HOME/auth/accounts.json` is a versioned document holding one record per account: an opaque id, the normalized address, the encoded scrypt hash, the creation time, and a credential generation. Every mutation writes the complete successor through `@qilin/atomic-write` with mode 0600, then publishes it in memory, so a failed write leaves the running server on the previous account set. An absent file is the empty account set — the state the first sign-up initializes — while a file this build did not write fails the load instead of being migrated.

### Passwords and sessions

A stored hash is self-describing (`scrypt$N$r$p$salt$key`) with per-account salt, cost 2^15, block size 8, parallelism 1, and a 32-byte key; verification re-derives under the stored parameters and compares in constant time. A session cookie is HMAC-SHA256 signed, named after the request authority it was issued for, and carries that authority, the account id, the credential generation, and an absolute issue/expiry interval no longer than `sessionMaxAgeDays`. It is host-only, `Path=/`, `HttpOnly`, and `SameSite=Strict`. A password or address change bumps the account's credential generation, so every cookie minted before it stops naming an account even though its signature still verifies.

### Source map

| File | Role |
|---|---|
| [`src/index.ts`](src/index.ts) | `Config`, account-file and session-secret loading, route registration, gate installation |
| [`src/routes.ts`](src/routes.ts) | The six `/api/auth` endpoints, input validation, and the error envelope |
| [`src/gate.ts`](src/gate.ts) | The authority's verdicts: index redirect, public API prefix, session verification |
| [`src/accounts.ts`](src/accounts.ts) | Durable account file: parsing, atomic replacement, credential-generation updates |
| [`src/password.ts`](src/password.ts) | scrypt hashing and constant-time verification |
| [`src/session.ts`](src/session.ts) | Signed session cookies: issuance, clearing, authority binding, lifetime |
| [`src/paths.ts`](src/paths.ts) | `AUTH_API_PREFIX`, `LOGIN_PATH`, and `SETUP_PATH` |
| [`src/validation.ts`](src/validation.ts) | Email normalization and the minimum password length |
| — | No runtime invariant companion is published; the package owns one account file and one session seat, and the real-composition spec boots the whole tree through the Loader and observes the served HTTP surface instead. |
| [`tests/auth-surface.spec.ts`](tests/auth-surface.spec.ts) | Real composition: public documents, gated entry, endpoints, `/api` gate, launch-token handoff |
| [`tests/accounts.spec.ts`](tests/accounts.spec.ts) | Account-file parsing, mutation, and the state a failed write leaves behind |
| [`tests/password.spec.ts`](tests/password.spec.ts) | Hash encoding, verification, and refusals of foreign stored values |
| [`tests/session.spec.ts`](tests/session.spec.ts) | Cookie attributes, signatures, authority binding, and lifetime |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

Read these when the package-level contract is not enough: the transport that owns the gates, then the composition that mounts this row.

- [qilin-client-connection](../../client/connection/README.md) — the session seat, the entry path, and the `/api` request policy.
- [frontend-static](../../host/frontend-static/README.md) — the dist server that serves the application document and the public documents.
- [qilin-web-app](../../bundle/web-app/README.md) — the shipped composition that mounts this row and states its document table.
- [qilin-credentials](../../credentials/credentials/README.md) — the provider holding the session-signing secret.
- [qilin-home-paths](../../util/home-paths/README.md) — `$QILIN_HOME` and `~/.qilin` resolution.
- [Local accounts decision](../../../.agents/notes/implemented/feature/2026-09-12-qilin-local-accounts-and-landing.md) — why the gate is server-side and why registration defaults to open.
- [Generated configuration catalog](../../../docs/config-catalog.md#qilinaccounts-local) — every accepted config field and its source declaration.

-----

<a id="model-experience"></a>
## Model Experience

None, as accounts gate the browser surface and this package registers nothing model-facing.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>


These limits describe what an account does and does not protect. They are current package constraints, not a task backlog.

- **The account set belongs to one harness home** — every account reaches the same Sessions, credentials, and files as the first one, so a second account is another key to the same harness rather than a separate tenant; separate people need separate `QILIN_HOME` values and ports.
- **Registration is open by default** — anyone who can reach the port while the account set has room can create an account with full harness access; a deployment that binds beyond loopback sets `registration: closed`. The shipped `qilin web` command binds loopback and rejects `--host 0.0.0.0`.
- **Sign-in has no throttling or lockout** — the endpoints answer as fast as the scrypt comparison allows, and that cost is the only brake on repeated guesses.
- **No account removal or password reset** — no endpoint deletes an account or recovers a forgotten password; an operator edits or deletes `$QILIN_HOME/auth/accounts.json`, and deleting it returns the deployment to the first-run state.
- **The session cookie is a bearer credential over plaintext HTTP** — like the transport's own cookie it carries no `Secure` attribute, because the shipped server serves loopback HTTP.
- **Losing or replacing the session secret ends every session** — the credential record `accounts-local/session-secret` is the only signing key; replacing it invalidates every issued cookie while the accounts survive.
- **The account file migrates forward only** — a version 1 document is read as accounts whose username is their stored address, but a document from a newer build fails the plugin load, and nothing rewrites a version 1 file until the next mutation. A migrated name that looks like an address cannot be replaced by a valid username without an operator edit.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>

**Runtime invariant:** No companion is published. The plugin owns one account file and one session seat, and its writes are the only reads of the state they publish; the real-composition spec boots the account surface through the Loader and observes the served HTTP surface instead of probing an internal relation.
