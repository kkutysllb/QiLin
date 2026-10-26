# Agent Note: New Session reuses a blank Session, matching a requested preset

Status: implemented

English | [中文](2026-10-20-new-session-blank-reuse-by-preset.zh.md)

## Problem

New Session (the sidebar button, the Workspace "+" button, and the shortcut, all calling `uiWorkspace.startSession` without options) once reused the Workspace's first blank Session. An earlier 0.2.1-alpha.2 change made it create a fresh Session and Agent on every call, so New Session composes the current preset definition after the user changes one instead of keeping a reused blank's earlier composition.

A blank Session that is not current is hidden from the Session tree, and New Session is the only way back to it. After that change, a user who types a draft into a blank Session, switches to another Session, and clicks New Session lands in another empty Session; the original draft stays in localStorage under the old Session id, but no control returns to it. The change therefore loses New Session's unsent drafts.

The Creator entries (`startSession(…, { agentPreset: 'cordis', prompt, whenDraftExists: 'append' })`) also reused the first blank Session and switched it to Creator: an existing ordinary draft stayed under Creator mode and the Creator prompt was not filled in, and New Session could likewise take over a Creator blank.

## Decision

Only the Client (`ui-workspace`) changes; the Host is unchanged:

- `startSession` without options takes the reuse path and follows the same rule as `openWorkspace`, `connectWorkspace`, and `startSession` with options.
- `connectWorkspace` names the first unstarted, unarchived blank Session that is still a Workspace member, then asks the Host to adopt it through `sessions.create({ workspaceId, sessionId })` so the Host switches it to the requested preset or its default. A request that names a preset skips a blank whose listed preset (`projectionValues.agentPreset`) is a different one, while a blank with no listed preset remains eligible; a request without a preset may name any blank. The Host creates a Session when no blank is eligible.

As a result, New Session returns to the original blank Session with its unsent draft, and preset flows such as the Creator entries do not take over a blank that lists another preset, so an ordinary draft is not moved under Creator. No persisted state is added, and the Client does not read the preset roster.

## Alternatives considered

**Reuse the first blank for every request.** Drafts come back, but preset flows such as the Creator entries take over the blank holding the user's ordinary draft, switch it to Creator, keep the draft there, and cannot fill in their prompt.

**Keep creating a fresh Session and move the abandoned blank's draft into it.** This needs rules for which blank to move from when several exist, how to treat attachments, and whether to archive the old Session, which is more change and state than reusing blanks.

**Let a request without a preset reuse only a blank of the Host default preset.** The Client does not know the default preset and would have to request the `agentPresets.list()` roster.

**Record a persisted source-to-blank-Session map in the Client.** It duplicates the preset each blank already records and must handle stale entries and per-origin isolation.

**Clear the existing draft in place when the preset changes (`clearPreviousDraft: true`).** It deletes a draft the user was writing in the other mode.

## Verification

- `ui-workspace` unit tests: New Session without options returns to the existing blank; a request without a preset reuses any blank, a request with a preset reuses only a blank listing the same preset, and a new Session is created when none matches (26 specs pass).
- `ui-conversation` draft tests: `whenDraftExists` keeps, appends to, or replaces an existing draft, and an attachment-only draft takes appended text as its whole text.
- The upgrade guide [New Session returns to its blank Session](../../../../docs/upgrade-guide/v0.2.1-rc.2/new-session-blank-reuse/guide.md) states the user-visible change and migration steps.

## Consequences

- New Session no longer guarantees the current preset definition: a reused blank whose Agent is still loaded in the Host with the same preset id keeps its creation-time composition; a blank resumed after a Host restart composes the current definition.
- A preset-naming client request can still adopt a blank that lists no preset; the Host sets that preset when it adopts the blank.
