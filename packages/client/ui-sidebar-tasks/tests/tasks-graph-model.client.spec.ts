/**
 * The tasks graph's view model: partition, fold, placeholders, and run
 * membership, over hand-built catalogs.
 *
 * Every branch here is user-visible structure — which cards exist, what each
 * says, and where it hangs — so the specs pin the model's output nodes rather
 * than internals.
 */
import { describe, expect, it } from 'vitest'
import type { SessionId } from '@qilin-agent/session/types'
import type { SubagentAddress } from '@qilin-agent/subagent/client'
import { catalog, child, diagnostic, sid } from './fixtures.client.ts'
import type { GraphSummaryEntry } from '../src/client/tasks-graph-model.ts'
import { FOLD_MIN, buildTasksGraphModel } from '../src/client/tasks-graph-model.ts'
import type { Catalogs } from '../src/client/rows.ts'

/** The page's root Session, as every spec here draws it. */
const ROOT = sid('s-root')
/** One labeler matching the page's: label, then display title, then id. */
const labelOf = (entry: { readonly id: SessionId; readonly label?: string | undefined }, summary: GraphSummaryEntry | undefined): string =>
  entry.label ?? summary?.displayTitle ?? entry.id
/** One secondary labeler matching the page's: the continuation-mode word. */
const secondaryOf = (entry: { readonly mode: 'one-shot' | 'continuable' | 'external' }): string =>
  entry.mode === 'one-shot' ? '一次性' : '持续'

/**
 * One model build with the page's own labelers.
 * @param catalogs - direct-child catalogs by parent id.
 * @param options - summaries, expansion state, current Session, and runs.
 * @returns the built model.
 */
function build(
  catalogs: Catalogs,
  options: {
    summaries?: Readonly<Record<SessionId, GraphSummaryEntry>>
    expanded?: ReadonlySet<string>
    current?: SessionId
    runs?: Parameters<typeof buildTasksGraphModel>[0]['runs']
  } = {},
) {
  return buildTasksGraphModel({
    rootId: ROOT,
    catalogs,
    summaries: options.summaries ?? {},
    expanded: options.expanded ?? new Set<string>(),
    currentSessionId: options.current ?? ROOT,
    ...(options.runs === undefined ? {} : { runs: options.runs }),
    labelOf: labelOf,
    secondaryOf: secondaryOf as Parameters<typeof buildTasksGraphModel>[0]['secondaryOf'],
  })
}

/**
 * One Session summary row.
 * @param id - the Session.
 * @param displayTitle - its display title.
 * @param options - lineage and liveness.
 * @returns the summary entry.
 */
function summary(
  id: string,
  displayTitle: string,
  options: { parent?: string; origin?: 'subagent'; running?: boolean } = {},
): [SessionId, GraphSummaryEntry] {
  return [sid(id), {
    id: sid(id),
    displayTitle,
    running: options.running ?? false,
    ...(options.parent === undefined ? {} : { parentId: sid(options.parent) }),
    ...(options.origin === undefined ? {} : { origin: options.origin }),
  }]
}

describe('FOLD_MIN', () => {
  it('folds at six members', () => {
    expect(FOLD_MIN).toBe(6)
  })
})

describe('buildTasksGraphModel root', () => {
  it('names the main node after the summary display title', () => {
    const model = build({}, { summaries: Object.fromEntries([summary('s-root', '主会话')]) })
    expect(model.nodes[0]).toMatchObject({ id: ROOT, kind: 'main', depth: 0, label: '主会话', running: false, current: true })
    expect(model.nodes[0]?.parentId).toBeUndefined()
    expect(model.childrenOf[ROOT]).toEqual([])
  })

  it('falls back to the id when the summary is missing or its title is blank', () => {
    const untitled = build({}, { summaries: Object.fromEntries([summary('s-root', '')]) })
    expect(untitled.nodes[0]?.label).toBe(ROOT)
    const unknown = build({})
    expect(unknown.nodes[0]?.label).toBe(ROOT)
  })

  it('marks the main node running only while the summary says so', () => {
    const model = build({}, {
      summaries: Object.fromEntries([summary('s-root', 'R', { running: true })]),
      current: sid('s-other'),
    })
    expect(model.nodes[0]).toMatchObject({ running: true, current: false })
  })
})

