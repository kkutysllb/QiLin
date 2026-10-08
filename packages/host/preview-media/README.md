---
description: "Host half of preview media: the /sidebar/media route serving session-workspace files to inline previews, with HTTP Range windows for seeking video."
kind: "package-reference"
---

# @qilin-agent/host-preview-media

English | [中文](README.zh.md)

## Summary

Two webServer routes under `/sidebar/media` serve the browser's inline previews. `GET/HEAD /sidebar/media?sessionId=<id>&path=<p>` serves a session-workspace file. A request with a `Range` header is answered from a windowed read (`206`), so the document preview's video element can seek; `?download=1` switches the disposition so the browser saves the file. Whole-file responses are bounded by `mediaLimitBytes`.

## Table of Contents

- [Use this package](#use-this-package)
- [Model Experience](#model-experience)
- [Dev Note](#dev-note)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)

## Use this package

Mount it in any composition that serves the web app and wants inline media previews. The route needs no configuration; `mediaLimitBytes` (default 20 MiB) bounds one whole-file response, while a ranged request reads only its window and is exempt.

### What to expect

- `206` with `Content-Range` for satisfiable single ranges, `416` for a start past EOF, plain `200` without a usable range header.
- Reads resolve through the abstract filesystem service, so remote execution worlds serve the same route.
- The connection service's request rejection (origin fence plus browser authentication) gates every request.
- `PUT /sidebar/media/upload?sessionId=<id>&path=<p>` writes one complete file into the session workspace through the filesystem's `writeBytes` (create or replace, no version guard); the body is bounded by `mediaLimitBytes` and an oversized body is refused with `400` before any write. The files tab's drop-upload is the caller.

## Model Experience

None, as this package registers no tool, contributes no prompt section, and appends no session event; the route serves bytes the user can already read through the preview surface.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- **Single-window ranges** — one `Range` spec is honored per request; a multi-spec header serves the first window only.
- **Whole-file GET bounded, upload capped once** — a plain `GET` beyond `mediaLimitBytes` is refused, and an upload body crossing the same cap is rejected before any write; there is no chunked or resumable transfer.
- **Disposition is all-or-nothing** — `?download=1` forces the attachment disposition on the whole answer; no partial-content download resumes.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
