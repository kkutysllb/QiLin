# Progress ledger — plan: plans/2026-11-14-v5-coding-mainline.md

Slice: V5 S4 (未打开会话的工作树摘要), decided implementation 方案 1 (列表帧携带投影).
Spec authority: the plan's §2.4 acceptance table plus the handoff's fixed product decisions.
No separate spec document is named by the plan; rulings below resolve what the plan and the
current code disagree about.

## Pre-flight: recon before Task 1

- The plan's 方案 1 改动点 (Host `list.ts` field, `types.ts` list-item field, wire contract, client
  `buildListSnapshot`) is **already shipped** as the generic Session-list projection block:
  `SessionSummary.projections` (`SessionProjectionHints` = `{ kind, asOfSeq, values }`,
  `values: Partial<SessionProjectionMap>`), built by `ApiSessionList.projectionsFor`
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

Task 1: Ruling: the plan's 「行内显示分支名」 and 「行内显示"打开后可见"」 cannot both be literal —
the row's leading seat is one icon cell shared with the status dot, and its
`aria-label` is the whole row-level text. The branch name stays in the hover card (existing
layout decision); the unknown copy lands there too, as a row-level explanation line, instead of a
placeholder glyph that would mark ordinary old Sessions with a misleading branch icon.
Task 1: complete (tests: npx vitest run packages/experimental/client-ui-forge/tests/session-list.client.spec.tsx → 13 passed; package suite 785 passed, 2 known sandbox-exec failures from handoff §6)

### Task 2: session-controller cold-list transport tests

### Task 3: forge Host summary-block test

### Task 4: documentation

### Task 5: gates
