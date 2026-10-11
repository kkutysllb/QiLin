# Agent Note: Multi-user tenancy boundary

Status: implemented

English | [中文](2026-10-11-multi-user-tenancy.zh.md)

## Problem

The account surface shipped as an access gate, not a boundary: its own module documentation states that accounts "gate access to one harness home" and that "a second account reaches the same Sessions, credentials, and files as the first", and the package README tells operators that separate people need separate `QILIN_HOME` values and ports. The product now needs the opposite for part of that state and the same for the rest: **per-user Sessions and per-user tasks, with plugins, model settings, and credentials shared across everyone on one deployment.** Nothing in the current request path carries "who is asking". The Host/Origin fence and authentication decide whether a request may proceed at all, and every request that passes is admitted as the single operator Peer (`admit()` returns `{ peer: this.operator }`), so business services cannot distinguish two accounts even in principle.

## Decision

Make **one engine runtime the unit of tenancy**, and make the account's harness home the unit of isolation: each runtime runs with `QILIN_HOME` set to `$QILIN_HOME/tenants/<account id>/`, so every home-resolved root — `profiles/`, `settings.yaml`, `.credentials.yaml`, MCP rows, skills, presets, sessions, tasks, workspaces, and attachments — belongs to that account, while the account roster stays in the deployment home. A new supervisor process — the `qilin web` entry — owns the mapping from account to tenant and runs one engine child per account, generated with a home layer that names the shared roster and admits only that account. The full evidence inventory and the phasing live in [the tenancy plan](../../../../plans/2026-10-11-multi-user-tenancy.md); the shipped surfaces are `apps/cli/src/web-entry.ts` (the deployment entry), `tenants.ts` (the entry's own reads, the sign-in form, and the routing hop), `tenant-runtime.ts` (one child and its home), `tenants-roster.ts` (the account lifecycle commands), and `tenant-proxy.ts` (the forward), with `accounts-local`'s `admittedAccounts` as the admission list each runtime enforces.

### The roots that decide isolation

Four validated Config fields cover the state that must not be shared, because every isolatable store already resolves through one:

| Root | Default today | Per tenant |
|---|---|---|
| `session-persistence-jsonl.root` | `qilinHomePath('sessions')` | the tenant's session directory |
| `storage-json.root` | `qilinHomePath('storages')` | the tenant's storage root — one field carrying the `workspace`, `schedule`, and `session_projcache` domains |
| `session-query-sqlite.path` | `:memory:` with `openAt: never` | the tenant's derived index |
| `attachment-local.qilinHome` | the harness home | the tenant's attachment root |

The single `storage-json` root is what makes this tractable: workspace state (including the archived and pinned Session id lists), the Host-wide Schedule tasks, and the projection cache all open through `ctx.storageDomain`, so one row moves all three.

### What stays shared

The account roster (`$QILIN_HOME/auth/accounts.json`) is the only shared state. Every other root resolves inside the account's own harness home under `$QILIN_HOME/tenants/<account id>/` — model settings, credentials, installed plugins and their profiles, the plugin manager, MCP rows, skills, presets, sessions, tasks, workspaces, and attachments — so the isolation is the home itself, not an overlay over a shared tree. The deployment-wide roots this note first described stayed shared only while the runtime moved individual roots by overlay; that stage was replaced before the entry shipped.

### The supervisor

The deployment is one command, `qilin web`: the entry shows the sign-in form at its address, starts one runtime per account on demand, and forwards bytes. It decides no access. A sign-in submission is verified by the named account's own runtime — the entry forwards the credentials there, relays the session cookie it issues, and adds the routing cookie that dispatches every later request — because the application document, its `/api` channel, its mux upgrade, and its media requests are absolute paths on the page origin and only a cookie can attribute them to an account. Forwarding is transport work: the entry rewrites the authority-bearing headers (the tenant as `Host`, and an `Origin` it first checked names the entry), relays `Range`, `Set-Cookie`, and partial answers unchanged, and pipes the mux socket without framing it. The decision is made in the operation that acts on it: every child keeps the account gate over its own origin, restricted to the account admitted to that tenant, so a forged routing cookie reaches a runtime that does not recognize the caller. Runtimes bind loopback only, so the address a browser needs is the entry's alone, and one browser drives one account at a time. The entry needs no new engine RPC: the Web application already declares its startup URL line a supervisor contract — "supervisors RPC as soon as they observe the line" — and the starter already accepts `--profile` and `--patch` overlays, with `--patch` applied after the bundle layers and the tenant's home layer. The desktop shell performs the spawning half of the same shape (spawn a child, consume its `ready{url, injections}` message); its reverse proxy was the precedent for the routing this entry ships. The entry also bounds itself: `--max-tenants` reclaims the least recently used runtime before starting one past the bound, a runtime that fails to start is retried on a doubling wait rather than on every visit, and the roster commands (`qilin tenants accounts`, `add`, `passwd`, `remove`) are the operator surface over the shared account file, because a runtime admits one account and closes registration.

### Engine changes

