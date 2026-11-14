# Progress ledger — plan: plans/2026-11-14-v5-coding-mainline.md

Slice: V5 S4 (未打开会话的工作树摘要), decided implementation 方案 1 (列表帧携带投影).
Spec authority: the plan's §2.4 acceptance table plus the handoff's fixed product decisions.
No separate spec document is named by the plan; rulings below resolve what the plan and the
current code disagree about.

## Pre-flight: recon before Task 1

- The plan's 方案 1 改动点 (Host `list.ts` field, `types.ts` list-item field, wire contract, client
  `buildListSnapshot`) is **already shipped** as the generic Session-list projection block:
  `SessionSummary.projections` (`SessionProjectionHints` = `{ kind, asOfSeq, values }`,
  `values: SessionProjectionValues`), built by `ApiSessionList.projectionsFor`
  (`sequenced` from the live registry, `cached` from `sessionProjectionCache.cachedSnapshot`),
  landed client-side by `SessionManager.applyListBlock` into `ProjectionValueStore` and read by
  `buildListSnapshot` into `SessionListEntry.projectionValues`. `forgeWorktree` is a summary key
  (it declares a wire view and no `summary: false`), and the forge README already documents that
  the Session list reads an unopened Session's worktree from its cached summary.
  `forgeChangeRequests` travels the same way.
- Ruling: do not add the plan's second per-key field or a parallel transport — that would be a
  second source of the same state. 方案 1's data path is delivered; S4's remaining work is the
  unknown-value copy the plan's row requires, the tests that pin the forge facts on that path,
  and the documentation that still says the row shows neither.
- Ruling (no Host fold budget): the plan's 上限/退化 items describe folding cold logs on the list
  path. The shipped path reads the persisted checkpoint with zero I/O and folds nothing, so a
  list never blocks on a fold and there is no threshold to add. A missing or version-mismatched
  checkpoint record is exactly the "no value" state the copy covers.

## Tasks

### Task 1: forge unknown-value copy

Task 1: Ruling (first pass, superseded by review round 1): put the unknown copy only in the hover
card, on the grounds that the row's leading seat is one 16px icon cell shared with the status dot.
The review rejected the waiver — the plan asks for an in-row disclosure and the suite was pinning a
blank row for the unknown case.
Task 1: Ruling (final): the row shows a dimmed branch mark for the unknown case
(`SessionRowForge.tsx`, `.unknown` in `SessionList.module.css`), whose accessible name and
`title` are the copy, so the row is no longer blank without a layout change in `ui-workspace`.
Two constraints stay: the branch NAME is hover-only because the 16px leading cell admits no text,
and the leading cell shows the row's status instead while the row has one (`Rows.tsx` renders the
seat only when the row's primary status is idle), so those rows carry the note on the hover card.
Task 1: complete (tests: npx vitest run packages/experimental/client-ui-forge/tests/session-list.client.spec.tsx → 13 passed at this point; 16 after review round 1; package suite 785 → 789 passed, with the 2 known sandbox-exec failures from handoff §6)

### Task 2: session-controller cold-list transport tests

Task 2: Finding: the new test passed before any source change, because the transport it pins
already ships. It is a characterization test of the delivered path (a cached block carries a key
outside the Host compilation face, and every list read re-reads the cache), not a TDD step.
Task 2: complete (tests: npx vitest run packages/api/session-controller/tests/session-cold.host.spec.ts → 20 passed; strengthened in review round 1 to assert the requested summary key set)

### Task 3: forge Host summary-block test

Task 3: Finding: also a characterization test — the panel's registration already lands
`forgeWorktree` in `summaryKeys()`, and the summary block's value already equals the panel's
worktree and turns `null` once the Session works elsewhere. Pins the plan's 不变量 (the row and
the panel read one projection).
Task 3: complete (tests: npx vitest run packages/experimental/client-ui-forge/tests/controller.host.spec.ts -t 'registers forgeWorktree as a summary key' → 1 passed)

### Task 4: documentation

