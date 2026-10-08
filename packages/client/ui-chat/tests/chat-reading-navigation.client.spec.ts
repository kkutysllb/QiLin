// @vitest-environment jsdom

import { expect, it, onTestFinished, vi, type Mock } from 'vitest'
import type { ChatScrollPosition, ChatViewSlotProps } from '../src/client/contract/slots.ts'
import { ChatNavigation, type ChatNavigationInput } from '../src/client/chat/use-chat-navigation.ts'
import { ChatReading, type ChatReadingState } from '../src/client/chat/use-chat-reading.ts'
import { ChatViewport } from '../src/client/chat/use-chat-viewport.ts'
import { ScrollFollow } from '../src/client/chat/use-scroll-follow.ts'
import { SessionSeq } from '@qilin-agent/session/types'

type PositionStore = ChatViewSlotProps['chatScroll']
// use-chat-reading composes its follower at FOLLOW_THRESHOLD + 1.
const FOLLOW_THRESHOLD = 25

interface World {
  readonly column: HTMLElement
  readonly viewport: ChatViewport
  readonly reading: ChatReading
  readonly navigation: ChatNavigation
  readonly states: ChatReadingState[]
  readonly store: { saved: ChatScrollPosition | null }
  readonly loadThrough: Mock<(seq: number) => Promise<void>>
  readonly loadOlder: Mock<() => void>
  readonly busy: () => number | null
  setRows: (rows: ReadonlyArray<{ key: string; top: number; turn: number }>) => void
  updateTurns: (turns: ReadonlyArray<{ turn: number; anchorKey: string }>) => void
  setInput: (next: Partial<ChatNavigationInput>) => void
  notifyResize: () => void
  readerScroll: (top: number, options?: { settle?: boolean }) => void
  deliverScroll: () => void
}

/**
 * One real ChatViewport + ChatReading + ChatNavigation stack over fake scroll
 * geometry, wired as use-chat-scroll wires them: deliveries feed reading
 * policy, settled samples feed the navigation owner, resize drives both.
 */
