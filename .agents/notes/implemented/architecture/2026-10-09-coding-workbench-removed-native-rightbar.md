# Agent Note: Coding workbench removed for the native right Sidebar

Status: implemented

English | [中文](2026-10-09-coding-workbench-removed-native-rightbar.zh.md)

## Problem

The dual-workbench design (plans/2026-10-05, D5) shipped a second right-Sidebar content body: `@qilin-agent/client-ui-sidebar-coding`, a VSCode-like workbench (explorer, editor, diff, git, browser tabs, floating panes) backed by a Node host half registering the `/sidebar` route family — file read/write, git operations, an HTML preview route, a lazy-chunk route, and a per-session terminal WebSocket. That duplicated the engine-native right Sidebar as a second content body, a second admission surface, and a whole host API family to fence and maintain, while both workbench tags rendered into the same frame chrome.

## Decision

`ui-sidebar-coding` is deleted. The coding and general workbench tags render the same engine-native right Sidebar: `ui-sidebar-right` loses the `rightbar.session.coding` seat and the workbench-hook threading, and its panel always renders the dockkit kit. The opens that the coding sidebar used to claim (ui-agent-opens' page/file routing, ui-schedule's task-detail detour) route to the native Sidebar unconditionally.

The workbench tag itself stays (`ui-workbench`): it still owns the per-tag plugin admission surface (ui-plugin-manager's audience gate) and remains the switch for compositions that differentiate the two modes. Only the coding content body is gone.

## Alternatives considered

**Keep the coding body without the host API family.** Rejected: the workbench is its backend — an explorer without the file API, a terminal without the WebSocket, a diff without git reads. A body that cannot act is not a workbench.

**Keep both bodies behind the tag.** Rejected: every QiLin change paid the maintenance of a second workbench and a second fenced API family, and the coding body's fixes (as the hover fixes showed) reached the desktop on the tag's schedule rather than the code's.

## Consequences

The `/sidebar` route family (explorer, file media, HTML preview, lazy chunks, terminal WebSocket) no longer exists; third parties that scripted those endpoints lose them. The scrollbar gate, source-leakage baseline, client slot catalog, module graph, and config catalog no longer carry the package. The dual-workbench design's coding half (plans/2026-10-05-dual-workbench-web-design.md) is retired history; the general half and the tag remain.
