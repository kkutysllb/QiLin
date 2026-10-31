// @vitest-environment jsdom
/** The shared Subagent card writes two namespaces through one Save. */

import { describe, expect, it, vi } from 'vitest'
import { subagentCardFace } from '../src/client/subagent-card-controller.ts'
import type { SubagentLimitsCardFace } from '../src/client/subagent-limits-card-controller.ts'
import type { SubagentModelSelectionCardFace } from '../src/client/subagent-model-selection-card-controller.ts'

interface SavingState {
  saving: boolean
  dirty: boolean
  available: boolean
  writable: boolean
  invalid: boolean
}

/** A snapshot store with the observable members the card reads. */
function store<T extends object>(initial: T) {
  let state = initial
  const listeners = new Set<() => void>()
  const set = (next: T): void => {
    state = next
    for (const listener of [...listeners]) listener()
  }
  return {
    getSnapshot: () => state,
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    set,
    update: (mutator: (draft: T) => void) => {
      const next = { ...state }
      mutator(next)
      set(next)
    },
  }
}

function limitsFace(state: ReturnType<typeof store<SavingState>>, save: () => void): SubagentLimitsCardFace {
  return {
    hooks: { subagentLimitsCard: state as never },
    edit: () => {},
    resetField: () => {},
    save,
    discard: () => {},
  }
}

function modelsFace(
  state: ReturnType<typeof store<SavingState>>,
  save: () => void,
): SubagentModelSelectionCardFace {
  return {
    hooks: { subagentModelSelectionCard: state as never },
    toggleEnabled: () => {},
    toggleModel: () => {},
    retryCatalog: () => {},
    save,
    discard: () => {},
  }
}

const ready = (saving: boolean, dirty = true): SavingState => ({ saving, dirty, available: true, writable: true, invalid: false })

describe('subagent card save', () => {
  it('writes the model namespace before the limit namespace once the first settles', async () => {
    const calls: string[] = []
    const modelState = store(ready(false))
    const limitState = store(ready(false))
    const modelsSave = vi.fn(() => {
      calls.push('models')
      modelState.set(ready(true))
      queueMicrotask(() => { modelState.set(ready(false, false)) })
    })
    const face = subagentCardFace(
      limitsFace(limitState, () => { calls.push('limits') }),
      modelsFace(modelState, modelsSave),
    )

    face.save()
    expect(calls).toEqual(['models'])

    await vi.waitFor(() => { expect(calls).toEqual(['models', 'limits']) })
  })

  it('waits for a model write already in flight before writing the limit namespace', async () => {
    const calls: string[] = []
    const modelState = store(ready(false))
    const limitState = store(ready(false))
    const modelsSave = vi.fn(() => {
      calls.push('models')
      // The face sets its saving phase before the Host answers; the card must wait it out.
      modelState.set(ready(true))
    })
    const face = subagentCardFace(
      limitsFace(limitState, () => { calls.push('limits') }),
      modelsFace(modelState, modelsSave),
    )

    face.save()
    expect(calls).toEqual(['models'])
    await Promise.resolve()
    expect(calls).toEqual(['models'])

    modelState.set(ready(false, false))
    await vi.waitFor(() => { expect(calls).toEqual(['models', 'limits']) })
  })

  it('waits for the limit section to become writable again after the model write', async () => {
    const calls: string[] = []
    const modelState = store(ready(false))
    const limitState = store(ready(false))
    const face = subagentCardFace(
      limitsFace(limitState, () => { calls.push('limits') }),
      modelsFace(modelState, () => { calls.push('models'); modelState.set(ready(true)) }),
    )

    face.save()
    // The model write recomposes the profile, leaving the limit section briefly read-only.
    limitState.set({ ...ready(false), writable: false })
    modelState.set(ready(false, false))
    // A macrotask lets the settled model write reach the writable wait while the section is still read-only.
    await new Promise((resolve) => { setTimeout(resolve, 0) })
    expect(calls).toEqual(['models'])

    // A move that leaves the section read-only keeps the wait subscribed.
    limitState.set({ ...ready(false), writable: false, dirty: false })
    expect(calls).toEqual(['models'])
    limitState.set(ready(false))
    await vi.waitFor(() => { expect(calls).toEqual(['models', 'limits']) })
  })

  it('writes the limit namespace alone when only it has a draft', async () => {
    const calls: string[] = []
    const modelState = store(ready(false, false))
    const limitState = store(ready(false))
    const face = subagentCardFace(
      limitsFace(limitState, () => { calls.push('limits') }),
      modelsFace(modelState, () => { calls.push('models') }),
    )

    face.save()
    await vi.waitFor(() => { expect(calls).toEqual(['limits']) })
  })
})