function makeWorld(init: {
  readonly saved?: ChatScrollPosition | null
  readonly loadingOlder?: boolean
  readonly hasMore?: boolean
} = {}): World {
  const column = document.createElement('div')
  document.body.append(column)
  const viewport = new ChatViewport()
  let notifyResize: (() => void) | undefined
  class ResizeObserverStub {
    constructor(callback: ResizeObserverCallback) {
      notifyResize = () => { callback([], this) }
    }
    observe = vi.fn()
    disconnect = vi.fn()
    unobserve = vi.fn()
  }
  vi.stubGlobal('ResizeObserver', ResizeObserverStub)
  Object.defineProperties(column, {
    clientHeight: { configurable: true, value: 300 },
    scrollHeight: { configurable: true, value: 2_000 },
  })
  vi.spyOn(column, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 500, 300))
  // Deterministic anchor fallback: the hit-test finds nothing, so captured
  // positions resolve from the mounted rows.
  const hitTest = Object.getOwnPropertyDescriptor(document, 'elementsFromPoint')
  Object.defineProperty(document, 'elementsFromPoint', { configurable: true, value: undefined })

  const store = { saved: init.saved ?? null }
  const positionStore: PositionStore = {
    save: (position) => { store.saved = position },
    read: () => store.saved,
  }
  const states: ChatReadingState[] = []
  let latest: ChatReadingState = {
    initialized: false,
    followingTail: store.saved === null,
    activeTurn: null,
  }
  const reading = new ChatReading(
    viewport,
    positionStore,
    latest,
    (next) => { latest = next; states.push(next) },
    new ScrollFollow(latest.followingTail, FOLLOW_THRESHOLD),
  )
  const loadOlder = vi.fn<() => void>()
  const loadThrough = vi.fn<(seq: number) => Promise<void>>().mockResolvedValue(undefined)
  let input: ChatNavigationInput = {
    firstSeq: null, hasMore: init.hasMore ?? false, loadingOlder: init.loadingOlder ?? false,
    loadOlder, loadThrough,
  }
  let busy: number | null = null
  const navigation = new ChatNavigation(viewport, reading, input, (turn) => { busy = turn })
  // Attach before connecting business events: attach's internal detach clears
  // any wiring an earlier connect installed.
  viewport.attach(column, column)
  const disconnectViewport = viewport.connect({
    scroll: (scroll) => { reading.onScroll(scroll) },
    scrollEnd: () => { reading.onScrollEnd(); navigation.readerSettled() },
    interact: () => { navigation.cancel() },
    resize: () => {
      if (!navigation.contentCommitted()) reading.onResize()
      navigation.reconcile()
    },
  })
  const disconnectReading = reading.connect((sample) => { navigation.readerSampled(sample) })

  let rowTops = new Map<string, number>()
  const rows = new Map<string, HTMLElement>()
  function layoutRows(): void {
    for (const [key, element] of rows) {
      const top = rowTops.get(key) ?? 0
      vi.spyOn(element, 'getBoundingClientRect').mockImplementation(
        () => new DOMRect(0, top - column.scrollTop, 500, 60),
      )
    }
  }

  onTestFinished(() => {
    navigation.dispose()
    reading.dispose()
    disconnectViewport()
    disconnectReading()
    // A second disposer call is a no-op, not a crash.
    disconnectReading()
    viewport.detach()
    column.remove()
    if (hitTest === undefined) Reflect.deleteProperty(document, 'elementsFromPoint')
    else Object.defineProperty(document, 'elementsFromPoint', hitTest)
    vi.restoreAllMocks()
  })

  return {
    column,
    viewport,
    reading,
    navigation,
    states,
    store,
    loadThrough,
    loadOlder,
    busy: () => busy,
    setRows(list) {
      for (const element of rows.values()) element.remove()
      rows.clear()
      rowTops = new Map(list.map(row => [row.key, row.top]))
      for (const row of list) {
        const element = document.createElement('div')
        element.textContent = row.key
        element.dataset.chatAnchorKey = row.key
        element.dataset.chatNodeKey = row.key
        element.dataset.chatFlowKey = row.key
        element.dataset.chatTurn = String(row.turn)
        element.dataset.chatPagingAnchor = ''
        column.append(element)
        rows.set(row.key, element)
      }
      layoutRows()
    },
    updateTurns(turns) {
      viewport.updateTurns(turns.map(item => ({ ...item, prompt: '', response: '' })))
    },
    setInput(next) {
      input = { ...input, ...next }
      navigation.setInput(input)
    },
    notifyResize: () => { notifyResize?.() },
    readerScroll(top, options) {
      column.dispatchEvent(new Event('wheel'))
      column.scrollTop = top
      column.dispatchEvent(new Event('scroll'))
      if (options?.settle === false) return
      column.dispatchEvent(new Event('scrollend'))
    },
    deliverScroll: () => { column.dispatchEvent(new Event('scroll')) },
  }
}

function unloaded(item: { turn: number; seq: number }): {
  turn: number
  prompt: string
  response: string
  anchor: { kind: 'unloaded'; seq: ReturnType<typeof SessionSeq> }
} {
  return { turn: item.turn, prompt: '', response: '', anchor: { kind: 'unloaded', seq: SessionSeq(item.seq) } }
}

function loaded(item: { turn: number; key: string }): {
  turn: number
  prompt: string
  response: string
  anchor: { kind: 'loaded'; key: string }
} {
  return { turn: item.turn, prompt: '', response: '', anchor: { kind: 'loaded', key: item.key } }
}

const jumpWorld = () => {
  const world = makeWorld({ hasMore: true })
  world.setRows([{ key: 'turn-1', top: 0, turn: 1 }])
  world.updateTurns([{ turn: 1, anchorKey: 'turn-1' }])
  return world
}

async function settleJumpFrame(): Promise<void> {
  await new Promise((resolve) => { requestAnimationFrame(() => { resolve(null) }) })
}

