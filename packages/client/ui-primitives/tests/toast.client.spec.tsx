// @vitest-environment jsdom

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { Toast } from '../src/Toast.tsx'

afterEach(cleanup)

const toastCss = readFileSync(join(import.meta.dirname, '../src/Toast.module.css'), 'utf8')

describe('Toast', () => {
  it('announces its text and reports done after the hold-and-fade lifetime', () => {
    vi.useFakeTimers()
    try {
      const onDone = vi.fn()
      const view = render(<Toast text="最多添加 50 张图片" icon={<svg data-testid="icon" />} onDone={onDone} />)
      const banner = view.getByRole('alert')
      expect(banner.textContent).toContain('最多添加 50 张图片')
      expect(view.getByTestId('icon')).toBeTruthy()
      vi.advanceTimersByTime(3999)
      expect(onDone).not.toHaveBeenCalled()
      vi.advanceTimersByTime(1)
      expect(onDone).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('holds for the owner\'s window and hands the stylesheet the same value', () => {
    vi.useFakeTimers()
    try {
      const onDone = vi.fn()
      const view = render(<Toast text="切换失败" holdMs={6000} onDone={onDone} />)
      // One value drives both, so a banner can never unmount mid-fade: the
      // timer waits the hold plus the fade, and the stylesheet delays the
      // fade by the same hold.
      expect(view.getByRole('alert').style.getPropertyValue('--qilin-toast-hold')).toBe('6000ms')
      vi.advanceTimersByTime(6999)
      expect(onDone).not.toHaveBeenCalled()
      vi.advanceTimersByTime(1)
      expect(onDone).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('centers over its anchor and re-measures on window resize', () => {
    vi.useFakeTimers()
    try {
      const anchor = document.createElement('div')
      document.body.appendChild(anchor)
      anchor.getBoundingClientRect = () => ({ left: 100, width: 400 }) as DOMRect
      const view = render(<Toast text="anchored" anchor={anchor} onDone={vi.fn()} />)
      expect(view.getByRole('alert').style.left).toBe('300px')
      anchor.getBoundingClientRect = () => ({ left: 200, width: 400 }) as DOMRect
      fireEvent(window, new Event('resize'))
      expect(view.getByRole('alert').style.left).toBe('400px')
      anchor.remove()
    } finally {
      vi.useRealTimers()
    }
  })

  it('brings its own success glyph under the success tone', () => {
    vi.useFakeTimers()
    try {
      const view = render(<Toast text="已保存" tone="success" onDone={vi.fn()} />)
      const glyph = view.getByRole('alert').querySelector('[aria-hidden]')
      expect(glyph).not.toBeNull()
      expect(glyph?.querySelector('svg')).not.toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('renders without an icon and cancels its timer on unmount', () => {
    vi.useFakeTimers()
    try {
      const onDone = vi.fn()
      const view = render(<Toast text="plain" onDone={onDone} />)
      expect(view.getByRole('alert').querySelector('[aria-hidden]')).toBeNull()
      view.unmount()
      vi.advanceTimersByTime(10_000)
      expect(onDone).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('Toast inline actions', () => {
  it('renders each action after the sentence and runs its press', () => {
    vi.useFakeTimers()
    try {
      const undo = vi.fn()
      const view = render(<Toast text="已删除会话" actions={[{ label: '撤销', prefix: '或', onClick: undo }]} onDone={vi.fn()} />)
      const banner = view.getByRole('alert')
      expect(banner.textContent).toContain('已删除会话')
      expect(banner.textContent).toContain('或撤销')
      fireEvent.click(view.getByRole('button', { name: '撤销' }))
      expect(undo).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('calls the latest completion handler without restarting the lifetime on a rerender', () => {
    vi.useFakeTimers()
    try {
      const first = vi.fn()
      const latest = vi.fn()
      const view = render(<Toast text="已保存" holdMs={5000} onDone={first} />)
      vi.advanceTimersByTime(3000)
      view.rerender(<Toast text="已保存" holdMs={5000} onDone={latest} />)
      vi.advanceTimersByTime(2999)
      expect(first).not.toHaveBeenCalled()
      expect(latest).not.toHaveBeenCalled()
      vi.advanceTimersByTime(1)
      expect(latest).toHaveBeenCalledTimes(1)
      expect(first).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('Toast.module.css action affordances', () => {
  it('keeps the surface click-through while the action text takes the pointer', () => {
    expect(/\.toast\s*\{[^}]*pointer-events:\s*none/.test(toastCss)).toBe(true)
    expect(/\.action\s*\{[^}]*pointer-events:\s*auto/.test(toastCss)).toBe(true)
  })

  it('hides the banner at the end of the fade so a faded action takes no input', () => {
    expect(/@keyframes qilin-toast-fade\s*\{[^}]*to\s*\{[^}]*visibility:\s*hidden/.test(toastCss)).toBe(true)
  })
})
