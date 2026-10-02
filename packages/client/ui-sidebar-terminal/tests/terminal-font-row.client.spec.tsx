// @vitest-environment jsdom
/**
 * The terminal font settings row: what it shows, what it commits, and what a
 * half-typed value does instead.
 */
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { makeTranslate } from '@qilin/client-test-runtime'
import { TerminalFontRow, type TerminalFontRowProps } from '../src/client/TerminalFontRow.tsx'
import { en } from '../src/client/locales.ts'

afterEach(cleanup)

function mount(initial = { fontFamily: 'User Mono', fontSize: 15 }) {
  let font = initial
  const setFont = vi.fn()
  const props = {
    useFont: (select: (value: typeof initial) => unknown) => select(font),
    setFont,
    t: makeTranslate(en),
  } as TerminalFontRowProps
  const view = render(<TerminalFontRow {...props} />)
  return {
    view, setFont,
    family: () => view.getByLabelText(en['settings.font.family']) as HTMLInputElement,
    size: () => view.getByLabelText(en['settings.font.size']) as HTMLInputElement,
    set(next: typeof initial) { font = next; view.rerender(<TerminalFontRow {...props} />) },
  }
}

it('shows the stored family and size', () => {
  const h = mount()
  expect(h.family().value).toBe('User Mono')
  expect(h.size().value).toBe('15')
  expect(h.view.getByText(en['settings.font.title'])).toBeDefined()
  expect(h.view.getByText(en['settings.font.description'])).toBeDefined()
})

it('commits a trimmed family on blur and on Enter', () => {
  const h = mount()
  fireEvent.change(h.family(), { target: { value: '  Other Mono  ' } })
  expect(h.setFont).not.toHaveBeenCalled()
  fireEvent.blur(h.family())
  expect(h.setFont).toHaveBeenCalledExactlyOnceWith({ fontFamily: 'Other Mono' })
  fireEvent.change(h.family(), { target: { value: 'Third Mono' } })
  fireEvent.keyDown(h.family(), { key: 'Enter' })
  expect(h.setFont).toHaveBeenLastCalledWith({ fontFamily: 'Third Mono' })
})

it('keeps typing that is not Enter uncommitted', () => {
  const h = mount()
  fireEvent.change(h.family(), { target: { value: 'Half Typed' } })
  fireEvent.keyDown(h.family(), { key: 'a' })
  fireEvent.keyDown(h.size(), { key: 'a' })
  expect(h.setFont).not.toHaveBeenCalled()
})

it('commits the stored values when a field is left untouched', () => {
  const h = mount()
  fireEvent.blur(h.family())
  expect(h.setFont).toHaveBeenLastCalledWith({ fontFamily: 'User Mono' })
  fireEvent.blur(h.size())
  expect(h.setFont).toHaveBeenLastCalledWith({ fontSize: 15 })
})

it('clamps a committed size', () => {
  const h = mount()
  fireEvent.change(h.size(), { target: { value: '99' } })
  fireEvent.blur(h.size())
  expect(h.setFont).toHaveBeenCalledExactlyOnceWith({ fontSize: 32 })
  // The store echoes the accepted value; the field is not its own source.
  h.set({ fontFamily: 'User Mono', fontSize: 32 })
  expect(h.size().value).toBe('32')
})

it('keeps the stored size when the field is not a number', () => {
  const h = mount()
  fireEvent.change(h.size(), { target: { value: 'wide' } })
  fireEvent.keyDown(h.size(), { key: 'Enter' })
  expect(h.setFont).toHaveBeenCalledExactlyOnceWith({ fontSize: 15 })
  expect(h.size().value).toBe('15')
})

it('follows a preference that changes underneath it while it is not being edited', () => {
  const h = mount()
  h.set({ fontFamily: 'Adopted', fontSize: 18 })
  expect(h.family().value).toBe('Adopted')
  expect(h.size().value).toBe('18')
})

it('keeps an in-progress draft across a change made elsewhere', () => {
  const h = mount()
  fireEvent.change(h.family(), { target: { value: 'Draft Mono' } })
  h.set({ fontFamily: 'Adopted', fontSize: 18 })
  expect(h.family().value).toBe('Draft Mono')
  expect(h.size().value).toBe('18')
})