async function act(body: () => void | Promise<void>): Promise<void> {
  await body()
  await Promise.resolve()
}

it('a loaded rail mark jumps the reader away from the tail and names its Turn active', () => {
  const world = makeWorld()
  world.setRows([
    { key: 'turn-1', top: 0, turn: 1 },
    { key: 'turn-2', top: 600, turn: 2 },
  ])
  world.updateTurns([{ turn: 1, anchorKey: 'turn-1' }, { turn: 2, anchorKey: 'turn-2' }])
  world.readerScroll(100)

  world.navigation.navigateToTurn(loaded({ turn: 2, key: 'turn-2' }))

  expect(world.column.scrollTop).toBe(576)
  expect(world.states.at(-1)?.followingTail).toBe(false)
  expect(world.states.at(-1)?.activeTurn).toBe(2)
  expect(world.busy()).toBeNull()
})

it('a loaded jump during a plain pull anchors the landing for the pending prepend', () => {
  const world = makeWorld({ loadingOlder: true })
  world.setRows([
    { key: 'turn-1', top: 0, turn: 1 },
    { key: 'turn-2', top: 600, turn: 2 },
  ])
  world.updateTurns([{ turn: 1, anchorKey: 'turn-1' }, { turn: 2, anchorKey: 'turn-2' }])

  world.navigation.navigateToTurn(loaded({ turn: 2, key: 'turn-2' }))

  expect(world.navigation.contentCommitted()).toBe(true)
})

it('loadEarlier hands the pull to the session and releases bottom follow', () => {
  const world = makeWorld()
  world.setRows([{ key: 'turn-1', top: 0, turn: 1 }])
  world.updateTurns([{ turn: 1, anchorKey: 'turn-1' }])

  world.navigation.loadEarlier()

  expect(world.loadOlder).toHaveBeenCalledTimes(1)
  expect(world.states.at(-1)?.followingTail).toBe(false)
  expect(world.navigation.contentCommitted()).toBe(true)
})

it('a settled reader row re-anchors across the pending pull', () => {
  const world = makeWorld({ loadingOlder: true })
  world.setRows([{ key: 'turn-1', top: 100, turn: 1 }])
  world.updateTurns([{ turn: 1, anchorKey: 'turn-1' }])
  world.readerScroll(100)

  world.navigation.readerSettled()
  // The prepend arrives: the browser compensates the scroll by most of the
  // inserted height, and the retained row returns to its reader offset.
  world.setRows([
    { key: 'page-0', top: 0, turn: 0 },
    { key: 'turn-1', top: 180, turn: 1 },
  ])
  world.column.scrollTop = 160

  expect(world.navigation.contentCommitted()).toBe(true)
  expect(world.column.scrollTop).toBe(180)
})

it('a pull whose anchor row left the transcript releases the pager', () => {
  const world = makeWorld({ loadingOlder: true })
  world.setRows([{ key: 'turn-1', top: 100, turn: 1 }])
  world.updateTurns([{ turn: 1, anchorKey: 'turn-1' }])
  world.readerScroll(100)
  world.navigation.readerSettled()

  world.column.replaceChildren()
  expect(world.navigation.contentCommitted()).toBe(false)
  expect(world.navigation.contentCommitted()).toBe(false)
})

it('a settled jump waits for the pager to finish before it lands', async () => {
  const world = jumpWorld()
  let release: (() => void) | undefined
  world.loadThrough.mockImplementation(() => new Promise<void>((resolve) => { release = resolve }))

  world.navigation.navigateToTurn(unloaded({ turn: 2, seq: 9 }))
  expect(world.busy()).toBe(2)

  // The paged rows commit while the pull still owns the pager.
  world.setRows([
    { key: 'turn-1', top: 0, turn: 1 },
    { key: 'turn-2', top: 600, turn: 2 },
  ])
  world.updateTurns([{ turn: 1, anchorKey: 'turn-1' }, { turn: 2, anchorKey: 'turn-2' }])
  world.setInput({ loadingOlder: true })
  await act(async () => { release?.() })
  await settleJumpFrame()
  expect(world.busy()).toBe(2)

  world.setInput({ loadingOlder: false })
  world.navigation.reconcile()
  expect(world.busy()).toBeNull()
  expect(world.column.scrollTop).toBe(576)
})

