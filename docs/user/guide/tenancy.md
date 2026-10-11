# Run one deployment for several people

English | [中文](tenancy.zh.md)

`qilin web` serves one deployment at one address: visitors sign in there, and each account gets its own engine runtime under `$QILIN_HOME/tenants/<account id>/` — its own sessions, tasks, workspaces, attachments, plugins, model settings, credentials, skills, and presets. Only the account roster is shared. Every runtime keeps the account gate and admits only the account it serves.

## Create the accounts

The roster is `$QILIN_HOME/auth/accounts.json`, shared by the entry and every runtime. A runtime closes registration, so its own Web surface cannot create a second account; these commands are how a deployment grows, re-keys, and retires one.

```sh
qilin tenants accounts                                  # who is in this home
qilin tenants add alice                                 # prompts twice, without echoing
printf '%s\n' "$PASSWORD" | qilin tenants add bob --password-stdin
qilin tenants passwd alice                              # re-key; issued sessions stop verifying
qilin tenants remove alice [--purge-data]               # retire; keep Sessions unless purged
```

## Start the deployment

```sh
qilin web --port 8790
```

The entry prints its URL (loopback and port 8790 by default), shows the sign-in form there, starts an account's runtime when that account signs in, and reclaims runtimes nobody is using. `--idle-ms` sets that window, and `0` keeps every runtime alive. `--max-tenants` bounds how many runtimes live at once by reclaiming the least recently used one. `--restart-backoff-ms` sets the first wait before a runtime that failed to start is retried; the wait doubles per consecutive failure, and `/status` reports the failure count and the earliest retry.

## Sign in at the address

`/` is the sign-in form while the visitor has no account selected, and it never lists the deployment's accounts. A submission is verified by the named account's own runtime: the entry forwards the credentials there, relays the session cookie it issues, and adds the routing cookie that dispatches every later request — the application document, `/api`, the mux upgrade, and ranged media reads — to that runtime, with the runtime's own authority in place of the entry's so its session cookie stays bound to the runtime that minted it.

One browser drives one account at a time; `/healthz` and `/status` stay the entry's own reads, and reclamation counts proxied traffic. Runtimes bind loopback only, so the address a browser needs is the entry's alone.

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
