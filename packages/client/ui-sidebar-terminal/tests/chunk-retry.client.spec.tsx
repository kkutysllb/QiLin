// @vitest-environment jsdom
/** A failed terminal chunk shows its reason and one reload action, and a retried attempt renders. */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { makeTranslate } from '@qilin-agent/client-test-runtime'
import { TerminalChunkBoundary } from '../src/client/LazyTerminalBody.tsx'
import { en, zh } from '../src/client/locales.ts'

afterEach(cleanup)

const zhT = makeTranslate(zh)
const enT = makeTranslate(en)

/**
 * A body whose failure the test controls: React may invoke a failing component
 * more than once, so a one-shot throw would recover on its own.
 */
function Body({ fail, message }: { readonly fail: boolean; readonly message: string }): ReactNode {
  if (fail) throw new Error(message)
  return <p>terminal</p>
}

describe('TerminalChunkBoundary', () => {
  it('names the failed chunk load and offers one reload action', () => {
    const onRetry = vi.fn()
    const view = render(
      <TerminalChunkBoundary attempt={0} t={zhT} onRetry={onRetry}>
        <Body fail message="Failed to fetch dynamically imported module" />
      </TerminalChunkBoundary>,
    )

    expect(view.container.querySelector('[data-terminal-chunk-failed]')).not.toBeNull()
    expect(screen.getByRole('alert').textContent)
      .toContain(zhT('chunkFailed', { message: 'Failed to fetch dynamically imported module' }))
    fireEvent.click(screen.getByRole('button', { name: zhT('chunkRetry') }))
    expect(onRetry).toHaveBeenCalledOnce()
  })

  it('renders the retried attempt once the parent advances it', () => {
    const view = render(
      <TerminalChunkBoundary attempt={0} t={enT} onRetry={vi.fn()}>
        <Body fail={false} message="unused" />
      </TerminalChunkBoundary>,
    )
    view.rerender(
      <TerminalChunkBoundary attempt={0} t={enT} onRetry={vi.fn()}>
        <Body fail message="offline" />
      </TerminalChunkBoundary>,
    )
    expect(view.container.querySelector('[data-terminal-chunk-failed]')).not.toBeNull()

    view.rerender(
      <TerminalChunkBoundary attempt={1} t={enT} onRetry={vi.fn()}>
        <Body fail={false} message="unused" />
      </TerminalChunkBoundary>,
    )
    expect(view.container.querySelector('[data-terminal-chunk-failed]')).toBeNull()
    screen.getByText('terminal')
  })

  it('keeps a retry that fails again on the notice', () => {
    const view = render(
      <TerminalChunkBoundary attempt={0} t={enT} onRetry={vi.fn()}>
        <Body fail message="still offline" />
      </TerminalChunkBoundary>,
    )
    view.rerender(
      <TerminalChunkBoundary attempt={1} t={enT} onRetry={vi.fn()}>
        <Body fail message="still offline" />
      </TerminalChunkBoundary>,
    )
    expect(screen.getByRole('alert').textContent).toContain(enT('chunkFailed', { message: 'still offline' }))
  })
})