it('a reader who scrolls away mid-jump cancels the settled jump instead of dragging back', async () => {
  const world = jumpWorld()
  let release: (() => void) | undefined
  world.loadThrough.mockImplementation(() => new Promise<void>((resolve) => { release = resolve }))

  world.navigation.navigateToTurn(unloaded({ turn: 2, seq: 9 }))
  expect(world.busy()).toBe(2)
  // The paged rows commit and the jump lands, still busy until settlement.
  world.setRows([
    { key: 'turn-1', top: 0, turn: 1 },
    { key: 'turn-2', top: 600, turn: 2 },
  ])
  world.updateTurns([{ turn: 1, anchorKey: 'turn-1' }, { turn: 2, anchorKey: 'turn-2' }])
  expect(world.navigation.contentCommitted()).toBe(true)
  expect(world.column.scrollTop).toBe(576)
  expect(world.busy()).toBe(2)

  // The reader takes over: settlement must not drag them back to the jump.
  world.readerScroll(300)
  // ...and returns to the floor: the follow sample releases the pager too.
  world.readerScroll(1_700)
  await act(async () => { release?.() })
  await settleJumpFrame()
  expect(world.busy()).toBeNull()
  expect(world.column.scrollTop).toBe(1_700)
  expect(world.states.at(-1)?.activeTurn).toBe(2)
})

it('a pending reading sample defers jump reconciliation without landing', async () => {
  const world = jumpWorld()
  let release: (() => void) | undefined
  world.loadThrough.mockImplementation(() => new Promise<void>((resolve) => { release = resolve }))

  // Reader movement arms a sample...
  world.readerScroll(400, { settle: false })
  // ...then an unloaded jump issues while that sample is still unsettled:
  // the resize-driven reconciliation must wait for the reading sample.
  world.navigation.navigateToTurn(unloaded({ turn: 2, seq: 9 }))
  world.notifyResize()
  await settleJumpFrame()
  expect(world.busy()).toBe(2)

  await act(async () => { release?.() })
  void release
})

it('a stale load completion cannot land a replaced jump', async () => {
  const world = jumpWorld()
  let release: (() => void) | undefined
  world.loadThrough.mockImplementation(() => new Promise<void>((resolve) => { release = resolve }))
  world.navigation.navigateToTurn(unloaded({ turn: 2, seq: 9 }))

  // A second selection replaces the first jump; its completion is stale.
  world.navigation.navigateToTurn(loaded({ turn: 1, key: 'turn-1' }))
  expect(world.busy()).toBeNull()
  expect(world.column.scrollTop).toBe(0)
  await act(async () => { release?.() })
  await settleJumpFrame()
  expect(world.busy()).toBeNull()
  expect(world.column.scrollTop).toBe(0)
})

it('a jump settles synchronously when no frame loop exists', async () => {
  const world = jumpWorld()
  world.setRows([
    { key: 'turn-1', top: 0, turn: 1 },
    { key: 'turn-2', top: 600, turn: 2 },
  ])
  world.updateTurns([{ turn: 1, anchorKey: 'turn-1' }, { turn: 2, anchorKey: 'turn-2' }])
  vi.stubGlobal('requestAnimationFrame', undefined)
  try {
    world.navigation.navigateToTurn(unloaded({ turn: 2, seq: 9 }))
    await act(async () => {})
    expect(world.busy()).toBeNull()
    expect(world.column.scrollTop).toBe(576)
  } finally {
    vi.unstubAllGlobals()
  }
})

it('a reader arriving back at the floor re-pins the tail immediately', () => {
  const world = jumpWorld()
  world.readerScroll(600)
  expect(world.states.at(-1)?.followingTail).toBe(false)

  world.readerScroll(1_700)
  expect(world.states.at(-1)?.followingTail).toBe(true)
  expect(world.store.saved).toBeNull()
})