Task 4: complete (forge README en/zh: Session list bullet gains the unknown-value mark, the
`Unopened Sessions in the list` limitation rewritten, the S2-obsolete `Changes scopes` deferred
item removed; `verify-translation-pairing --write` regenerated the pairing record; the plan gained
§2.4.1 and the handoff §3/§5/§7/§9 record the slice.
Finding: `test:docs` failed on the repository-references gate before any change of mine — the
handoff carried commit hashes, which that gate forbids. Removed every hash from the handoff and
recorded the rule under §7.
Ruling: the `Changes scopes` limitation was already false when S2 landed, in a list I am editing;
corrected here rather than shipped as a neighbouring lie.)

### Task 5: gates

Task 5: complete
- `pnpm run test:gui` → 10858 passed, 1 skipped (the lane is `packages/client` + `packages/host`
  only, so it does not cover the forge package; unchanged by this slice)
- `npx vitest run packages/experimental/client-ui-forge` → 789 passed, 2 failed = the known
  `sandbox-exec` environment failures from the handoff §6
- `npx vitest run packages/api/session-controller` → 875 passed
- `npx tsc -b tsconfig.host.json` and `npx tsc -b tsconfig.client.json` → no output
- `pnpm run test:docs` → 21 passed, 0 failed
- `pnpm run build` → exit 0, recorded 433 client artifacts
- `pnpm run verify-client-ui-i18n` → 1097 source files
- `npx tsx scripts/run-oxlint.ts <changed files>` → 0 errors

## Slice S7 (user follow-up): sidebar Git / non-Git project sections

Task 6: complete
- Host: `WorkspaceKinds` (`api/workspace-controller/src/kinds.ts`) classifies a Workspace path by
  walking to the filesystem root for the first `.git`; `WorkspaceView.kind` is required, filled by
  the follow baseline, each increment, and each mutation echo.
  Ruling: no Git spawn. The walk needs no process or timeout and still classifies a Workspace
  opened inside a repository and a linked worktree or submodule (`.git` is a file there); a bare
  repository classifies as a plain directory, which is documented.
  Ruling: the kind is not durable. It is a derived fact of the directory, so one cached answer per
  path serves every row and the workspace record format stays unchanged.
  Ruling: publication is chained. First pass published synchronously and lost frames when a
  directory still needed classification; second pass used the registry entity, which the rename
  test exposed as a race (the domain event fires before the in-memory title settles), so a changed
  row now comes from the committed record while an added row reads the registry, and both go out
  through one ordered chain so followers see domain order.
- Client: `tree.ts` carries each project group's `section` and orders root groups repositories
  first, then directories, each in Host order, with Ungrouped trailing; `WorkspaceBrowser` heads
  each run with a summary section row; `ProjectRowItem` draws the v2 branch glyph for a repository
  and keeps the folder glyph otherwise.
- Tests: `workspace-controller.host.spec.ts` (+4: three path shapes, cached reuse, no-fs
  fallback, echo and baseline carry the kind), `tree.client.spec.ts` (+2: section assignment and
  section order), `workspace-browser.client.spec.tsx` (+1: both headings and both row icons).
- Docs: workspace-controller and ui-workspace READMEs (en+zh) describe the classification and the
  two headings; plan §2.5 and the handoff status record the slice.

