/**
 * Load xterm only after a terminal body is mounted, and keep a failed chunk
 * recoverable: a tab whose download failed shows the reason and one reload
 * action instead of an empty pane that only a page refresh could bring back.
 */
import { Component, lazy, Suspense, useMemo, useState, type ComponentType, type ReactNode } from 'react'
import { Button } from '@qilin-agent/client-ui-primitives'
import type { TerminalBodyProps } from './terminal.tsx'
import css from './LazyTerminalBody.module.css'

/** Why the terminal chunk could not be loaded, as the notice shows it. */
function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** State a boundary keeps: whether its subtree failed, and the error it failed with. */
interface BoundaryState {
  failure: { readonly message: string } | null
}

/** Error boundary props: the attempt that resets it, its copy, and the retry action. */
interface BoundaryProps {
  /** Attempt counter; a new attempt clears the recorded failure. */
  readonly attempt: number
  readonly t: TerminalBodyProps['t']
  readonly children: ReactNode
  readonly onRetry: () => void
}

/**
 * Contain one terminal-chunk failure. A rejected dynamic import throws during
 * render, so the boundary reports the reason and offers the one action that can
 * help; a retried attempt renders its fresh subtree instead.
 */
export class TerminalChunkBoundary extends Component<BoundaryProps, BoundaryState> {
  override state: BoundaryState = { failure: null }

  static getDerivedStateFromError(error: unknown): BoundaryState {
    return { failure: { message: reasonOf(error) } }
  }

  override componentDidUpdate(previous: BoundaryProps): void {
    if (previous.attempt !== this.props.attempt && this.state.failure !== null) this.setState({ failure: null })
  }

  override render(): ReactNode {
    const failure = this.state.failure
    if (failure === null) return this.props.children
    return (
      <div className={css.failed} role="alert" data-terminal-chunk-failed="">
        <p className={css.message}>{this.props.t('chunkFailed', { message: failure.message })}</p>
        <Button variant="primary" size="sm" onClick={this.props.onRetry}>{this.props.t('chunkRetry')}</Button>
      </div>
    )
  }
}

/**
 * Suspend while the package-local terminal chunk arrives.
 * @param props - Terminal body props supplied by the sidebar slot.
 * @returns the deferred terminal renderer, recoverable from one failed load.
 */
export function LazyTerminalBody(props: TerminalBodyProps): ReactNode {
  const [attempt, setAttempt] = useState(0)
  return (
    <TerminalChunkBoundary attempt={attempt} t={props.t} onRetry={() => { setAttempt(current => current + 1) }}>
      <LoadedTerminal {...props} attempt={attempt} />
    </TerminalChunkBoundary>
  )
}

/** One attempt's lazy terminal body: a fresh component so a retry re-requests the chunk. */
function LoadedTerminal({ attempt, ...props }: TerminalBodyProps & { readonly attempt: number }): ReactNode {
  const body = useMemo<ComponentType<TerminalBodyProps>>(
    () => lazy(async () => ({ default: (await import('./terminal.tsx')).TerminalBody })),
    [attempt],
  )
  const Loaded = body
  return <Suspense fallback={null}><Loaded {...props} /></Suspense>
}