it('a reopen with an empty scroll memory follows the tail', () => {
  const world = makeWorld()
  world.setRows([{ key: 'turn-1', top: 0, turn: 1 }])
  world.updateTurns([{ turn: 1, anchorKey: 'turn-1' }])

  world.reading.restore()

  expect(world.states.at(-1)?.followingTail).toBe(true)
  expect(world.store.saved).toBeNull()
})

it('a reopen whose saved row vanished falls back to the raw top and re-anchors', async () => {
  const world = makeWorld({ saved: { anchorKey: 'ghost-row', anchorTop: 40, scrollTop: 800 } })
  world.setRows([{ key: 'turn-1', top: 0, turn: 1 }])
  world.updateTurns([{ turn: 1, anchorKey: 'turn-1' }])

  world.reading.restore()
  await settleJumpFrame()

  expect(world.column.scrollTop).toBe(800)
  expect(world.states.at(-1)?.followingTail).toBe(false)
  expect(world.store.saved?.anchorKey).toBe('turn-1')
  expect(world.states.at(-1)?.activeTurn).toBe(1)
})

it('unmount order leaves trailing policy calls dead but harmless', async () => {
  const world = makeWorld()
  world.setRows([{ key: 'turn-1', top: 0, turn: 1 }])
  world.readerScroll(100)
  world.viewport.detach()
  const before = world.states.length

  world.reading.followTail()
  world.reading.restore()
  world.reading.refreshActiveTurn()
  await settleJumpFrame()

  expect(world.states.length).toBe(before)
})

it('the reading-line probe skips stale frames and pending samples', async () => {
  const world = jumpWorld()
  world.setRows([
    { key: 'turn-1', top: 0, turn: 1 },
    { key: 'turn-2', top: 600, turn: 2 },
  ])
  world.updateTurns([{ turn: 1, anchorKey: 'turn-1' }, { turn: 2, anchorKey: 'turn-2' }])
  world.readerScroll(300)
  world.reading.refreshActiveTurn()
  // A second request inside the pending frame is dropped.
  world.reading.refreshActiveTurn()
  // A reader movement still awaiting its sample makes the frame a no-op.
  world.readerScroll(320, { settle: false })
  await settleJumpFrame()
  world.column.dispatchEvent(new Event('scrollend'))
  expect(world.states.at(-1)?.activeTurn).toBe(1)
})

it('a reading-line probe resolves synchronously when no frame loop exists', () => {
  const world = jumpWorld()
  world.setRows([
    { key: 'turn-1', top: 0, turn: 1 },
    { key: 'turn-2', top: 600, turn: 2 },
  ])
  world.updateTurns([{ turn: 1, anchorKey: 'turn-1' }, { turn: 2, anchorKey: 'turn-2' }])
  world.readerScroll(300)
  vi.stubGlobal('requestAnimationFrame', undefined)
  try {
    world.reading.refreshActiveTurn()
  } finally {
    vi.unstubAllGlobals()
  }
  expect(world.states.at(-1)?.activeTurn).toBe(1)
})

it('a refresh requested during a pending sample defers to the settled reading', () => {
  const world = jumpWorld()
  world.readerScroll(300, { settle: false })
  const before = world.states.length

  world.reading.refreshActiveTurn()
  expect(world.states.length).toBe(before)

  world.column.dispatchEvent(new Event('scrollend'))
  expect(world.states.at(-1)?.activeTurn).toBe(1)
})

it('a loaded mark whose rows are gone cannot jump', () => {
  const world = jumpWorld()
  const before = world.states.length

  world.navigation.navigateToTurn(loaded({ turn: 3, key: 'ghost-row' }))

  expect(world.busy()).toBeNull()
  expect(world.states.length).toBe(before)
})

