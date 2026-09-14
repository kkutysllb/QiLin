# Agent Note: The right Sidebar as a workbench

Status: implemented

English | [中文](2026-09-14-right-sidebar-workbench.zh.md)

## Problem

The right Sidebar already owned a docking kit (split panes, floating panels, two presentations), a tab-type registry with address claiming, a per-session layout store, and four shipped types: `guide`, `text`, `files`, `trajectory`. Beyond choosing a body, every type was identical to the framework. A chip could show the title captured when the tab opened and nothing else. A user had no way to say "I do not want this kind of tab". A caller could not open a workspace file without composing a resource address itself, and could not land an open in a session other than the one on screen. Nothing survived a reload: every session started collapsed and empty. A page with a live count — running jobs, working subagents — had no surface to put it on.

## Decision

**A type now declares its own identity and its uniqueness.** `SidebarRightTabDefinition` gains a required `label: () => string`, an optional `icon`, and an optional `single`. `label` cannot be derived from `title(address)`: that names the open content, and a resource type has no single address to name. `single` is implemented inside the store's `openContent` intent, so "focus the tab of this kind wherever it sits" is one recorded entry and replays like any other.

**A chip's status is a slot, not a field.** The new keyed `sidebar.right.pane.tab.badge` seat renders a tab's pill from the type that owns it. A badge is live truth, and live truth reaches a component through a registrant-owned store or an inject compartment, never through a static declaration read during someone else's render. The kit draws the pill; what it counts is the type's business.

**The kit learned to draw glyphs; it still knows nothing about `kind`.** `DockSurface` and `FloatLayer` gained optional `renderTabIcon` / `renderTabBadge` renderers. A chip reads glyph, pill, title, in that order, so the close control's fade covers the title and never the identity beside it.

**Switches are the registry's, persistence is the plugin's.** One switch per registered type, listed in the settings shell, turns a type off. A turned-off type loses its guide entries — the guide is how a user reaches a type, so removing them is what "off" means — and refuses new opens, while tabs already open keep rendering: nothing is closed behind the user's back. The registry owns the switched-off set so there is one truth, and it filters the guide cache itself, which is what keeps the published snapshot reference-stable.

**A layout outlives the page.** The surface store declares `persist`, so a reload returns to the tabs the user left open and a pruned session takes its layout with it. The recorded sequence is the undo depth and the bulk of that value, so it is bounded at 100 entries; dropping the oldest shortens how far back a step reaches and nothing else. The surface, its engine, and its seats are the [docking infrastructure](2026-09-04-right-sidebar-docking-infrastructure.md).

**The face gained the shortcuts its callers were spelling out.** `openFile(scope, path)` builds the `qilin-resource://file/…` address a caller would otherwise compose from `@qilin/util-workspace-path`; `scope` on both open options lands an open in another session's surface without switching the conversation; `features` is the capability list an out-of-tree tab type gates on, so a type built against an older Sidebar degrades instead of failing.

## Alternatives considered

- **`updateTab` (the reference workbench's retitle/retarget call).** The `sidebar.right.pane.tab.title` seat already renders a chip whose text follows live state, so a record mutation would add a second way to change what the strip shows without adding a capability. The consequence is recorded below rather than hidden.
- **`available` on guide entries.** A dynamic predicate has no current consumer, and the guide's entry list is cached for snapshot identity, so it would go stale between registry commits.
- **`ctx.settingsScope` for the switches.** They are browser-local view preferences, in the same family as the conversation's content width, not host user settings; localStorage keeps them per browser with no host namespace to declare.
- **Hiding a turned-off type only at the offer site.** The registry refuses the open as well, so a stale caller cannot seat a type the user turned off.
- **`single: true` on the guide.** A pane holds at most one guide; surface-wide uniqueness would pull the strip's add control across panes and break that. The seat spec caught it.

## Consequences

- The settings shell gains a page owned by `ui-sidebar-right`; the shell itself is untouched, and the contribution waits on `settings.section` through `slots.inject`.
- The switches are per browser. A second browser offers every type.
- A single-instance *resource* type cannot retarget: `single` focuses an existing tab, and nothing changes its `contentId`. The file workbench therefore opens one tab per file rather than one tab that follows the selected file, which is what the reference workbench's `updateTab` allowed it to do.
- Four page types ship on top of the framework: `tasks` (subagent topology and background jobs, with the first chip badge), `plans` (the workspace plan documents), `file` (the workspace tree beside a CodeMirror editor, saved through the new workspace write RPC), and `trajectory-graph` (the ledger as a node/edge graph).
- The `file` and `text` types form an edit/preview pair over one address. The editor's toolbar names the `text` kind through the Sidebar controller with the tab's session as scope — its own ranked open would land back on itself — and the viewer's edit control takes the ranked claim, which lands on the editor; both reveal an existing counterpart instead of duplicating. Which extensions count as editable is one classification in `@qilin/util-workspace-path`, so a file is editable everywhere or nowhere: the editor's claim gate and the viewer's edit affordance read the same set.

## Verification

- `packages/client/ui-sidebar-right/tests` covers the registry's switch semantics, the settings section, the persistence key, `single`, `openFile`, and the targeted open; `packages/client/ui-dockkit/tests` covers glyph and pill rendering.
- `pnpm run test:gui` for the client suites, and `QILIN_SNAPSHOT=replay pnpm run test:web` for the assembled browser.

## Deferred

- The switches are not covered end to end in a browser scenario: no shipped spec toggles a type off and observes the guide entry disappear.
- Persistence is asserted at the store level; no spec reloads a page and observes a restored layout.
- The right Sidebar's pane chrome is 76px while the conversation header is 48px, so the two horizontal rules differ while the column is open. Aligning them belongs to the Sidebar's own layout pass, not to this change.