None. Two candidates were resolved against the code rather than implemented. The DeepSeek upload index keys every record by `sha256(baseURL + credentials)`, so its namespace is the provider credential — shared by design in this deployment — and a per-tenant path would only re-upload the same attachment. `RemoteHostFacts.home` is consumed solely to shorten reference paths to the machine that holds the files, which is one machine for every tenant; tenant identity is the account surface's answer, and each runtime serves exactly one account. The engine changes this proposal first assumed are therefore zero: the feature is the supervisor, its account admission list, and the overlay generator.

## Alternatives considered

**Single-process tenant planes.** Give each account a Peer, resolve services from the peer's context, and mount the session, storage, query, projection, jobs, workspace, Schedule, attachment, and terminal services under a per-tenant `ctx.isolate` label, leaving only the shared services at the root. This is the architecture that would make "one engine, many tenants" true, and it is rejected for the first phase rather than in principle: it requires a per-request service plane, moving the Typert lookups and host contexts into each tenant plane, per-peer event fan-out, globally unique Session ids (the store's `session-<n>` counter would collide across planes), and every background actor — Schedule triggers, webhooks, goal rounds, subagents — to carry its tenant explicitly. Each missed site is a silent cross-tenant leak, so the cost buys the same isolation with a much larger surface.

**An `owner` field on the session header with ownership checks at each endpoint.** This changes an immutable storage metadata field and therefore the Session format version and its release-time migration rules, then requires checks on every reachable entry point: twenty-odd Remotes plus Schedule, webhook, and subagent paths. It yields the weakest isolation of the three (one process, one cache, one event fan-out) at the largest change surface.

**Keep accounts as an access gate and require one harness home per person, configured by hand.** This is what the accounts Agent Note documents as the current deployment rule. It gives isolation but loses the shared half of the requirement — every person would install the same plugins and configure the same models again — and it leaves account-to-home mapping as operator folklore rather than a product surface.

**One OS user or container per tenant.** Not rejected; sequenced. It is the layer that would make tenants mutually untrusted, and it composes on top of a per-tenant runtime. This decision does not attempt it, and the boundary it defines is cooperation, not distrust.

## Testing

Two owner-local process tests over built runtimes pin the boundary, and one stub-upstream spec pins the transport facts.

[tenant-isolation.expected.e2e.ts](../../../../apps/cli/tests/profiles/web/tests/tenant-isolation.expected.e2e.ts) runs one shared home, two tenant overlays, and two runtimes: neither lists the other's Sessions, a Schedule task lands with the tenant that created it, workspace state stays per tenant, the shared settings and plugins answer for both, neither client receives the other's forwarded events, and a request naming the other tenant's Session id is refused.

[tenant-supervisor.expected.e2e.ts](../../../../apps/cli/tests/profiles/web/tests/tenant-supervisor.expected.e2e.ts) runs the deployment: an idle runtime is reclaimed and its data survives a second sign-in, `--max-tenants` reclaims the least recently used runtime, a runtime that cannot boot reports a failure with a retry time and is not respawned inside that wait, a zero idle window reclaims nothing, and — across the one address — the sign-in form and its refusal of a wrong password, the signed-in document with its assets, the foreign-`Origin` refusal, a Remote call, the mux upgrade, a ranged read of the real media route, traffic-based reclamation, and the root selection all cross the entry.

[tenant-proxy.spec.ts](../../../../apps/cli/tests/tenant-proxy.spec.ts) covers the hop against a stub upstream: Range and partial answers, the authority rewrite and connection-scoped header removal, the Origin fence before any upstream request, cookies and redirects, and the upgraded pipe.

## Consequences

**Bought:** Sessions, tasks, workspaces, and attachments stay with one account, while plugins, model settings, credentials, MCP rows, skills, and presets stay one deployment, so a second account needs no reconfiguration.

**The filesystem is not a boundary.** Every tenant runs as the same OS user, so an agent's shell and file tools can read another tenant's directories and the shared credentials document. This decision makes tenants cooperating parties on one machine; a deployment that must resist a hostile tenant needs the per-tenant OS isolation named above, which is out of scope here.

**Single-origin mode serves one tenant per browser.** The routing cookie names one tenant for a whole browser, so opening a second account's handoff switches the first tab's tenant too; the default redirect mode is what a browser holds several of at once. The cookie is a selector, not a credential: a forged value reaches a runtime that does not recognize the caller.

**Isolation depends on a generated overlay, and a missing row fails silently.** Forgetting one row shares a root without an error, so the per-tenant patch is asserted at boot (distinct resolved roots per tenant) and covered by the isolation test.

**Shared model credentials mean shared spend.** One provider key serves every tenant, and nothing attributes usage per account; the telemetry path carries an anonymous installation id. Quota or billing per tenant is a separate seam and stays deferred.

**The shared plugin profile is a shared write target.** Several runtimes installing plugins at once need a single-writer rule or a lock plus a change broadcast.

**Cost grows linearly with tenants.** Each tenant is one Node runtime with its own memory and port, which is why idle reclamation and the concurrency ceiling are part of the supervisor rather than an optimization.

**One upgrade affects every tenant at once.** That is usually the point, but it makes the upgrade runbook a deployment-wide action.