it("the pager's content commit lands the pending jump while its load is in flight", async () => {
  const world = jumpWorld()
  let release: (() => void) | undefined
  world.loadThrough.mockImplementation(() => new Promise<void>((resolve) => { release = resolve }))
  world.navigation.navigateToTurn(unloaded({ turn: 2, seq: 9 }))

  world.setRows([
    { key: 'turn-1', top: 0, turn: 1 },
    { key: 'turn-2', top: 600, turn: 2 },
  ])
  world.updateTurns([{ turn: 1, anchorKey: 'turn-1' }, { turn: 2, anchorKey: 'turn-2' }])
  world.navigation.reconcile()

  expect(world.column.scrollTop).toBe(576)
  expect(world.busy()).toBe(2)
  await act(async () => { release?.() })
})

it('a second commit re-anchors the landed jump for later growth', () => {
  const world = jumpWorld()
  world.navigation.navigateToTurn(unloaded({ turn: 2, seq: 9 }))
  world.setRows([
    { key: 'turn-1', top: 0, turn: 1 },
    { key: 'turn-2', top: 600, turn: 2 },
  ])
  world.updateTurns([{ turn: 1, anchorKey: 'turn-1' }, { turn: 2, anchorKey: 'turn-2' }])
  expect(world.navigation.contentCommitted()).toBe(true)

  // A later size change re-runs the landing: the jump keeps its anchor and
  // the pager stays owned for whatever prepends follow.
  expect(world.navigation.contentCommitted()).toBe(true)
  expect(world.column.scrollTop).toBe(576)
  expect(world.busy()).toBe(2)
})

it('following tail ownership re-resolves the reading line without a probe', () => {
  const world = jumpWorld()
  world.readerScroll(1_700)

  world.reading.refreshActiveTurn()

  expect(world.states.at(-1)?.followingTail).toBe(true)
  expect(world.states.at(-1)?.activeTurn).toBe(1)
})

it('a layout delivery without movement neither re-saves nor disturbs the reader row', () => {
  const world = jumpWorld()
  world.readerScroll(600)
  const saved = world.store.saved

  // Compositor churn re-delivers scroll at an unchanged top with no input.
  world.column.dispatchEvent(new Event('scroll'))
  world.column.dispatchEvent(new Event('scrollend'))

  expect(world.column.scrollTop).toBe(600)
  expect(world.store.saved).toBe(saved)
})

it('resize handling defers to the pending sample', () => {
  const world = jumpWorld()
  world.setRows([{ key: 'turn-1', top: 0, turn: 1 }])
  world.readerScroll(300, { settle: false })

  world.notifyResize()
  expect(world.column.scrollTop).toBe(300)

  world.column.dispatchEvent(new Event('scrollend'))
  expect(world.store.saved?.anchorKey).toBe('turn-1')
})

it('a resize that moved the reader row restores it from the sampled offset', () => {
  const world = makeWorld({ loadingOlder: true })
  world.setRows([{ key: 'turn-1', top: 100, turn: 1 }])
  world.updateTurns([{ turn: 1, anchorKey: 'turn-1' }])
  world.readerScroll(100)

  // The pull inserts a page above: the reader row's measured offset moves.
  world.setRows([
    { key: 'page-0', top: 0, turn: 0 },
    { key: 'turn-1', top: 180, turn: 1 },
  ])
  world.notifyResize()

  expect(world.column.scrollTop).toBe(180)
  expect(world.states.at(-1)?.activeTurn).toBe(1)
})

it('a non-reader delivery during the settled away state stays put', () => {
  const world = makeWorld()
  world.setRows([{ key: 'turn-1', top: 100, turn: 1 }])
  world.readerScroll(100)
  const saved = world.store.saved

  // A layout-compensated delivery the reader did not cause: the settled row
  // is re-aligned (already aligned here), and the memory is left untouched.
  world.notifyResize()
  world.column.dispatchEvent(new Event('scroll'))
  world.column.dispatchEvent(new Event('scrollend'))

  expect(world.column.scrollTop).toBe(100)
  expect(world.store.saved).toBe(saved)
})