describe('buildTasksGraphModel levels', () => {
  it('draws one subagent node per running child with its catalog address', () => {
    const model = build({ [ROOT]: catalog([child('c1', { activity: 'running', label: 'Runner' })]) })
    expect(model.nodes[1]).toMatchObject({
      id: sid('c1'), kind: 'subagent', parentId: ROOT, depth: 1,
      label: 'Runner', secondary: '持续', running: true, current: false,
      childCount: undefined, aggregateKey: undefined,
    })
    const address = model.nodes[1]?.address as SubagentAddress
    expect(address).toEqual({ parentSessionId: ROOT, childSessionId: sid('c1'), mode: 'continuable' })
    expect(model.childrenOf[ROOT]).toHaveLength(1)
  })

  it('labels an unlabeled child from its summary title, then its id', () => {
    const titled = build(
      { [ROOT]: catalog([child('c1', { mode: 'one-shot' })]) },
      { summaries: Object.fromEntries([summary('c1', 'Researcher')]) },
    )
    expect(titled.nodes[1]?.label).toBe('Researcher')
    const bare = build({ [ROOT]: catalog([child('c1', { mode: 'one-shot', label: undefined })]) })
    expect(bare.nodes[1]?.label).toBe(sid('c1'))
  })

  it('draws a diagnostic row without an address and without counting it', () => {
    const model = build({ [ROOT]: catalog([diagnostic('d1')]) })
    expect(model.nodes[1]).toMatchObject({
      id: sid('d1'), kind: 'diagnostic', parentId: ROOT, label: sid('d1'), address: undefined,
    })
  })

  it('marks the current child', () => {
    const model = build(
      { [ROOT]: catalog([child('c1', { activity: 'running' })]) },
      { current: sid('c1') },
    )
    expect(model.nodes[1]?.current).toBe(true)
  })

  it('descends into a child whose catalog has settled', () => {
    const model = build({
      [ROOT]: catalog([child('c1', { activity: 'running', hasChildren: true })]),
      [sid('c1')]: catalog([child('g1', { mode: 'one-shot' })]),
    })
    const grand = model.nodes[2]
    expect(grand).toMatchObject({ id: sid('g1'), parentId: sid('c1'), depth: 2 })
    expect(model.childrenOf[sid('c1')]).toEqual([grand])
  })

  it('stands one placeholder in for an unread level, counted from summaries', () => {
    const model = build(
      { [ROOT]: catalog([child('c1', { hasChildren: true })]) },
      {
        summaries: Object.fromEntries([
          summary('g1', 'G1', { parent: 'c1', origin: 'subagent' }),
          summary('g2', 'G2', { parent: 'c1', origin: 'subagent' }),
          // Not a subagent child of c1: never counted.
          summary('x9', 'X', { parent: 'elsewhere', origin: 'subagent' }),
        ]),
      },
    )
    expect(model.nodes[1]).toMatchObject({ id: sid('c1'), childCount: 2 })
    expect(model.nodes[2]).toMatchObject({
      id: `placeholder:${sid('c1')}`, kind: 'placeholder', parentId: sid('c1'), depth: 2,
      label: '', running: false, childCount: 2, address: undefined,
    })
    expect(model.childrenOf[sid('c1')]).toEqual([model.nodes[2]])
  })

  it('stands a zero-count placeholder for a has-children child the summaries do not know', () => {
    const model = build({
      [ROOT]: catalog([child('c1', { hasChildren: true })]),
      [sid('c1')]: catalog([], 'loading'),
    })
    expect(model.nodes[2]).toMatchObject({ kind: 'placeholder', childCount: 0 })
  })
})

