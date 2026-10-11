# Run one deployment for several people

English | [中文](tenancy.zh.md)

The browser-serving profiles — `qilin` and `qilin web` — serve one deployment at one address: visitors sign in there, and each account gets its own engine runtime under `$QILIN_HOME/tenants/<account id>/` — its own sessions, tasks, workspaces, attachments, plugins, model settings, credentials, skills, and presets. Only the account roster is shared. Every runtime keeps the account gate and admits only the account it serves.

## Create the accounts

The roster is `$QILIN_HOME/auth/accounts.json`, shared by the entry and every runtime. A tenant runtime closes registration and admits only the account it serves; the first-run runtime carries the deployment's own policy instead, so a deployment that accepts new accounts also grows through the product's registration form. These commands create an account without a browser, re-key one, and retire one.

```sh
qilin tenants accounts                                  # who is in this home
qilin tenants add alice                                 # prompts twice, without echoing
printf '%s\n' "$PASSWORD" | qilin tenants add bob --password-stdin
qilin tenants passwd alice                              # re-key; issued sessions stop verifying
qilin tenants remove alice [--purge-data]               # retire; keep Sessions unless purged
```

`--admin` creates the deployment's single administrator seat: uniqueness is checked inside the roster lock, so a second one is refused instead of silently added. That seat's runtime, and only that one, may read the whole deployment's token ledger; every other account reads its own.

## Start the deployment

```sh
qilin --port 8790
```

The entry prints its URL (loopback and port 8790 by default), starts an account's runtime when a request names it, and reclaims runtimes nobody is using. It draws no interface of its own: the landing page, the sign-in form, and registration belong to the application inside each runtime. `--idle-ms` sets that window, and `0` keeps every runtime alive. `--max-tenants` bounds how many runtimes live at once by reclaiming the least recently used one. `--restart-backoff-ms` sets the first wait before a runtime that failed to start is retried; the wait doubles per consecutive failure, and `/status` reports the failure count and the earliest retry. `--registration open|closed` decides whether the product's own form may create accounts: the default is `open` on a loopback address and `closed` on every other, so an address other machines reach creates an account only where the operator says so, with `qilin tenants add`. Every account's runtime also reports what that account's sessions spent to a ledger the deployment keeps for itself: the hub mints one token per runtime and listens for reports on a loopback-only address, so a report is booked to the account its token was minted for and never to whatever the body claims. The ledger is one JSON-lines file per account under `$QILIN_HOME/tenants/.usage/<account id>.jsonl`, written `0600` in a `0700` directory. The entry answers the account's own usage read from it, scoped by that runtime's credential, so a signed-in account can only ever read itself.

Two flags decide how the browser reaches each runtime. `--tls-cert` and `--tls-key` name an unencrypted PEM pair, must be given together, and make the entry terminate TLS — the only condition under which every runtime marks its session cookies `Secure`. `--tenant-host` instead exposes each account runtime directly on the named interface, which is what a reverse proxy in front of the entry needs; cookies stay unmarked because the entry itself is not the TLS endpoint. `--per-account-ports` gives every account its own origin and cookie jar, which is how one browser signs in as two accounts at once; without it the routing cookie is browser-wide and one browser drives one account at a time.

With `--max-tenants` above zero, two accounts arriving together can contend for the last slot: one handoff reclaims a runtime, and the request that loses may see `503`. That is the ceiling doing its job — keep `--max-tenants 0`, the default, when you would rather leave every runtime alive.

## Sign in at the address

`/` serves the product's own landing page whatever the roster holds: the deployment draws no account list and shows no account name. The sign-in and setup documents, and the account surface behind them (`/api/auth/*`), are the deployment's own doors: the first-run runtime answers them — the runtime that carries the deployment's registration policy — even for a browser that already chose an account, because a tenant runtime narrows admission to one account and the accounts plugin requires that narrowing to keep registration closed, so it can neither offer registration nor sign a browser in as anybody else. Every door answer drops the routing cookie, since a browser at a door is choosing its account again. `/t/<account>/` names one account directly and is the address to hand out when you want a specific account. The deployment never lists its accounts. After a sign-in, the routing cookie dispatches every later request — the application document, `/api`, the mux upgrade, and ranged media reads — to that account's own runtime, with the runtime's own authority in place of the entry's so its session cookie stays bound to the runtime that minted it.

