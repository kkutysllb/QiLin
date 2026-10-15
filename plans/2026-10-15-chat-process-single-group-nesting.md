# Chat process: one group per Turn with nested Steps

Status: implemented (uncommitted); the seed-session fixture refresh landed, the rest of the browser lane is blocked on unrelated replay-fixture drift
Owner context: Web client transcript (ui-chat)

## Problem

A stopped Turn in QiLin renders its process evidence as a flat list: context
injections and per-Step group headers sit at the same indent, and the Turn-level
control repeats the stopped mark. DSH renders one group per Turn whose header is
the Turn's action summary (`执行了命令，运行了代码，已读取文件等`), collapsed by
default, with Steps and their calls nested one and two levels deeper.

Two gates already changed in this window made the stopped Turn fold at all:

- `src/client/contract/turn-process.ts` — `turnProcessAlwaysOpen` keeps only
  live Turns open (was: `aborted`/`error` too).
- `src/client/chat/ChatGroupSeat.tsx` — `alwaysOpen` no longer forces
  `aborted`/`error`; the unused `reason` was removed.
- `src/client/conversation-nodes/turn-process.ts` — a Turn with no finalized
  answer now owns its whole range (`processStartSeq: turn.start?.seq`), so the
  injections that arrive before the control fold with the process instead of
  leaking beside the `已停止` mark.
- `src/client/chat/ChatGroupSeat.module.css` — grouped bodies indent 24px under
  their header.

What remains is the grouping itself: QiLin emits **one group per Step**, so
expanded rows alternate `injection / step header / injection / step header`
instead of DSH's single header with nested rows.

## Current mechanism

- `src/client/conversation-nodes/process-groups.ts` — projects groups from
  Chat Node structure; `isStep` / `hasAssistantReplyContent` split at Steps
  (see the `assistant-step` branch).
- `src/client/contract/process-groups.ts` — `ProcessGroupData { turn, closed,
  summary }`; `ProcessActivitySummary { counts, running, runningDetail }`.
- `src/client/chat/step-process.ts` — `processTitle(summary, t)` composes the
  header label from the ranked counts (adds `…等` past three categories); already
  the DSH-style string.
- `src/client/chat/ChatGroupSeat.tsx` — renders header + body, owns the group's
  local disclosure and the outer-Turn visibility.
- `src/client/chat/ChatNodeSeat.tsx` — decides membership (`processMember`) and
  the Turn-level fold (`foldable`, `processHidden`).

## Steps

1. **One group per Turn.** In `conversation-nodes/process-groups.ts`, stop
   splitting at Steps: emit a single group spanning `processStartSeq` to the
   answer boundary (or the Turn end when there is no answer), `closed` when the
   Turn closes, `summary` folded over every member of the Turn.
2. **Depth on members.** Give each member a depth derived from its kind and Step
   ordinal (Step rows 1, their tool/reasoning rows 2). Publish it as a data
   attribute; render indentation from it in CSS instead of the single body
   indent added in this window.
3. **Keep live behavior.** While the Turn is open, the live title/detail path
   (`message.stepProcess.*` + `liveProcessDetail`) stays as it is.
4. **No duplicate stopped mark.** Once the Turn folds behind one header, the
   Turn-level control must not also print `已停止`; decide whether its Seat is
   hidden for a closed Turn without an answer or carries the summary instead.
5. **Specs to add** (`tests/conversation-node-definitions.client.spec.ts`,
   `tests/chat-view.client.spec.tsx`): (a) one group per Turn regardless of Step
   count; (b) a stopped Turn folds by default with the summary title; (c) expanded
   members carry depth 1/2; (d) the partial-window guard still hides nothing on
   incomplete history.
6. **Verification ladder**: `pnpm exec vitest run packages/client/ui-chat/tests`,
   `pnpm run test:gui`, then `QILIN_SNAPSHOT=replay pnpm run test:web` (this
   changes visible transcript output), then `pnpm run build`.

## Open questions

- DSH's exact row rhythm and indent per level (screenshots show roughly one
  indent step per level); pin the numbers from a DSH screenshot before tuning.
