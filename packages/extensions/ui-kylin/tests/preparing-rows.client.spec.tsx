// @vitest-environment jsdom
/** Kylin tool rows render an argument-free prefix without reading execution state. */
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CordisActionRow } from '../src/client/CordisActionRow.tsx'
import { CordisDefineRow } from '../src/client/CordisDefineRow.tsx'
import { CordisRunRow } from '../src/client/CordisRunRow.tsx'
import { zh } from '../src/client/locales.ts'

afterEach(cleanup)

const t = ((key: keyof typeof zh) => zh[key]) as Parameters<typeof CordisActionRow>[0]['t']

const callbacks = {
  openFile: vi.fn(), loadImage: vi.fn(),
}

describe('Kylin tool preparation rows', () => {
  it.each([
    ['cordis_define', CordisDefineRow], ['cordis_run', CordisRunRow],
    ['cordis_stop', CordisActionRow], ['cordis_undefine', CordisActionRow],
  ] as const)('%s prepares without invoking its inventory or execution hooks', (toolName, Component) => {
    const unused = vi.fn(() => { throw new Error('preparation must not read execution details') })
    const props = {
      ...callbacks,
      phase: 'preparing', toolName, callId: 'call', t,
      block: { phase: 'preparing', name: toolName, callId: 'call', turn: 1, step: 1, time: 1, subCalls: [] },
      useInventory: unused, useLoaded: unused, useRunCards: unused, useActiveRuns: unused,
    } as Parameters<typeof CordisDefineRow>[0] & Parameters<typeof CordisRunRow>[0]
    const view = render(<Component {...props} />)
    expect(view.container.querySelector('[data-state="preparing"] svg')).not.toBeNull()
    expect(view.queryByRole('button')).toBeNull()
    expect(unused).not.toHaveBeenCalled()
  })
})
