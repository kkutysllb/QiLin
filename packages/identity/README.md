---
description: "The identity package group: the anonymous per-harness-home correlation id shared by telemetry, feedback, and DeepSeek provider requests, and the local browser accounts that gate a Web deployment."
kind: "package-group"
---

# identity/ — shared identity

English | [中文](README.zh.md)

## Summary

The identity group answers two questions about one harness home: which installation its outgoing records belong to, and who may reach it. One anonymous id per home is attached by telemetry, feedback, and DeepSeek requests, so everything leaving that home is recognizable without identifying the user; it needs no configuration and stays stable until its file is deleted. Local browser accounts gate the application document and the `/api` surface of a Web deployment, where the first sign-up initializes the administrator account. The group has two packages; this page maps them, and each package README owns the details.

## Table of Contents

- [Packages](#packages)
- [Related documentation](#related-documentation)
- [Dev Note](#dev-note)

<a id="packages"></a>
## Packages

| Package | Role |
|---|---|
| [`anonymous-user-id`](anonymous-user-id/README.md) | Gives every harness home one anonymous id that telemetry, feedback, and DeepSeek requests attach to their records, so records from one installation can be recognized without identifying the user |
| [`accounts-local`](accounts-local/README.md) | Requires a signed-in browser account before a Web deployment serves the application document or answers `/api`, with the account file, password hashes, and session cookies under the harness home |

<a id="related-documentation"></a>
## Related documentation

- [Session telemetry subsystem](../../docs/subsystems/session-telemetry.md) — the telemetry feature that carries the id on exports.
- [qilin-llm-deepseek](../llm/llm-deepseek/README.md) — the DeepSeek provider that carries the id on requests.
- [qilin-command-feedback](../feedback/command-feedback/README.md) — the feedback command that names the anonymous installation in its acknowledgement.
- [qilin-client-connection](../client/connection/README.md) — the transport that owns the index and `/api` gates the account-session authority claims.

<a id="dev-note"></a>
## Dev Note

None.
