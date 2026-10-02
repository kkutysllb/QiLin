---
description: "The right Sidebar's sidechat page for the qilin web client: the session's side threads, each thread's own transcript, and the composer that drives them, read back over the thread follow streams."
kind: "package-reference"
---

# @qilin/client-ui-sidechat

English | [中文](README.zh.md)

## Summary

The right Sidebar's sidechat page: one column listing the current Session's side threads and one pane showing the open thread's own transcript with a composer. It is a page type that claims no address, opened by kind alone. The roster and transcripts are the panel's own reads — the six Session Controller `sidechat*` remotes plus `session.follow` on each thread's subagent address — and every action travels through those remotes. Nothing in `ui-sidebar-right` knows this package.

## Table of Contents

- [What it registers](#what-it-registers)
- [The panel](#the-panel)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="what-it-registers"></a>
## What it registers

- **The type** — `ctx.sidebarRightTabs.register(...)` with kind `sidechat`, id `@qilin/client-ui-sidechat`, band `builtin`, `single`, and no patterns; `ctx.sidebarRight.openTab('sidechat')` opens it.
- **The body** — the keyed `sidebar.right.pane.tab` seat under that id, injecting the panel's state source through the `hooks` compartment and the actions through the inject face.

Nine source files under `src/client/`: `definition.tsx` (the type), `sidechat-model.ts` (the pure view model: the follow address and the transcript fold), `sidechat-source.ts` (the object-layer state source), `face.ts` (the actions and their Remote binding), `SidechatBody.tsx` and `SidechatBody.module.css` (what is drawn), `locales.ts` (what it says), and `index.ts` (the wiring).

<a id="the-panel"></a>
## The panel

**The roster** reads `session/sidechatThreads` for the Session the pane is open on, oldest first. Each row shows the thread's durable label and its live or running state; a row click opens that thread's transcript.

**The transcript** follows the open thread through `session.follow` on its subagent address (`continuable` child of the current Session). The opening snapshot replays the thread's own events — user messages, the inheritance boundary, and assistant replies — and committed frames append as they arrive. The inherited parent prefix never appears: it is reference context on the Host, not part of the thread's own log slice.

**The composer** sends its draft as a sidechat prompt (`session/sidechatPrompt`), Enter to send. A running thread offers cancel (`session/sidechatCancel`); a live idle thread offers release (`session/sidechatRelease`); the rail's button forks a new thread (`session/sidechatStart`), optionally naming it from a first question.

<a id="model-experience"></a>
## Model Experience

None, as this package draws Session-side threads in the browser and registers nothing model-facing. The thread's model requests belong to the thread's own Session on the Host.

#### KV Cache effect

None; the panel issues no model request and adds no tokens to any prompt. Its reads are durable-event folds over follow streams the Session Remote already serves.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **One tab per surface.** The page carries one in-panel thread list where the upstream coding-sidebar SideChat seats one tab per thread: switching threads replaces the open transcript, and two threads cannot be read side by side.
- **Host-owned thread identity.** Threads are identified by the Host's sidechat descriptor (provider `sidechat`, mode `continuable`), not an upstream title-prefix convention, so labels follow the Host's `Side: …` labeling rather than any client-side prefix rule.
- **Durable events only.** The follow requests the assistant stream baseline, but the panel draws no stream frames — assistant text appears when its durable `assistant/message` event commits.
- **Current Session only.** The panel attaches to the Session it is open on and cannot browse a sidechat workspace attachment, because sidechat threads carry none.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

The state source is registration-scoped object layer (`sidechat-source.ts`): the roster, the open transcript, and the in-flight flags outlive the body's unmounts, and the face is its only writer. The panel declares no store — there is no cross-entry viewing state to share.

</details>

**Runtime invariant:** No companion is published. The panel holds no state outside its source — the view model is pure over follow frames and asserted by unit specs, so there is no second observation of it to diverge.
