/**
 * The tasks graph's shared view model: the single source the canvas renders.
 *
 * Inactive direct children split into two groups by their continuation mode —
 * `done` (one-shot, finished) and `standby` (continuable, finished a turn and
 * callable again). A group at or over {@link FOLD_MIN} renders as one
 * aggregate node until the user expands it, so a long-finished fan-out stays
 * one card instead of dozens. A child whose own catalog has not been read
 * contributes one placeholder node standing in for its unread level. Workflow
 * runs hang under the agent that started them, their members re-parented
 * below the run's phase boxes.
 *
 * Labels and secondaries are injected (`labelOf` / `secondaryOf`) so this
 * module stays free of the locale runtime. Pure over its inputs.
 */
import type { SessionId } from '@qilin/session/types'
import type { SubagentAddress } from '@qilin/subagent/client'
import type { CatalogRow, Catalogs } from './rows.ts'

/** Fold threshold: a done or standby group at or over this size renders as one aggregate node. */
export const FOLD_MIN = 6

/** Discriminates what a graph node renders as. */
export type TaskNodeKind =
  | 'main'
  | 'subagent'
  | 'done-agg'
  | 'standby-agg'
  | 'placeholder'
  | 'diagnostic'
  /** One workflow run, hung under the agent that started it. */
  | 'run'
  /** One phase box of a run (members grouped per phase). */
  | 'phase'
  /** A run member without a catalog row, synthesized from the run's own data. */
  | 'member'

/** One session row the model reads. The Session list's summaries satisfy this structurally. */
export interface GraphSummaryEntry {
  readonly id: SessionId
  /** The human-facing label the session is known by. */
  readonly displayTitle: string
  readonly running: boolean
  readonly parentId?: SessionId
  readonly origin?: 'subagent'
}

/** One member of a workflow run phase. */
export interface WorkflowRunMemberRow {
  readonly seq: number
  readonly label: string
  readonly childId: SessionId
  /** The member's settled outcome; absent while it still runs. */
  readonly outcome?: string
}

/** One phase group of a workflow run. */
export interface WorkflowRunPhaseRow {
  /** The phase name; absent for members the run never phased. */
  readonly phase?: string
  readonly members: readonly WorkflowRunMemberRow[]
}

/** One workflow run, as the model hangs it under its origin agent. */
export interface WorkflowRunRow {
  readonly runId: string
  readonly name: string
  /** The Session the run was started from; its node hangs under that agent. */
  readonly originSessionId: SessionId
  readonly running: boolean
  readonly phases: readonly WorkflowRunPhaseRow[]
}

/** One renderable node of the tasks graph. */
export interface TaskNodeVM {
  /** A Session id, a synthesized key (`done:${id}` / `standby:${id}` / `run:` / `phase:` / `placeholder:`), or a member's Session id. */
  readonly id: string
  readonly kind: TaskNodeKind
  /** The parent id; `undefined` for the root. */
  readonly parentId: string | undefined
  /** Nesting level under the root. */
  readonly depth: number
  readonly label: string
  readonly secondary: string
  readonly running: boolean
  /** Whether the node is the Session the page is currently drawing. */
  readonly current: boolean
  /** Subagent nodes only: the address every navigation travels through. */
  readonly address: SubagentAddress | undefined
  /** How many members a placeholder or aggregate node stands in for. */
  readonly childCount: number | undefined
  /** Aggregate nodes only: the key that toggles them in the fold state. */
  readonly aggregateKey: string | undefined
}

/** The built view model: flat pre-order nodes plus the parent→children index. */
export interface TasksGraphModel {
  /** Pre-order: every parent before its children. */
  readonly nodes: readonly TaskNodeVM[]
  /** Visible children per parent id (the root id included). */
  readonly childrenOf: Readonly<Record<string, readonly TaskNodeVM[]>>
}

/** The model's inputs. */
export interface BuildTasksGraphModelInput {
  /** The Session the page draws; the graph's root and main node. */
  readonly rootId: SessionId
  /** Direct-child catalogs keyed by parent Session id. */
  readonly catalogs: Catalogs
  /** Session summaries keyed by id (labels, running state, lineage counts). */
  readonly summaries: Readonly<Record<SessionId, GraphSummaryEntry>>
  /** Aggregate keys currently expanded; the default state is folded. */
  readonly expanded: ReadonlySet<string>
  /** The Session the page highlights as current. */
  readonly currentSessionId: SessionId
  /** Workflow runs, each hung under its origin agent; absent means none. */
  readonly runs?: readonly WorkflowRunRow[]
  /**
   * The display label of one catalog child.
   * @param entry - the catalog's child row.
   * @param summary - the child's summary, when the Session list holds one.
   * @returns the label the node shows.
   */
  readonly labelOf: (entry: Extract<CatalogRow, { kind: 'child' }>, summary: GraphSummaryEntry | undefined) => string
  /**
   * The secondary line of one catalog child.
   * @param entry - the catalog's child row.
   * @returns the secondary the node shows.
   */
  readonly secondaryOf: (entry: Extract<CatalogRow, { kind: 'child' }>) => string
}