describe('buildTasksGraphModel folding', () => {
  /** One done group of the given size. */
  function doneCatalog(size: number) {
    return catalog(Array.from({ length: size }, (_, index) => child(`d${index}`, { mode: 'one-shot' })))
  }

  it('keeps a small group as individual cards', () => {
    const model = build({ [ROOT]: doneCatalog(FOLD_MIN - 1) })
    expect(model.nodes.slice(1).map(node => node.kind)).toEqual(Array.from({ length: FOLD_MIN - 1 }, () => 'subagent'))
  })

  it('folds a group at the threshold into one aggregate naming its first two members', () => {
    const model = build(
      { [ROOT]: doneCatalog(FOLD_MIN) },
      { summaries: Object.fromEntries([summary('d0', 'Alpha'), summary('d1', 'Beta')]) },
    )
    expect(model.nodes[1]).toMatchObject({
      id: `done-agg:${ROOT}`, kind: 'done-agg', parentId: ROOT, depth: 1,
      label: 'Alpha · Beta', secondary: `${FOLD_MIN}`, childCount: FOLD_MIN,
      aggregateKey: `done-agg:${ROOT}`, running: false, address: undefined,
    })
    expect(model.childrenOf[ROOT]).toHaveLength(1)
  })

  it('folds standby members into their own aggregate', () => {
    const entries = Array.from({ length: FOLD_MIN }, (_, index) => child(`w${index}`, { mode: 'continuable' }))
    const model = build({ [ROOT]: catalog(entries) })
    expect(model.nodes[1]).toMatchObject({ kind: 'standby-agg', id: `standby-agg:${ROOT}`, childCount: FOLD_MIN })
  })

  it('unfolds one group while the user expanded its key', () => {
    const model = build(
      { [ROOT]: doneCatalog(FOLD_MIN) },
      { expanded: new Set([`done-agg:${ROOT}`]) },
    )
    expect(model.nodes.slice(1).map(node => node.kind)).toEqual(Array.from({ length: FOLD_MIN }, () => 'subagent'))
    expect(model.nodes[1]?.aggregateKey).toBeUndefined()
  })
})

describe('buildTasksGraphModel cycles', () => {
  it('skips a child the walk has already drawn, so a cyclic catalog ends', () => {
    const model = build({
      [ROOT]: catalog([child('c1', { activity: 'running', hasChildren: true })]),
      [sid('c1')]: catalog([child('s-root', { activity: 'running' })]),
    })
    expect(model.nodes.map(node => node.id)).toEqual([ROOT, sid('c1')])
    expect(model.childrenOf[sid('c1')]).toEqual([])
  })

  it('draws a repeating entry once when one catalog names it twice', () => {
    const twice = catalog([child('c1', { activity: 'running' }), child('c1', { activity: 'running' })])
    const model = build({ [ROOT]: twice })
    expect(model.childrenOf[ROOT]).toHaveLength(1)
  })
})

describe('buildTasksGraphModel ordering', () => {
  it('orders a level live, done fold, standby fold, then runs', () => {
    const entries = [
      diagnostic('d9'),
      child('live1', { activity: 'running' }),
      ...Array.from({ length: FOLD_MIN }, (_, index) => child(`d${index}`, { mode: 'one-shot' })),
      ...Array.from({ length: FOLD_MIN }, (_, index) => child(`w${index}`, { mode: 'continuable' })),
    ]
    const model = build(
      { [ROOT]: catalog(entries) },
      {
        runs: [{
          runId: 'r1', name: 'Pipeline', originSessionId: ROOT, running: true,
          phases: [{ phase: 'plan', members: [{ seq: 0, label: 'P', childId: sid('m1') }] }],
        }],
      },
    )
    expect(model.childrenOf[ROOT]!.map(node => node.kind)).toEqual([
      'diagnostic', 'subagent', 'done-agg', 'standby-agg', 'run',
    ])
  })
})

