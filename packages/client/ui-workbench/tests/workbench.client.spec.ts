// @vitest-environment jsdom
/** The workbench owner: persistence round-trip, defaults on malformed storage, and the D2 fold. */

import { Context } from '@qilin-agent/kylin'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { apply, inject, type Workbench } from '../src/client/index.ts'
import {
  rehydrateWorkbenchState, WORKBENCH_STORAGE_KEY,
} from '../src/client/workbench.ts'

/** Boot one client root with the workbench owner and return its service. */
async function booted(): Promise<Workbench> {
  const ctx = new Context()
  await ctx.plugin({ inject: [...inject], apply }).await()
  return ctx.get('workbench') as Workbench
}

beforeEach(() => { localStorage.clear() })
afterEach(() => { localStorage.clear() })

describe('the workbench state owner', () => {
  it('starts on the general tag carrying the one shipped preset', async () => {
    const workbench = await booted()
    expect(workbench.state.getSnapshot()).toEqual({
      active: 'general',
      presets: { general: 'ptc', coding: 'ptc' },
    })
    expect(workbench.presetFor('general')).toBe('ptc')
    expect(workbench.presetFor('coding')).toBe('ptc')
  })

  it('names each tag’s shipped menu vocabulary in menu order', async () => {
    const workbench = await booted()
    expect(workbench.tagChoices('general')).toEqual(['ptc'])
    expect(workbench.tagChoices('coding')).toEqual(['ptc'])
  })

  it('keeps a switched tag and a remembered preset across a fresh boot', async () => {
    const first = await booted()
    first.setActive('coding')
    first.setPresetFor('coding', 'mine')

    const second = await booted()
    expect(second.state.getSnapshot()).toEqual({
      active: 'coding',
      presets: { general: 'ptc', coding: 'mine' },
    })
  })

  it('resets a malformed stored document to the defaults', async () => {
    localStorage.setItem(WORKBENCH_STORAGE_KEY, JSON.stringify({ active: 'bogus', presets: 7 }))
    const workbench = await booted()
    expect(workbench.state.getSnapshot()).toEqual({
      active: 'general',
      presets: { general: 'ptc', coding: 'ptc' },
    })
  })

  it('keeps the active tag when only the preset record is malformed', async () => {
    localStorage.setItem(WORKBENCH_STORAGE_KEY, JSON.stringify({ active: 'coding' }))
    const workbench = await booted()
    expect(workbench.state.getSnapshot()).toEqual({
      active: 'coding',
      presets: { general: 'ptc', coding: 'ptc' },
    })
  })

  it('resets a remembered preset the deployment no longer ships', async () => {
    localStorage.setItem(WORKBENCH_STORAGE_KEY, JSON.stringify({
      active: 'coding',
      presets: { general: 'standard', coding: 'cordis' },
    }))
    const workbench = await booted()
    expect(workbench.state.getSnapshot()).toEqual({
      active: 'coding',
      presets: { general: 'ptc', coding: 'ptc' },
    })
  })

  it('folds preset visibility per tag, showing unknowns everywhere', async () => {
    const workbench = await booted()
    expect(workbench.shows('ptc', 'coding')).toBe(true)
    expect(workbench.shows('ptc', 'general')).toBe(true)
    // A merged-away or custom preset is unknown to the fold, so it hides nothing.
    expect(workbench.shows('standard', 'general')).toBe(true)
    expect(workbench.shows('standard', 'coding')).toBe(true)
    expect(workbench.shows('my-agent', 'general')).toBe(true)
    expect(workbench.shows('my-agent', 'coding')).toBe(true)
    // An unlanded projection hides nothing.
    expect(workbench.shows(undefined, 'coding')).toBe(true)
  })

  it('rehydrates through the standalone fold for partial documents', () => {
    expect(rehydrateWorkbenchState(undefined)).toEqual({
      active: 'general',
      presets: { general: 'ptc', coding: 'ptc' },
    })
    expect(rehydrateWorkbenchState({ active: 'coding', presets: { general: 'mine' } }))
      .toEqual({ active: 'coding', presets: { general: 'ptc', coding: 'ptc' } })
  })

  it('ignores a redundant switch', async () => {
    const workbench = await booted()
    workbench.setActive('general')
    expect(workbench.state.getSnapshot().active).toBe('general')
  })
})
