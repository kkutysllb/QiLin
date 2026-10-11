---
description: "Reports each settled Turn's exact token usage to the deployment supervisor that started the runtime, for the per-account ledger a multi-account deployment keeps."
kind: "package-reference"
---

# @qilin-agent/usage-report

English | [中文](README.zh.md)

## Summary

A deployment that serves one web entry gives every account a runtime of its own and needs to know what each one spent. This plugin is the runtime's half of that accounting: it follows the session event stream, folds one Turn's durable attempts into exact usage — the same derivation the transcript shows, which refuses to guess — and posts the result to the endpoint its supervisor named. A runtime no supervisor started carries no endpoint, and the plugin then does nothing at all.

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

Mount the row once per runtime. It declares no configuration: the deployment supplies two environment variables, and their absence is the only switch.

| Variable | Meaning |
|---|---|
| `QILIN_USAGE_URL` | Endpoint that accepts one JSON report per settled Turn |
| `QILIN_USAGE_TOKEN` | Credential that endpoint accepts; the deployment binds it to the account this runtime serves |

The supervisor that starts a runtime writes both; a hand-started `qilin` carries neither. One report is one Turn, and delivery is best effort:

```json
{ "sessionId": "…", "turn": 3, "inputTokens": 4192, "outputTokens": 318,
  "cacheReadTokens": 3072, "at": 1791725148421 }
```

`inputTokens` counts prompt tokens billed as uncached, `cacheReadTokens` and `cacheWriteTokens` appear only when every attempt of the Turn reported them, and `at` is this process's report time. The endpoint identifies the account from the credential, never from the body.

### Delivery

A report is sent once, when the Turn ends. A refused or unreachable endpoint is written to the log at warning level and dropped; the ledger is a report rather than an obligation, so telemetry trouble never delays a Turn or fails it.

<a id="understand-the-implementation"></a>
## Understand the implementation

The plugin buffers the durable events of the Turn each session is inside, from `turn/start` through `turn/end`, and folds them with the token-meter package's `deriveTurnTokenUsage`. That derivation refuses to infer usage: a Turn whose attempt lifecycle is incomplete, whose samples are unsafe, or whose exact total contradicts its parts yields nothing, and this plugin then reports nothing rather than an estimate. A Turn whose `turn/start` this process never saw — replayed history, or a session that began before the row mounted — is not one it can account for and is skipped.

<a id="further-exploration"></a>
## Further Exploration

- [Token meter](../../llm/token-meter/README.md) owns the derivation this plugin reports.
- [Accounts](../../identity/accounts-local/README.md) owns the roster the deployment's ledger attributes reports to.
- [CLI reference](../../../apps/cli/reference/README.md) documents the deployment flags that start these runtimes.

<a id="model-experience"></a>
## Model Experience

None, as this row only reads the session event stream and writes to a deployment endpoint, adding no prompt, tool schema, or model-visible output.

#### KV Cache effect

No request this row observes is altered, so every Session's cache footprint is unchanged.

## Known Limitations and Deferred Work

- **A report is not durable.** A process that dies before its Turn ends loses that Turn's report, and a dropped report is not retried; the ledger sums what arrived.
- **Delivery is per Turn, not per request.** Retries inside a Turn are folded into its attempts, so the ledger shows what the Turn settled rather than what each call cost.
- **The ledger's own attribution is the deployment's.** The credential decides which account a report lands under; a runtime started by hand cannot report at all.

<a id="dev-note"></a>
### Dev Note

The row is mounted by every runtime, including single-account ones, and is inert without the two variables; that is why it needs no configuration and no per-deployment enabling.
