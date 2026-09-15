// @vitest-environment jsdom
/** ContentWidthRow behavior: adaptive vs explicit display, stepper bounds,
 * and the revert action. */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createSnapshotStore } from '@qilin/client-store'
import { bindSnapshotSelector } from '@qilin/client-test-runtime'
import { ContentWidthRow } from '../src/client/settings/ContentWidthRow.tsx'
import type { ContentWidthRowProps } from '../src/client/settings/ContentWidthRow.tsx'
import {
  CONTENT_WIDTH_MAX, CONTENT_WIDTH_MIN, CONTENT_WIDTH_STEP,
} from '../src/conversation-settings.ts'

afterEach(cleanup)

const COPY: Record<string, string> = {
  'settings.width.title': '消息区域宽度',
  'settings.width.adaptive': '自适应',
  'settings.width.unit': 'px',
  'settings.width.increase': '加宽消息区域',
  'settings.width.decrease': '收窄消息区域',
  'settings.width.customize': '自定义消息区域宽度',
  'settings.width.reset': '恢复自适应',
}

function mount(width: number) {
  const source = createSnapshotStore<number>(width)
  const setContentWidth = vi.fn()
  const props = {
    t: (key: string) => COPY[key] ?? key,
    useContentWidth: bindSnapshotSelector(source),
    setContentWidth,
  } as unknown as ContentWidthRowProps
  render(<ContentWidthRow {...props} />)
  return { source, setContentWidth }
}

const arrow = (name: string): HTMLButtonElement =>
  screen.getByRole('button', { name }) as HTMLButtonElement

describe('ContentWidthRow', () => {
  it('names the adaptive clamp, offers only the customize step, and shows no revert action', () => {
    const { setContentWidth } = mount(0)
    expect(screen.getByText('消息区域宽度')).toBeDefined()
    expect(screen.getByText('自适应')).toBeDefined()
    expect(screen.queryByText('恢复自适应')).toBeNull()
    expect(arrow('自定义消息区域宽度').disabled).toBe(false)
    expect(arrow('收窄消息区域').disabled).toBe(true)
    fireEvent.click(arrow('自定义消息区域宽度'))
    expect(setContentWidth).toHaveBeenCalledWith(CONTENT_WIDTH_MIN)
  })

  it('shows the explicit width and steps it by the stepper increment', () => {
    const { setContentWidth } = mount(970)
    expect(screen.getByText('970')).toBeDefined()
    expect(screen.getByText('px')).toBeDefined()
    fireEvent.click(arrow('加宽消息区域'))
    expect(setContentWidth).toHaveBeenCalledWith(970 + CONTENT_WIDTH_STEP)
    fireEvent.click(arrow('收窄消息区域'))
    expect(setContentWidth).toHaveBeenCalledWith(970 - CONTENT_WIDTH_STEP)
  })

  it('disables each stepper direction at its bound', () => {
    mount(CONTENT_WIDTH_MIN)
    expect(arrow('收窄消息区域').disabled).toBe(true)
    cleanup()
    const top = mount(CONTENT_WIDTH_MAX)
    expect(arrow('加宽消息区域').disabled).toBe(true)
    expect(arrow('收窄消息区域').disabled).toBe(false)
    expect(top.setContentWidth).not.toHaveBeenCalled()
  })

  it('reverts an explicit width to the adaptive clamp', () => {
    const { setContentWidth } = mount(1200)
    fireEvent.click(screen.getByRole('button', { name: '恢复自适应' }))
    expect(setContentWidth).toHaveBeenCalledWith(0)
  })

  it('follows the persisted value when another surface changes it', () => {
    const source = createSnapshotStore<number>(970)
    const props = {
      t: (key: string) => COPY[key] ?? key,
      useContentWidth: bindSnapshotSelector(source),
      setContentWidth: vi.fn(),
    } as unknown as ContentWidthRowProps
    render(<ContentWidthRow {...props} />)
    expect(screen.getByText('970')).toBeDefined()
    // A width-handle drag commits through the same store the row reads.
    act(() => { source.set(1200) })
    expect(screen.getByText('1200')).toBeDefined()
  })
})
