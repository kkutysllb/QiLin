---
description: "Browser-safe Workspace path helpers for joining relative paths, abbreviating POSIX homes, classifying editable text paths, and deriving display titles."
kind: "package-library"
---

# qilin-util-workspace-path

English | [中文](README.zh.md)

## Summary

Browser-safe path helpers shared by Workspace-facing client and controller packages. The package joins Workspace-relative paths, abbreviates POSIX home directories for display, derives Workspace titles from POSIX or Windows paths, splits a path into its directories and final segment for display, owns the `qilin-resource://file/…` address grammar that names a workspace file across the Sidebar and the resource model, and classifies which extensions the client opens as editable text. `relativizeToCwd` removes the workspace prefix for display while preserving paths outside that directory. It has no Cordis service or runtime state.

## Table of Contents

- [File addresses](#file-addresses)
- [Editable text paths](#editable-text-paths)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="file-addresses"></a>
## File addresses

A resource address is `qilin-resource://<type>/…`, and the type — the URI host — is the resource protocol key (`file`, or one a plugin declares in `ResourceProtocolMap`); any other scheme is a navigation protocol, defined elsewhere. `qilin-resource://file/session/<sessionId>/<path>` names the Session that authorizes the Host read and a workspace-relative or absolute path. Leading slashes remain part of the path: `/etc/hosts` is `qilin-resource://file/session/s//etc/hosts`, a Windows drive is `qilin-resource://file/session/s/C:/x/y.txt`, and UNC is `qilin-resource://file/session/s///server/share/y.txt`. The Host resolves paths and enforces access. The `absolute/<path>` form remains parseable but carries no authorizing Session, so the file provider cannot read it and Preview does not claim it; neither current nor Tab Session is borrowed. The grammar lives in [`src/file-address.ts`](src/file-address.ts); the path helpers stay in [`src/index.ts`](src/index.ts), which re-exports it.

`sessionFileAddress(sessionId, path)` normalizes `\` to `/` and drops leading `./`, but preserves leading `/` characters. Every id and path segment is component-encoded with `:` kept literal. `fileAddressFor(sessionId, cwd, path)` always builds a Session address: paths inside `cwd` become relative; other absolute paths, including when `cwd` is unknown, stay absolute within that Session address. `absoluteFileAddress(absolutePath)` builds only the Session-less form. `parseFileAddress(address)` checks the exact file-address prefix, ignores query and fragment suffixes, decodes each segment, and returns `{ scope, sessionId, path }` for a Session address or `{ scope, path }` for the Session-less form. Another type or scheme, an unknown scope, a missing id or path, or a malformed escape returns `undefined`.

-----

<a id="editable-text-paths"></a>
## Editable text paths

`TEXT_FILE_EXTENSIONS`, `extensionOf(path)`, and `acceptsPath(path)` are the one classification of which file paths the client opens as editable text — plain-text extensions plus every language with an installed grammar or legacy mode. The Sidebar's editor guard and the preview viewer's edit affordance both read it, so a file is either editable everywhere or nowhere. Matching is by final suffix, lower-case, on either separator; anything absent falls to the preview viewer. The classification lives in [`src/editable-path.ts`](src/editable-path.ts).

-----

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Resolution is lexical** — it recognizes POSIX absolute paths, Windows drive paths, and UNC paths, preserves the Workspace path's separator when joining a relative path, and does not access a filesystem or canonicalize `.` and `..` segments.
- **Home abbreviation is POSIX-only** — Windows paths remain unchanged because a portable browser cannot infer Windows home-path equivalence safely.


<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>

**Runtime invariant:** No companion is published. This utility owns no mutable runtime relationship.
