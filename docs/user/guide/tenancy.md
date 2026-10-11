# Run one deployment for several people

English | [中文](tenancy.zh.md)

`qilin tenants serve` runs one engine runtime per account over a single harness home. Sessions, tasks, workspaces, and attachments belong to the account that made them, while plugins, model settings, credentials, skills, and presets stay one deployment, so a second account needs no setup of its own. Every runtime keeps the account gate and admits only the account it serves.

## Create the accounts

The roster is `$QILIN_HOME/auth/accounts.json`, shared by every runtime. A tenant runtime closes registration, so its own Web surface cannot create a second account; these commands are how a deployment grows, re-keys, and retires one.

```sh
qilin tenants accounts                                  # who is in this home
qilin tenants add alice                                 # prompts twice, without echoing
printf '%s\n' "$PASSWORD" | qilin tenants add bob --password-stdin
qilin tenants passwd alice                              # re-key; issued sessions stop verifying
qilin tenants remove alice [--purge-data]               # retire; keep Sessions unless purged
```

## Start the hub

```sh
qilin tenants serve
```

The hub prints its URL (loopback and port 8790 by default), starts a runtime when someone opens that account's link, and reclaims runtimes nobody is using. `--idle-ms` sets that window, and `0` keeps every runtime alive. `--max-tenants` bounds how many runtimes live at once by reclaiming the least recently used one. `--restart-backoff-ms` sets the first wait before a runtime that failed to start is retried; the wait doubles per consecutive failure, and `/status` reports the failure count and the earliest retry.

## Hand a browser to an account

Open `<hub>/t/<username>`. By default the hub redirects the browser to that account's own runtime port: each account signs in once, and one browser can hold several accounts in different tabs.

`--single-origin` keeps the browser on the hub instead. The handoff sets a routing cookie, and every later request — the application document, `/api`, the mux upgrade, and ranged media reads — is forwarded to the account that cookie names, with the runtime's own authority in place of the hub's so its session cookie stays bound to the runtime that minted it. One browser drives one account at a time in that mode, `/healthz` and `/status` stay the hub's own reads, and reclamation then counts proxied traffic rather than a handoff.

## Read the roster and retire an account

`qilin tenants remove` takes the account out of the roster and keeps its Sessions on disk; add `--purge-data` to remove that account's tenant directory as well, which deletes those Sessions. A runtime that is already serving keeps answering until it is reclaimed or the hub restarts. A runtime started afterwards fails its load, because its overlay admits an account the file no longer holds — that is deliberate, and it is what makes a retirement visible instead of silent.

## What is shared and what is not

| State | Whose it is |
|---|---|
| Sessions, tasks, workspaces, attachments | The account that created them |
| Plugins, model settings, credentials, MCP servers, skills, presets | The deployment |

## Before you deploy

- **The filesystem is not a boundary.** Every runtime runs as the same operating system user, so an agent's shell and file tools can read another account's directories and the shared credentials file. Accounts on one deployment are cooperating parties.
- **One provider key serves everyone.** Nothing attributes usage per account yet, so quota and billing are not available.
- **Installing plugins is a shared write.** Several runtimes installing at the same time need a single writer or a lock.
- **Each account is a process.** Memory and ports grow with the number of runtimes that are alive at once, which is what the idle window and the concurrency ceiling are for.
- **One upgrade affects every account at once.** That is usually what you want, but it makes an upgrade a deployment-wide operation.

## Further reading

- [`qilin tenants` command reference](../../../apps/cli/README.md)
- [Tenancy plan and execution records](../../../plans/2026-10-11-multi-user-tenancy.md)
- [Multi-user tenancy boundary decision](../../../.agents/notes/implemented/architecture/2026-10-11-multi-user-tenancy.md)