- Whether a Turn header shows the duration for completed Turns (QiLin today) or
  the action summary (DSH's stopped example): needs a completed-Turn DSH
  screenshot.
## Verified mechanism (this window)

The pin-point finding above is **refuted by observation**. A diagnostic spec driving
the real `ChatSnapshotBuilder` + `ProcessState` + `ConversationGroupStore` over a
two-Step stopped Turn recorded zero order breaks in the Turn's key run
(`user, control, injection, step-1, call, injection, step-2, call, tail`), so line 159
never fired, yet three groups were emitted. Reporting the Turn's own predecessor as
`readPosition.previous` produced identical entries.

The splitter is the reply branch: `hasAssistantReplyContent` excludes only reasoning
and Tool-call blocks, so every Step's Assistant prose counted as the finalized answer
and closed a group. Line 159 was a segmentation rule, not an integrity guard —
`rebuild` recomputes `groups`, `membership`, and `roots` from `input.order` on every
call, so declining to flush cannot corrupt membership or order. Its trigger is a
foreign visible row inside the Turn's key run, never a Step boundary.

Injections are members only in the form Chat renders: a `context` node without
`tool-addition`/`tool-removal` blocks fails `isVisibleChatNode` and stays a root row.

## Implemented

- **One group per closed Turn.** Members span `processStartSeq` to the answer boundary,
  or the whole Turn when no answer was finalized. The boundary reuses the Turn's own
  `turn-process` Node data (`processStartSeq`, `answerAnchorSeq`, `answerStep`) rather
  than a second definition of "answer". A non-independent row past the boundary is an
  ordinary root row instead of a trailing group.
- **A live Turn keeps its streamed segmentation**, so in-flight Assistant prose is never
  swallowed by a collapsed body. `closed` follows the Turn's status, and
  `structureChanged` also watches the control Node's process range so a late boundary
  reshapes incrementally.
- **A lifecycle-only close reassembles the Turn.** A Turn that streamed several
  segments merges into one group the moment its status becomes closed; the incremental
  path previously only marked the existing groups closed, so live use kept one header
  per Step until a reload. `process-groups.client.spec.ts` pins both the streamed
  segmentation and the merge.
- **Member depth** is derived in the Client from the member's `groupPart`
  (`response` → 1, everything else → 2) and published as `data-chat-depth`;
  `ChatGroupSeat.module.css` indents `24px × depth` and the flat 24px body indent is
  gone. `NodeReference` in `contract/groups.ts` was not widened.
- **Step 4 decided, not carried:** the Turn control row is the only affordance that
  reveals a folded Turn (`ChatGroupSeat` gates its reveal on the control's store entry)
  and the group root is hidden while folded, so the control is not a second visible
  header. It stays. The stopped mark still appears on both the control row and the
  interrupted answer row; that duplication remains a separate decision.

## Acceptance (observed)

| Check | Result |
| --- | --- |
| `pnpm exec vitest run packages/client/ui-chat/tests` | 49 files, 638 passed (was 631) |
| `pnpm run test:gui` | 1 failed \| 609 passed (610), 9250 tests passed; the failure is the pre-existing `ui-usage` URL check, unchanged |
| `QILIN_SNAPSHOT=replay` seeded-history | 14 passed, 1 skipped |
| `pnpm run build` | exit 0, no `error TS` |

Visible-output drift this change owns, recorded rather than incidental:

- A context injection arriving after the Turn's answer boundary is no longer swallowed
  into the folded process; it renders as its own transcript row
  (`Context injection · AGENTS.md`). `snapshots/web/seeded-history/` gained one line in
  `ui.expected.md`, `ui-expanded.expected.md`, `command-row.expected.md`, and
  `feedback-row.expected.md`.
- The collapsed-control geometry moved 8px: the collapsed group root now sits between
  the control row and the answer row and hides with `content-visibility`, which stops
  the control's 8px bottom margin from collapsing with the answer row's flow gap.
  Measured: control button 208-241, its wrapper 208-249, group root 249 (zero height),
  answer 265. `seeded-history.e2e.ts` moved from `+ 16` to `+ 24`.

## Open items

- `turn-tail-actions.e2e.ts:251` shows the same `+8` signature and was **not**
  re-baselined: that suite's replay fixture drifts on its own (its recorded run calls
  `bash` directly, which this composition refuses with "only `run_code` is callable
  directly"; it also lacks the skill-catalog injection and the current runtime-context
  text). Re-baselining its geometry now would bake in that drift.
- The rest of the browser lane (`chat-scroll-contract`, `goal-multi-turn-actions`,
  `present`, `skill-user-invoke`, `settings-chrome`, `sidebar-right`,
  `lifecycle-chrome`) fails on the same fixture and composition drift, not on this
  change, which is client-only.
