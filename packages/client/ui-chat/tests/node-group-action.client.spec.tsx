// @vitest-environment jsdom
/** CHAT_NODE_INJECT's node-group action: the standalone arm used without a flow viewport. */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { createSnapshotStore } from '@qilin-agent/client-store'
import { CHAT_NODE_INJECT } from '../src/client/apply.ts'
import type { ChatNodeHookContext, UseGroupAction } from '../src/client/contract/slots.ts'

afterEach(cleanup)

/** The node hook context a Chat flow forwards; the standalone arm reads only the forwarded action. */
const hookContext: ChatNodeHookContext = {
  turnData: undefined,
  disclosureReset: createSnapshotStore(0),
}

function Row({ hidden, useGroupAction, onReveal }: {
  hidden: boolean
  useGroupAction: UseGroupAction
  onReveal: () => void
}) {
  const ref = useGroupAction(hidden, onReveal)
  return <div data-testid="row" ref={ref}>row</div>
}

describe('CHAT_NODE_INJECT group action', () => {
  it('falls back to the standalone hidden hook when the flow forwards none', () => {
    const useGroupAction = CHAT_NODE_INJECT.hooks.groupAction({} as never, hookContext)
    const reveal = vi.fn()
    const view = render(<Row hidden useGroupAction={useGroupAction} onReveal={reveal} />)
    const row = view.getByTestId('row')
    expect(row.getAttribute('hidden')).toBe('until-found')

    view.rerender(<Row hidden={false} useGroupAction={useGroupAction} onReveal={reveal} />)
    expect(view.getByTestId('row').hasAttribute('hidden')).toBe(false)
    expect(reveal).not.toHaveBeenCalled()
  })

  it('forwards the flow viewport action when one is supplied', () => {
    const forwarded = vi.fn<UseGroupAction>(() => ({ current: null }))
    const useGroupAction = CHAT_NODE_INJECT.hooks.groupAction({} as never, { ...hookContext, useGroupAction: forwarded })
    expect(useGroupAction).toBe(forwarded)
  })
})
