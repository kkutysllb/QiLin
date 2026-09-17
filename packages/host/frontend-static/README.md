---
description: "SPA dist server for the Web shell: claims the webserver fallback seat and serves the built frontend at configured index paths and public documents, with traversal rejection and no silent fallback."
kind: "package-reference"
---

# @qilin/host-frontend-static

English | [中文](README.zh.md)

## Summary

Serve the built Web shell to browsers from its configured distribution directory. Every configured index path renders the bootstrapped index after authorization; a configured public document ships as its own bytes before that gate; existing assets are served directly, while missing or non-file paths return 404, traversal returns 403, and unsupported methods return 405. Index access requires a valid process token or browser cookie, but static assets and public documents remain public. Only one instance can handle unmatched routes at a time; a second activation fails, and unloading the active instance makes unmatched requests return 404.

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

Compose this plugin in a browser-facing host that serves the built Web shell: it claims the webserver's fallback seat and answers every request no named route matches. It needs where the built frontend's `index.html` lives, and it accepts which request paths serve that index and which documents are public.

### Minimal configuration

```yaml
- name: '@qilin/host-frontend-static'
  config:
    distIndex: /absolute/path/to/dist/index.html
```

| Field | Default | Meaning |
|---|---|---|
| `distIndex` | required | Absolute path of `index.html` inside the dist root |
| `indexPaths` | the connection entry path plus `/index.html` | Request paths that serve the index document, each after index authorization; an omitted or empty list uses that default |
| `documents` | `[]` | Public documents served before the index gate, each an absolute `path` and a bare dist `file` |

`distIndex` and the document table are assembly facts of the composing application: [`qilin-web-app`](../../bundle/web-app/README.md) resolves the dist through the frontend package's exports and states the documents it serves; a deployment never hardcodes either. The `indexPaths` default reads `ctx.connection.entryPath`, so the path the transport hands a browser is always one this server answers.

### What the server enforces

Requests are served from the dist root (the directory containing `distIndex`). A configured document path answers with that file's bytes and the HTML media type; every configured index path renders `index.html` with HTTP 200; any other existing file is served directly with its MIME type, and unknown extensions ship as `application/octet-stream`. A path that resolves outside the root is rejected with 403, so a crafted path cannot read files above the dist. An absent or non-file target inside the dist root — a missing file, a directory, or a missing configured index — returns an empty 404. Non-GET/HEAD requests without a matching named route are answered 405. Every successful index response is rendered through the webserver's `renderIndex`, so the boot manifest reaches the page at each configured index path.

Configured-index responses call `ctx.connection.authorizeIndex` before reading HTML. A valid process token receives a 303 redirect plus the persistent browser cookie; an existing valid cookie serves the index; every other index request is answered by whichever authentication owns the deployment — the Connection-owned 401 response, or the installed account-session gate's redirect to the public landing document. Documents skip that authorization: the landing page at the site root and the sign-in page are reachable without a session, each is served with a `<base href="/">` anchor so its relative URLs resolve from the site root, and neither runs the index taps, because they are static product markup rather than the bootstrapped application. Other files remain public static assets. Connection owns the token, cookie, expiry, and signing-record semantics.

### Document validation

`apply` validates every configured row before it claims the fallback seat: a document `path` must be an absolute pathname without a trailing slash, its `file` must be a bare dist file name, a path may be configured once, and a path that is also a configured index path is refused. Each violation throws, so a mistyped document table fails the plugin load instead of serving a neighboring path or an index document from behind the gate.

### Observable failures

Traversal returns 403 rather than an error page. An absent or non-file target inside the dist root returns an empty 404, so a stale link or a mistyped pathname is an explicit failure rather than a silent SPA fallback. Claiming the seat twice throws, and while the seat is unclaimed the webserver answers 404 — which is what a browser sees if this plugin's fiber is disposed.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

### Design concept

The package is one function plugin around `serveStatic`: `apply` resolves the dist root from `distIndex`, resolves the index-path set (defaulting to `ctx.connection.entryPath` plus `/index.html`) and the validated document map, builds a `renderIndex` closure that runs `ctx.webServer.renderIndex` over the raw `index.html`, and registers the fallback handler under an effect scope. The seat is single-owner by the webserver's contract — a second registration throws — and effect-scoped, so disposing the fiber releases the seat.

### The traversal fence

`serveStatic` normalizes the requested pathname and joins it to the dist root, then requires the target to be the root itself or stay under it. The check uses `sep` rather than `/` because `resolve()` emits backslash paths on Windows, where a `/` suffix would reject every legitimate subpath as traversal.

### Source map

| File | Role |
|---|---|
| [`src/index.ts`](src/index.ts) | `serveStatic` and `apply`: fallback claim, index paths, public documents, traversal rejection, index rendering, MIME table |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

Read these when the serving contract is not enough: the seat owner's contract, then the composition that resolves the dist and the subsystem reference.

- [Webserver](../webserver/README.md) — the fallback seat this plugin claims and the index taps it runs.
- [qilin-web-app bundle](../../bundle/web-app/README.md) — the application that resolves `distIndex`, states the public documents, and mounts this plugin.
- [HTTP server subsystem](../../../docs/subsystems/web-server.md) — how the fallback seat fits the route tables.
- [Generated configuration catalog](../../../docs/config-catalog.md#qilinhost-frontend-static) — every accepted config field and its source declaration.

-----

<a id="model-experience"></a>
## Model Experience

None, as the SPA dist server answers browser asset requests and registers nothing model-facing.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>


These limits define when a served asset class is not yet covered. They are current package constraints, not a task backlog.

- **The starter MIME table is minimal** — it covers the Vite-emitted asset set plus the shipped PWA manifest; other extensions fall back to `application/octet-stream` until an asset class ships.
- **Pathname routing is explicit** — the client enters at the transport's entry path and has no History API pathname routes. Adding one requires a documented server rule — a public document, an index path, or a named route — with real-composition coverage rather than a broad fallback for every miss.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>

**Runtime invariant:** No companion is published. The only owned relation is the single fallback seat, which cannot be probed from the teardown stream — `internal/plugin` fires before the disposing fiber's effects run, so the legitimate owner still holds the seat at notification time and any claim probe would false-positive on every correct disposal (unlike the webserver companion, whose reserved-path probes never collide with a live registration). The seat's register/release symmetry is covered by the package's real-composition HMR-safety test instead.
