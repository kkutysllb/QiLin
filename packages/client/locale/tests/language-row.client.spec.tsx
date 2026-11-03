// @vitest-environment jsdom
/** The General settings language card: chips per registered locale, the selection write, and its copy. */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { bindSnapshotSelector, makeTranslate } from '@qilin-agent/client-test-runtime'
import { createLanguageRowStore, LanguageRow, type LanguageRowComponentProps } from '../src/client/language-row.tsx'
import { en } from '../src/client/locales.ts'

afterEach(cleanup)

const locales = [
  { id: 'zh', label: '中文' },
  { id: 'en', label: 'English' },
]

function mount(active = 'zh') {
  const store = createLanguageRowStore().create()
  store.actions.sync(active, locales, 1)
  const setLocale = vi.fn()
  const props: LanguageRowComponentProps = {
    useStore: bindSnapshotSelector(store),
    t: makeTranslate(en),
    setLocale,
  } as LanguageRowComponentProps
  render(<LanguageRow {...props} />)
  return { setLocale }
}

describe('LanguageRow', () => {
  it('renders one self-named chip per registered locale and marks the active one', () => {
    mount('zh')
    expect(screen.getByText(en.title)).toBeTruthy()
    expect(screen.getByRole('button', { name: '中文' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: 'English' }).getAttribute('aria-pressed')).toBe('false')
  })

  it('writes the clicked locale through the injected setLocale', () => {
    const { setLocale } = mount('zh')
    fireEvent.click(screen.getByRole('button', { name: 'English' }))
    expect(setLocale).toHaveBeenCalledWith('en')
  })
})
