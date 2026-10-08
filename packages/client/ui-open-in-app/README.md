---
description: "Web Session-header \"Open In...\" split button: launches the remembered application on the session workspace directory and lists every application the host probed as installed; the document preview's file opener hands one previewed file to the serving desktop over the Session Remote."
kind: "package-reference"
---

# @qilin-agent/client-ui-open-in-app

English | [中文](README.zh.md)

## Summary

This package provides the browser surface of the open-in-app feature: a Session-header split button whose main button opens the current session's workspace directory (the summary's `cwd`) in the remembered application, and whose chevron lists every catalog application the host probed as installed. Availability, icons, and launches come from the host routes of [`qilin-host-open-in-app`](../../host/open-in-app/README.md); mount the two packages together. A session without a workspace directory, or a host where nothing nameable is installed, renders no button at all. It also ships the document preview's file opener, handing the previewed file to the serving desktop over the Session Remote.

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

Mount this plugin in the Web composition beside [`qilin-host-open-in-app`](../../host/open-in-app/README.md); the pair composes the whole feature in two cordis.yml rows and this row takes no config. The Session header grows an "Open In..." split button whenever the host probed at least one installed catalog application and the session has a known workspace directory.

### What to expect

The main button shows the remembered application's icon — the real application icon wherever the host extracts one (macOS bundle icons, Windows executable icons, Linux theme icons), a generic glyph where it serves none — and a design-system tooltip ("Open locally"); clicking launches immediately. The chevron opens a dense menu of the installed applications with the remembered one marked by a filled row. Availability is read once per page from the host; the last chosen application persists in the browser (`qilin.open-in-app.choice`), and a choice that is no longer installed falls back to the first available entry. A launch that finishes quickly leaves the button untouched — the dimmed busy treatment appears only after 250 ms in flight — and a failed launch shows the error tooltip and a red outline for two seconds. All copy lives in the bilingual `open-in-app` locale namespace; an application id the dictionaries cannot name is not offered. The **Open locally** shortcut captures the main Session's directory and the same remembered application as the header button (desktop `Mod+Alt+O`, Web `Mod+Shift+O`); the command runs only while the Conversation is selected with a directory and an installed application to open, and an in-flight launch blocks it.

A document preview header carries this package's second control: a compact split button whose main action opens the previewed file in the desktop's default application, and whose chevron lists the file's registered handlers — the operating system's default marked — beside **Show file location**, which reveals the file in the file manager. A file the preview cannot render shows the same control, labeled, in its empty state. Both render nothing until the Host reports that it can open paths and the file has a reported Host path; the handler list is read when the menu first opens, and a failed read says so instead of showing an empty list. A failed gesture paints the error state and names the failure on the button, and a gesture in flight blocks the next one whole.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The plugin registers the split button on `conversation.session.header.utilities` through the standard slot/inject currency and registers the `open-in-app` dictionaries as one effect. A page-lifetime controller ([`src/client/controller.ts`](src/client/controller.ts)) owns the once-per-page availability read, the persisted choice snapshot store, and the launch POST; the component receives both stores through the inject `hooks` compartment, so every Session header shares one truth. Route paths and wire payload types are inlined from the host package's browser-safe `@qilin-agent/host-open-in-app/shared` subpath. In-flight launches are guarded by a ref — repeat clicks and menu picks during a launch are ignored whole (a pick would otherwise persist a choice the gesture never opened) — and the busy/error dress is timer-driven around the `launch` promise. Desktop availability, file associations, and the open/reveal gestures of the document controls go through a second page-lifetime controller ([\`src/client/open-path.ts\`](src/client/open-path.ts)) over the generated `session` Remote namespace — `canOpenWorkspacePath`, `workspacePathApplications`, and `openWorkspacePath` — whose Host side re-verifies each path against the composed filesystem before running a native command. One inject face carries the controller's desktop snapshot and the three calls to `sidebar.right.tab.document.actions` and `sidebar.right.tab.document.unpreviewable`. The node half is an empty `apply` that keeps the plugin on the host roster.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [qilin-host-open-in-app](../../host/open-in-app/README.md) — the host routes serving availability, icons, and launches, and the catalog behind them.
- [qilin-session-log-export](../../session-query/session-log-export/README.md) — the sibling Session-header action.
- [Web client architecture](../../../.agents/notes/implemented/architecture/2026-07-19-gui-web-client-architecture.md) — how browser plugin rows load and register slots.

-----

<a id="model-experience"></a>
## Model Experience

None, as the split button is browser chrome; nothing here reaches a model request.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **The dictionaries gate the menu.** A host catalog extension without a matching `app.<id>` entry in both dictionaries stays invisible instead of showing a raw id; extending the catalog means extending [`qilin-host-open-in-app`](../../host/open-in-app/README.md) and this package's locales together.
- **Availability is read once per page.** An application installed while the page is open appears after a reload (and, host-side, after a host restart).
- **A path must have a verified Host mapping.** `openWorkspacePath` refuses a path the composed filesystem cannot resolve (`gateway/bad-request`), so a preview whose file does not resolve on the serving filesystem shows the failed gesture instead of opening anything.
- **The document opener's handler list is per file.** It is read when the menu opens and not watched, so a handler installed while the page is open appears after the next menu open reads the associations again.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

The feature-level decisions, including the split into the host package and this surface, are recorded in the [promotion Agent Note](../../../.agents/notes/implemented/feature/2026-08-25-promote-open-anywhere-plugin.md).

</details>