A name the roster does not hold yet, and a routing cookie naming an account it no longer holds, both reach that same first-run runtime: the browser has arrived without an account, and the application decides what happens next — its registration form when the deployment accepts accounts, its own refusal when it does not.

One browser drives one account at a time; `/healthz` and `/status` stay the entry's own reads, and reclamation counts proxied traffic. Runtimes bind loopback unless `--tenant-host` names another interface, so by default the address a browser needs is the entry's alone. Naming a reachable interface exposes every account runtime on it directly — plain HTTP, each with its own cookie jar, with no entry in between — and that interface then needs the protection the entry address has.

## Where everything lives

| Path under `$QILIN_HOME` | What it holds |
|---|---|
| `auth/accounts.json` | The roster: identities, emails, scrypt hashes, and the administrator mark |
| `auth/session-secret.json` | The key every session of this deployment is signed with, `0600` inside a `0700` directory |
| `tenants/<account id>/` | That account's engine home: sessions, tasks, workspaces, attachments, plugins, model settings, credentials, skills, presets |
| `tenants/.usage/<account id>.jsonl` | That account's token ledger, one report per settled Turn |
| `tenants/.bootstrap/` | The first-run runtime's home, used while the roster is empty |

`/status` reports every runtime the entry knows: its account, state, origin, start count, consecutive failures, and earliest retry. `/healthz` answers liveness. A runtime's own log lines arrive on the entry's standard error prefixed `qilin tenants: [<account id>]`.

The account's usage page reads `GET /api/usage/me`, which the entry answers from the deployment's ledger with that runtime's credential, so a page can only ever read its own account; the administrator's seat reads every account's numbers there instead. Reading the ledger files directly stays available to the operator and needs no page.

**Replacing or clearing `auth/session-secret.json` invalidates every issued session at once**: the browsers sign in again and no account data changes. `qilin tenants passwd` re-keys one account the same way. Restarting the entry applies a new build to every account; nothing else needs restarting.

## Read the roster and retire an account

`qilin tenants remove` takes the account out of the roster and keeps its Sessions on disk; add `--purge-data` to remove that account's tenant directory as well, which deletes those Sessions. A runtime that is already serving keeps answering until it is reclaimed or the deployment restarts. A runtime started afterwards fails its load, because its overlay admits an account the file no longer holds — that is deliberate, and it is what makes a retirement visible instead of silent.

## What is shared and what is not

| State | Whose it is |
|---|---|
| Sessions, tasks, workspaces, attachments, plugins, model settings, credentials, skills, presets | The account that created them |
| The account roster (`$QILIN_HOME/auth/accounts.json`) | The deployment |
| The session-signing key (`$QILIN_HOME/auth/session-secret.json`) | The deployment — one session works across every runtime |
| The token ledger (`$QILIN_HOME/tenants/.usage/`) | The deployment, one file per account |

## Before you deploy

- **The filesystem is not a boundary.** Every runtime runs as the same operating system user, so an agent's shell and file tools can read another account's directories and the shared credentials file. Accounts on one deployment are cooperating parties.
- **Each account configures its own providers.** Model credentials live in the account's own home, so a key is per account; what each account spent is attributed by the deployment's ledger, which the operator reads in full and every account reads only for itself.
- **Installing plugins is per account.** Each runtime installs into its own home; there is no deployment-wide plugin set to lock.
- **Each account is a process.** Memory and ports grow with the number of runtimes that are alive at once, which is what the idle window and the concurrency ceiling are for.
- **One upgrade affects every account at once.** That is usually what you want, but it makes an upgrade a deployment-wide operation.

## Further reading

- [`qilin tenants` command reference](../../../apps/cli/README.md)
- [Tenancy plan and execution records](../../../plans/2026-10-11-multi-user-tenancy.md)
- [Multi-user tenancy boundary decision](../../../.agents/notes/implemented/architecture/2026-10-11-multi-user-tenancy.md)
