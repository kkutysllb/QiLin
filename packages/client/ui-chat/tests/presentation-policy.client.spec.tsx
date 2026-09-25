// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createSnapshotStore } from '@qilin/client-store'
import { bindSnapshotSelector } from '@qilin/client-test-runtime'
import type { TranscriptViewMode } from '../src/chat-settings.ts'
import { derivePresentationPolicy, presentationPolicyFor } from '../src/client/presentation-policy.ts'

afterEach(cleanup)

describe('Chat presentation policy', () => {
  it.each([
    ['compact', true, 'collapsed', false, false, 'summary'],
    ['standard', true, 'collapsed', true, true, 'collapsed'],
    ['detailed', true, 'history', true, true, 'expanded'],
    ['verbose', false, 'none', true, false, 'expanded'],
  ] as const)('maps %s to stable presentation capabilities', (
    mode, foldCompletedTurns, stepGrouping, settledReasoningPreview, liveProcessDetail, toolCallDetail,
  ) => {
    const policy = presentationPolicyFor(mode)
    expect(policy).toEqual({
      mode, foldCompletedTurns, stepGrouping, settledReasoningPreview, liveProcessDetail, toolCallDetail,
    })
    expect(presentationPolicyFor(mode)).toBe(policy)
  })

  it('forwards mode notifications and removes the subscription on disposal', () => {
    const mode = createSnapshotStore<TranscriptViewMode>('compact')
    const policy = derivePresentationPolicy(mode)
    const listener = vi.fn()
    const dispose = policy.subscribe(listener)
    expect(policy.getSnapshot()).toBe(presentationPolicyFor('compact'))
    mode.set('detailed')
    expect(listener).toHaveBeenCalledTimes(1)
    expect(policy.getSnapshot()).toBe(presentationPolicyFor('detailed'))
    dispose()
    mode.set('verbose')
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('renders only consumers whose selected field changes', () => {
    const mode = createSnapshotStore<TranscriptViewMode>('compact')
    const usePresentation = bindSnapshotSelector(derivePresentationPolicy(mode))
    const foldRender = vi.fn()
    const detailRender = vi.fn()
    function Fold() {
      const fold = usePresentation(policy => policy.foldCompletedTurns)
      foldRender(fold)
      return <span>{String(fold)}</span>
    }
    function Detail() {
      const detail = usePresentation(policy => policy.toolCallDetail)
      detailRender(detail)
      return <span>{detail}</span>
    }
    render(<><Fold /><Detail /></>)
    expect(foldRender).toHaveBeenCalledTimes(1)
    expect(detailRender).toHaveBeenCalledTimes(1)
    act(() => { mode.set('detailed') })
    // Both selected fields moved, so both consumers re-render.
    expect(foldRender).toHaveBeenCalledTimes(1)
    expect(detailRender).toHaveBeenCalledTimes(2)
    act(() => { mode.set('verbose') })
    // verbose keeps 'expanded' details and keeps folding off, so neither moves.
    expect(foldRender).toHaveBeenCalledTimes(2)
    expect(detailRender).toHaveBeenCalledTimes(2)
    act(() => { mode.set('standard') })
    expect(foldRender).toHaveBeenCalledTimes(3)
    expect(detailRender).toHaveBeenCalledTimes(3)
  })
})