Task 6 (follow-up, collapse): each heading is a plain `<button aria-expanded>` flat among the
rows, not a `treeitem` and not wrapped in a `role="group"`: the first pass made headings treeitems
and ten row-enumerating tests (focus order, watermarks, drag targets) legitimately changed with it,
and a group wrapper broke the drag tests that resolve a Workspace section by walking to the tree
child. The persisted state is `collapsedSections` in the same browser view store, read defensively
because a state saved before the sections existed carries no map; revealing a Session in a
collapsed heading expands it first.
Task 6 (follow-up): Ruling: the section headings are product categories, not the technical fact, so
they read 「编码项目」/「普通项目」 per the user's wording while the wire fact stays `kind:
'repository' | 'directory'` and the discriminator stays "inside a Git work tree". Locale keys renamed
to `section.coding`/`section.ordinary`; README (en+zh), plan §2.5 and the test copy follow.

## Review round 1 (fresh subagent, whole slice)

Findings taken:

1. Blocker — row was blank for the unknown case and the suite pinned that. Accepted: dimmed
   in-row mark added, tests rewritten, plan/handoff wording corrected.
2. Handoff head claimed a fixed unpushed count. Fixed: no count in the header; §9 says how to
   read it.
3. Handoff §3 kept the superseded recon (store only from control frames; the four planned file
   changes). Fixed: §3.1 marked as disproven with the corrected mechanism, §3.2 as planned but not
   executed.
4. Cold-list test ignored the `keys` argument, so it could not catch a list that asks the cache
   for no keys. Fixed: the test registers a client-visible unit and asserts the requested key set
   on both reads.
5. Hover test missed unknown-with-change-requests and had no negative case for a known worktree.
   Fixed: both added, and the note is asserted by text.
6. Two citations were wrong (`client/contract/sessions.ts` has no projection field; the wire type
   is `SessionProjectionValues`, not `Partial<SessionProjectionMap>`). Fixed in the plan.
7. The new Host test was named for the Session list but reads the registry. Renamed to what it
   pins, with a note that the list-side composition is pinned elsewhere.
8. The plan overstated the row evidence as covering a cold block. Fixed: the plan now says the two
   halves are pinned separately and no single cross-package integration test exists.
9. The note can appear for an opened Session right after a reconnect clears the stores. Documented
   in the forge README (en+zh) rather than adding client state.
10. Plan wording said "running" for the live registry (it is every attached Session) and "每次刷新"
    for list reads (the client only lists on connect and boot retry). Fixed in the plan.
11. `SessionHoverForge` `@returns` was wrong for non-null worktrees. Fixed.
12. The S2-stale "Changes scopes" doc fix is out of S4's scope but correct and isolated in its own
    commit; reported rather than folded in.
13. The first ruling's premise was partly wrong (the row's text is not only the icon label). The
    final ruling records the real constraints.

## Follow-up (user decision, after both review rounds)

The user chose the distinct-glyph option for review round 2's nit 4: a new icon rather than the
dimmed branch.

- `IconBranchQuestion` added to the 24-grid v2 product icon set (`ui-primitives/src/icons/v2/index.tsx`),
  1.5 stroke on the shared frame, geometry previewed at 48/24/13px before landing; registered in
  `icons-v2.client.spec.tsx` so the frame contract covers it.
- `SessionRowForge` now draws the known case with v2 `IconBranch` and the unknown case with
  `IconBranchQuestion` (both 14px), so a row never mixes the 16-grid and 24-grid branch shapes;
  the `.unknown` dimming class is gone because the shape now carries the distinction.
- Docs updated in the same pass: forge README en/zh, plan §2.4.1, handoff §3.
- Gates after the follow-up: `test:gui` 10858 passed / 1 skipped (covers `ui-primitives` and its
  v2 icon contract spec), forge package 789 passed with the 2 known `sandbox-exec` failures,
  both tsc faces clean, `test:docs` 21/21, `pnpm run build` exit 0 with the glyph present in
  `apps/web/dist`, `verify-client-ui-i18n` clean, oxlint clean.

## Review round 2 (delta review of the fixes)

Findings taken:

1. The README's in-row claim was unconditional although a row showing its status renders no leading
   seat. Fixed: the README (en+zh), plan §2.4.1 and the Task 1 ruling now name that pre-emption.
2. Handoff §9 still carried a commit count that had already moved. Fixed: no number; it defers to
   `git rev-list`.
3. The handoff named one literal difference where there are two. Fixed: both named.
4. Nit, kept as a documented choice: the unknown mark is the branch glyph dimmed, so for a Session
   that never had a worktree the shape still reads as a branch; `aria-label`/`title` and the hover
   card carry the meaning, and a distinct glyph (branch with a question mark) would be a new shared
   icon in `ui-primitives`. Recorded here and in the slice report as the follow-up decision.
5. The reconnect limitation mentioned only the note, not the dimmed mark. Fixed: the limitation now
   speaks of the listed values.
6. This ledger's chronology and counts. Fixed: review rounds moved after Task 5, and the Task 1 line
   records the counts at that point plus the final ones.
