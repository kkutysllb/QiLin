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

## Start the deployment

```sh
qilin --port 8790
```

The entry prints its URL (loopback and port 8790 by default), starts an account's runtime when a request names it, and reclaims runtimes nobody is using. It draws no interface of its own: the landing page, the sign-in form, and registration belong to the application inside each runtime. `--idle-ms` sets that window, and `0` keeps every runtime alive. `--max-tenants` bounds how many runtimes live at once by reclaiming the least recently used one. `--restart-backoff-ms` sets the first wait before a runtime that failed to start is retried; the wait doubles per consecutive failure, and `/status` reports the failure count and the earliest retry. `--registration open|closed` decides whether the product's own form may create accounts: the default is `open` on a loopback address and `closed` on every other, so an address other machines reach creates an account only where the operator says so, with `qilin tenants add`. Every account's runtime also reports what that account's sessions spent to a ledger the deployment keeps for itself: the hub mints one token per runtime and listens for reports on a loopback-only address, so a report is booked to the account its token was minted for and never to whatever the body claims. The ledger is one JSON-lines file per account under `$QILIN_HOME/tenants/.usage/<account id>.jsonl`, written `0600` in a `0700` directory, and the hub keeps no read endpoint for it: the operator reads the files, and `--no-open`-less deployments expose no usage surface to the address a browser reaches.

## Sign in at the address

`/` redirects to the first account's path once the roster has one, `/t/<account>/` serves that account's own runtime, and a deployment with no accounts yet hands every path to a first-run runtime whose layer creates the first account through the product's own form. The deployment never lists its accounts. A sign-in submission is verified by the named account's own runtime: its paths go there, the session cookie it issues comes back, and a routing cookie dispatches every later request — the application document, `/api`, the mux upgrade, and ranged media reads — to that runtime, with the runtime's own authority in place of the entry's so its session cookie stays bound to the runtime that minted it.

A name the roster does not hold yet, and a routing cookie naming an account it no longer holds, both reach that same first-run runtime: the browser has arrived without an account, and the application decides what happens next — its registration form when the deployment accepts accounts, its own refusal when it does not.

One browser drives one account at a time; `/healthz` and `/status` stay the entry's own reads, and reclamation counts proxied traffic. Runtimes bind loopback unless `--tenant-host` names another interface, so by default the address a browser needs is the entry's alone. Naming a reachable interface exposes every account runtime on it directly — plain HTTP, each with its own cookie jar, with no entry in between — and that interface then needs the protection the entry address has.

## Read the roster and retire an account

`qilin tenants remove` takes the account out of the roster and keeps its Sessions on disk; add `--purge-data` to remove that account's tenant directory as well, which deletes those Sessions. A runtime that is already serving keeps answering until it is reclaimed or the deployment restarts. A runtime started afterwards fails its load, because its overlay admits an account the file no longer holds — that is deliberate, and it is what makes a retirement visible instead of silent.

## What is shared and what is not

| State | Whose it is |
|---|---|
| Sessions, tasks, workspaces, attachments, plugins, model settings, credentials, skills, presets | The account that created them |
| The account roster (`$QILIN_HOME/auth/accounts.json`) | The deployment |

## Before you deploy

- **The filesystem is not a boundary.** Every runtime runs as the same operating system user, so an agent's shell and file tools can read another account's directories and the shared credentials file. Accounts on one deployment are cooperating parties.
- **Each account configures its own providers.** Model credentials live in the account's own home, so a key is per account, and nothing attributes usage beyond that.
- **Installing plugins is per account.** Each runtime installs into its own home; there is no deployment-wide plugin set to lock.
- **Each account is a process.** Memory and ports grow with the number of runtimes that are alive at once, which is what the idle window and the concurrency ceiling are for.
- **One upgrade affects every account at once.** That is usually what you want, but it makes an upgrade a deployment-wide operation.

## Further reading

- [`qilin tenants` command reference](../../../apps/cli/README.md)
- [Tenancy plan and execution records](../../../plans/2026-10-11-multi-user-tenancy.md)
- [Multi-user tenancy boundary decision](../../../.agents/notes/implemented/architecture/2026-10-11-multi-user-tenancy.md)