/**
 * How many summary children one parent has, for placeholders and subtree
 * counts. The summary lineage reaches children the catalogs have not read,
 * which is exactly the count a placeholder stands in for.
 * @param summaries - Session summaries keyed by id.
 * @param parentId - the parent whose children to count.
 * @returns the number of recorded subagent children.
 */
function summaryChildCount(
  summaries: Readonly<Record<SessionId, GraphSummaryEntry>>,
  parentId: SessionId,
): number {
  let count = 0
  for (const summary of Object.values(summaries)) {
    if (summary.origin === 'subagent' && summary.parentId === parentId) count += 1
  }
  return count
}

/**
 * Build the tasks graph view model.
 *
 * A level is one parent's catalog, siblings in catalog order, and the walk
 * descends only into a child whose own catalog has settled; a child the page
 * has never read contributes one placeholder. The seen set makes a repeated
 * or cyclic catalog an ordinary skip rather than an endless walk.
 * @param input - the model's inputs.
 * @returns pre-order nodes and the parent→children index.
 */
export function buildTasksGraphModel(input: BuildTasksGraphModelInput): TasksGraphModel {
  const {
    rootId, catalogs, summaries, expanded, currentSessionId, runs = [], labelOf, secondaryOf,
  } = input
  const nodes: TaskNodeVM[] = []
  const childrenOf: Record<string, TaskNodeVM[]> = {}
  const seen = new Set<string>()

  /**
   * One catalog-backed subagent node with its subtree attached below it.
   *
   * `parentId` is where the node hangs (a phase box re-parents a real child);
   * `navParent` stays the Session whose catalog the entry came from, because
   * the address every navigation and interrupt travels through must name the
   * real durable parent.
   */
  const buildSubtreeNode = (
    entry: Extract<CatalogRow, { kind: 'child' }>,
    parentId: string,
    navParent: SessionId,
    depth: number,
  ): TaskNodeVM => {
    const node: TaskNodeVM = {
      id: entry.id,
      kind: 'subagent',
      parentId,
      depth,
      label: labelOf(entry, summaries[entry.id]),
      secondary: secondaryOf(entry),
      running: entry.activity === 'running',
      current: entry.id === currentSessionId,
      address: { parentSessionId: navParent, childSessionId: entry.id, mode: entry.mode },
      childCount: entry.hasChildren ? summaryChildCount(summaries, entry.id) : undefined,
      aggregateKey: undefined,
    }
    seen.add(entry.id)
    nodes.push(node)

    const below = catalogs[entry.id]
    // Only a settled catalog proves a level read; an unread or unsettled one
    // stays a placeholder standing in for the summary-recorded children.
    if (entry.hasChildren && below?.state !== 'ready') {
      const placeholder: TaskNodeVM = {
        id: `placeholder:${entry.id}`,
        kind: 'placeholder',
        parentId: entry.id,
        depth: depth + 1,
        label: '',
        secondary: '',
        running: false,
        current: false,
        address: undefined,
        childCount: summaryChildCount(summaries, entry.id),
        aggregateKey: undefined,
      }
      childrenOf[entry.id] = [placeholder]
      nodes.push(placeholder)
    } else if (entry.hasChildren) {
      childrenOf[entry.id] = visit(entry.id, depth + 1)
    }
    return node
  }

  /** One run node, its phase boxes, and their re-parented or synthesized members. */
  const buildRun = (run: WorkflowRunRow, parentId: SessionId, depth: number): TaskNodeVM => {
    const memberCount = run.phases.reduce((sum, phase) => sum + phase.members.length, 0)
    const runNode: TaskNodeVM = {
      id: `run:${run.runId}`,
      kind: 'run',
      parentId,
      depth,
      label: run.name,
      secondary: `${memberCount}`,
      running: run.running,
      current: false,
      address: undefined,
      childCount: memberCount,
      aggregateKey: undefined,
    }
    nodes.push(runNode)
    const runChildren: TaskNodeVM[] = []
    for (const phase of run.phases) {
      const phaseNode: TaskNodeVM = {
        id: `phase:${run.runId}:${phase.phase ?? ''}`,
        kind: 'phase',
        parentId: runNode.id,
        depth: depth + 1,
        label: phase.phase ?? '',
        secondary: `${phase.members.length}`,
        running: false,
        current: false,
        address: undefined,
        childCount: phase.members.length,
        aggregateKey: undefined,
      }
      nodes.push(phaseNode)
      runChildren.push(phaseNode)
      const phaseChildren: TaskNodeVM[] = []
      for (const member of phase.members) {
        const real = catalogs[parentId]?.entries.find(
          (entry): entry is Extract<CatalogRow, { kind: 'child' }> =>
            entry.kind === 'child' && entry.id === member.childId,
        )
        if (real !== undefined) {
          // The real child re-parents under its phase box, subtree intact.
          if (!seen.has(member.childId)) phaseChildren.push(buildSubtreeNode(real, phaseNode.id, parentId, depth + 2))
          continue
        }
        // No catalog row (a settled run, a stale catalog): synthesize from the
        // run's own record.
        const node: TaskNodeVM = {
          id: member.childId,
          kind: 'member',
          parentId: phaseNode.id,
          depth: depth + 2,
          label: member.label,
          secondary: member.outcome ?? '',
          running: member.outcome === undefined,
          current: member.childId === currentSessionId,
          address: { parentSessionId: parentId, childSessionId: member.childId, mode: 'continuable' },
          childCount: undefined,
          aggregateKey: undefined,
        }
        nodes.push(node)
        phaseChildren.push(node)
      }
      childrenOf[phaseNode.id] = phaseChildren
    }
    childrenOf[runNode.id] = runChildren
    return runNode
  }

  /** Walk one parent's catalog into that level's child nodes. */
  const visit = (parentSessionId: SessionId, depth: number): TaskNodeVM[] => {
    const entries = catalogs[parentSessionId]?.entries ?? []
    // Runs this agent started claim their member children out of the normal
    // list; those entries re-parent below the run's phase boxes instead.
    const runsHere = runs.filter(run => run.originSessionId === parentSessionId)
    const claimed = new Set<string>()
    for (const run of runsHere) {
      for (const phase of run.phases) {
        for (const member of phase.members) claimed.add(member.childId)
      }
    }

    const live: Extract<CatalogRow, { kind: 'child' } | { kind: 'diagnostic' }>[] = []
    const done: Extract<CatalogRow, { kind: 'child' }>[] = []
    const standby: Extract<CatalogRow, { kind: 'child' }>[] = []
    for (const entry of entries) {
      if (entry.kind === 'diagnostic') {
        live.push(entry)
        continue
      }
      if (claimed.has(entry.id)) continue
      if (entry.activity === 'running') live.push(entry)
      else if (entry.mode === 'continuable') standby.push(entry)
      else done.push(entry)
    }

    const children: TaskNodeVM[] = []
    for (const entry of live) {
      if (entry.kind === 'diagnostic') {
        // A child the Host could not describe is drawn but never counted and
        // never navigable.
        const node: TaskNodeVM = {
          id: entry.id,
          kind: 'diagnostic',
          parentId: parentSessionId,
          depth,
          label: entry.id,
          secondary: '',
          running: false,
          current: false,
          address: undefined,
          childCount: undefined,
          aggregateKey: undefined,
        }
        seen.add(entry.id)
        children.push(node)
        nodes.push(node)
        continue
      }
      if (seen.has(entry.id)) continue
      children.push(buildSubtreeNode(entry, parentSessionId, parentSessionId, depth))
    }

    // The two folded groups: at or over the threshold one aggregate stands in
    // for the members unless the user expanded its key.
    for (const group of [
      { kind: 'done-agg' as const, entries: done },
      { kind: 'standby-agg' as const, entries: standby },
    ]) {
      const key = `${group.kind}:${parentSessionId}`
      if (group.entries.length < FOLD_MIN || expanded.has(key)) {
        for (const entry of group.entries) {
          if (seen.has(entry.id)) continue
          children.push(buildSubtreeNode(entry, parentSessionId, parentSessionId, depth))
        }
        continue
      }
      const names = group.entries.slice(0, 2).map(entry => labelOf(entry, summaries[entry.id]))
      const node: TaskNodeVM = {
        id: key,
        kind: group.kind,
        parentId: parentSessionId,
        depth,
        label: names.join(' · '),
        secondary: `${group.entries.length}`,
        running: false,
        current: false,
        address: undefined,
        childCount: group.entries.length,
        aggregateKey: key,
      }
      children.push(node)
      nodes.push(node)
    }

    // This agent's runs hang after its subagent rows.
    for (const run of runsHere) children.push(buildRun(run, parentSessionId, depth))

    childrenOf[parentSessionId] = children
    return children
  }

  const rootSummary = summaries[rootId]
  const rootNode: TaskNodeVM = {
    id: rootId,
    kind: 'main',
    parentId: undefined,
    depth: 0,
    label: rootSummary === undefined || rootSummary.displayTitle === '' ? rootId : rootSummary.displayTitle,
    secondary: '',
    running: rootSummary?.running === true,
    current: currentSessionId === rootId,
    address: undefined,
    childCount: undefined,
    aggregateKey: undefined,
  }
  nodes.push(rootNode)
  // The root is always drawn; a descendant catalog naming it again is a cycle,
  // and the seen set is what turns that into an ordinary skip.
  seen.add(rootId)
  childrenOf[rootId] = visit(rootId, 1)

  return { nodes, childrenOf }
}
