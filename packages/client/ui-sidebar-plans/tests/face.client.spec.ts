/**
 * The panel's asynchronous half against a virtual workspace.
 *
 * The face's contract is what reaches the store and when: a tab is `scanning`
 * before the scan settles and `settled` after, a failure travels with the rows
 * it was found beside, the latest scan of a tab wins whichever settles first,
 * and a record whose signal aborted is never scanned and is forgotten.
 */
import { describe, expect, it, vi } from 'vitest'
import { RemoteError } from '@qilin/client-test-runtime'
import type { RemoteFailure } from '@qilin/api-remotes/client'
import type { TabId } from '@qilin/client-ui-dockkit'
import type { SessionId } from '@qilin/session/types'
import { createReader, plansFace } from '../src/client/face.ts'
import type { PlanReader, PlanRow } from '../src/client/plans.ts'
import { createPlansStore } from '../src/client/store.ts'
import { scriptedReader } from './scripted-reader.client.ts'

const SESSION = 's-1' as SessionId
const ROOT = '/work/app'
const TAB = 'tab-1' as TabId

const ROW: PlanRow = { path: `${ROOT}/plan.md`, base: 'plan.md', rel: 'plan.md', title: 'Plan' }

const TRANSPORT: RemoteFailure = new RemoteError('gateway/internal', 'socket closed', {})

/** Let every already-started scan run to its settlement. */
async function flush(): Promise<void> {
  for (let i = 0; i < 40; i++) await Promise.resolve()
}

/** One store instance and the face bound to it. */
function mount(reader: PlanReader) {
  const instance = createPlansStore().create()
  return { instance, face: plansFace(reader)(SESSION, instance.actions) }
}

describe('createReader', () => {
  it('hands the workspaceFiles namespace to the scan unchanged', () => {
    const workspaceFiles = { list: vi.fn(), read: vi.fn(), stat: vi.fn() }
    expect(createReader({ workspaceFiles })).toBe(workspaceFiles)
  })
})

describe('plansFace', () => {
  it('marks the tab scanning, then settles its rows', async () => {
    const script = scriptedReader({ heads: { [`${ROOT}/plan.md`]: '# Plan' } })
    const { instance, face } = mount(script.reader)
    face.refresh(TAB, ROOT, new AbortController().signal)
    expect(instance.getSnapshot().byTab[TAB]).toEqual({ rows: [], scanning: true })
    await flush()
    expect(instance.getSnapshot().byTab[TAB]).toEqual({ rows: [ROW], scanning: false })
    expect(script.list).toHaveBeenCalledWith(SESSION, `${ROOT}/plans`, expect.any(AbortSignal))
  })

  it('settles a failure beside the rows it was found with', async () => {
    const script = scriptedReader({
      heads: { [`${ROOT}/plan.md`]: '# Plan' },
      failures: { [`${ROOT}/plans`]: TRANSPORT },
    })
    const { instance, face } = mount(script.reader)
    face.refresh(TAB, ROOT, new AbortController().signal)
    await flush()
    expect(instance.getSnapshot().byTab[TAB]).toEqual({ rows: [ROW], scanning: false, failure: TRANSPORT })
  })

  it('makes no request for a record that already ended', () => {
    const script = scriptedReader()
    const { instance, face } = mount(script.reader)
    const controller = new AbortController()
    controller.abort()
    face.refresh(TAB, ROOT, controller.signal)
    expect(script.list).not.toHaveBeenCalled()
    expect(instance.getSnapshot().byTab[TAB]).toBeUndefined()
  })

  it('abort forgets the tab, and a later refresh writes nothing back', async () => {
    const script = scriptedReader({ heads: { [`${ROOT}/plan.md`]: '# Plan' } })
    const { instance, face } = mount(script.reader)
    const controller = new AbortController()
    face.refresh(TAB, ROOT, controller.signal)
    await flush()
    expect(instance.getSnapshot().byTab[TAB]).toBeDefined()
    controller.abort()
    expect(instance.getSnapshot().byTab[TAB]).toBeUndefined()
    face.refresh(TAB, ROOT, controller.signal)
    await flush()
    expect(instance.getSnapshot().byTab[TAB]).toBeUndefined()
  })

  it('lets the latest scan of a tab win, whichever settles first', async () => {
    const script = scriptedReader({ heads: { [`${ROOT}/plan.md`]: '# Plan' } })
    let gate: Promise<void> | undefined
    let release: (() => void) | undefined
    const reader: PlanReader = {
      list: async (...args: Parameters<PlanReader['list']>) => {
        if (gate !== undefined) await gate
        return script.reader.list(...args)
      },
      read: script.reader.read,
      stat: script.reader.stat,
    }
    const { instance, face } = mount(reader)
    const signal = new AbortController().signal
    gate = new Promise<void>((resolve) => { release = resolve })
    face.refresh(TAB, ROOT, signal)
    gate = undefined
    face.refresh(TAB, ROOT, signal)
    await flush()
    const settled = instance.getSnapshot()
    expect(settled.byTab[TAB]).toEqual({ rows: [ROW], scanning: false })
    // The first scan lands afterwards and changes nothing.
    release?.()
    await flush()
    expect(instance.getSnapshot()).toBe(settled)
  })
})