describe('buildTasksGraphModel runs', () => {
  it('hangs a run with its phase boxes under its origin agent', () => {
    const model = build(
      { [ROOT]: catalog([]) },
      {
        runs: [{
          runId: 'r1', name: 'Pipeline', originSessionId: ROOT, running: true,
          phases: [
            { phase: 'plan', members: [{ seq: 0, label: 'P', childId: sid('m1') }] },
            { members: [{ seq: 1, label: 'Q', childId: sid('m2'), outcome: 'ok' }] },
          ],
        }],
      },
    )
    // Pre-order: each phase box precedes its own members.
    const [run, planned, first, unphased, second] = model.nodes.slice(1)
    expect(run).toMatchObject({
      id: 'run:r1', kind: 'run', parentId: ROOT, depth: 1, label: 'Pipeline',
      secondary: '2', childCount: 2, running: true,
    })
    expect(planned).toMatchObject({
      id: 'phase:r1:plan', kind: 'phase', parentId: 'run:r1', depth: 2,
      label: 'plan', secondary: '1', childCount: 1, running: false,
    })
    expect(unphased).toMatchObject({ id: 'phase:r1:', label: '', depth: 2 })
    expect(first).toMatchObject({
      id: sid('m1'), kind: 'member', parentId: 'phase:r1:plan', depth: 3,
      label: 'P', secondary: '', running: true,
    })
    expect(second).toMatchObject({
      id: sid('m2'), kind: 'member', parentId: 'phase:r1:', secondary: 'ok', running: false,
    })
    const address = second?.address as SubagentAddress
    expect(address).toEqual({ parentSessionId: ROOT, childSessionId: sid('m2'), mode: 'continuable' })
    expect(model.childrenOf['run:r1']).toEqual([planned, unphased])
    expect(model.childrenOf['phase:r1:plan']).toEqual([first])
  })

  it('claims a run member out of the normal list and re-parents it under its phase box', () => {
    const model = build(
      { [ROOT]: catalog([child('m1', { activity: 'running', hasChildren: true })]) },
      {
        summaries: Object.fromEntries([summary('g1', 'G1', { parent: 'm1', origin: 'subagent' })]),
        runs: [{
          runId: 'r1', name: 'Pipeline', originSessionId: ROOT, running: true,
          phases: [{ phase: 'plan', members: [{ seq: 0, label: 'M1', childId: sid('m1') }] }],
        }],
      },
    )
    // The member keeps its catalog subtree but hangs under the phase box, and
    // its address still names the real durable parent.
    expect(model.childrenOf[ROOT]!.map(node => node.id)).toEqual(['run:r1'])
    // Pre-order: run, phase box, the re-parented member, its unread level.
    const member = model.nodes[3]
    expect(member).toMatchObject({ id: sid('m1'), parentId: 'phase:r1:plan', depth: 3, childCount: 1 })
    expect(member?.address).toMatchObject({ parentSessionId: ROOT })
    expect(model.childrenOf[sid('m1')]?.[0]).toMatchObject({ kind: 'placeholder' })
  })

  it('skips a member a folded group already drew when the group is expanded', () => {
    const twice = catalog([
      child('d0', { mode: 'one-shot' }),
      child('d0', { mode: 'one-shot' }),
      ...Array.from({ length: FOLD_MIN - 1 }, (_, index) => child(`d${index + 1}`, { mode: 'one-shot' })),
    ])
    const model = build({ [ROOT]: twice }, { expanded: new Set(['done-agg:s-root']) })
    expect(model.nodes.filter(node => node.id === sid('d0'))).toHaveLength(1)
  })

  it('draws a member that appears in two phases once, under the first', () => {
    const model = build(
      { [ROOT]: catalog([child('m1', { activity: 'running' })]) },
      {
        runs: [{
          runId: 'r1', name: 'Pipeline', originSessionId: ROOT, running: true,
          phases: [
            { phase: 'plan', members: [{ seq: 0, label: 'M1', childId: sid('m1') }] },
            { phase: 'act', members: [{ seq: 1, label: 'M1 again', childId: sid('m1') }] },
          ],
        }],
      },
    )
    expect(model.nodes.filter(node => node.id === sid('m1'))).toHaveLength(1)
    expect(model.childrenOf['phase:r1:act']).toEqual([])
  })
})
