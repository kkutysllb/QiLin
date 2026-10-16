---
description: "Local usage ledger for single-user surfaces: derives /api/usage/me from this runtime's own session logs with the token-meter derivation"
kind: "package-reference"
---

# @qilin-agent/usage-local

English | [中文](README.zh.md)

## Summary

A single-user surface — the desktop, a hand-started web runtime — has no deployment ledger to read usage from. This plugin is that surface's local ledger: it registers `GET /api/usage/me` on the shared API channel and derives the answer from the session logs the runtime owns, folding every Turn with the token-meter derivation. A deployment that keeps a ledger of its own reports usage through the external ledger and does not mount this row.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)

-----

<a id="use-this-package"></a>
## Use this package

Mount the row in compositions whose surfaces read usage locally — the shipped Web/desktop bundle does. A deployment whose runtime reports to a supervisor ledger leaves the row out.

### Composition

```yaml
- name: '@qilin-agent/session'
- name: '@qilin-agent/session-query-sqlite'
- name: '@qilin-agent/usage-local'
```

The row declares no configuration. It reads the account-session gate like any other `/api` caller, so an unauthenticated request is refused before it reaches the derivation.

### Reading it

`GET /api/usage/me?from=<epoch ms>&to=<epoch ms>` answers `accountId`, the whole-ledger `total` (every provable Turn, not just the window), the window's `records` in end-time order, and `truncated: false` — complete logs are read, so an answer is never truncated. A malformed window answers `400` with `{ "error": { "code": "invalid-window" } }`.

## Understand the implementation

The handler lists the corpus through the session-query service and reads each session's complete raw log, folding `turn/start` through `turn/end` with `deriveTurnTokenUsage`. A Turn whose attempt lifecycle cannot prove its usage yields no record rather than an estimate — the same rule the report side follows. The Turn-end event's own timestamp is the record's `at`.

## Further Exploration

- [Token meter](../../llm/token-meter/README.md) owns the derivation this ledger folds with.
- [Usage report](../usage-report/README.md) is the deployment half: reporting Turns to a supervisor ledger.
- [Session query](../../session-query/session-query/README.md) owns the corpus read this ledger derives from.

## Model Experience

None, as this row only derives an HTTP read from local session logs, adding no prompt, tool schema, or model-visible output.

#### KV Cache effect

The read never touches a Session's log or context, so every Session's cache footprint is unchanged.

## Known Limitations and Deferred Work

- **The ledger is per runtime.** Only Turns whose complete durable logs live in this runtime's home are counted; cross-runtime accounting belongs to a deployment's external ledger, which this row deliberately does not implement.
- **Unprovable Turns are absent.** A Turn whose attempt lifecycle cannot prove its usage is skipped, never estimated, so the page can undercount crashed Turns.
- **A windowed read scans complete logs.** There is no incremental index; the read costs one full-log pass per session and is meant for single-user history sizes.
