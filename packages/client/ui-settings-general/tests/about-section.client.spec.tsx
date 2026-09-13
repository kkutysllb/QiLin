// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { makeTranslate } from '@qilin/client-test-runtime'
import { AboutSection, type AboutSectionComponentProps } from '../src/client/AboutSection.tsx'
import { en } from '../src/client/locales.ts'

afterEach(() => { cleanup() })

function props(renderSlot: AboutSectionComponentProps['renderSlot']): AboutSectionComponentProps {
  return {
    close: vi.fn(),
    renderSlot,
    t: makeTranslate(en),
  } as AboutSectionComponentProps
}

describe('About settings section', () => {
  it('renders localized project copy and requests the two-character mark', () => {
    const renderSlot: AboutSectionComponentProps['renderSlot'] = (key, owner) => {
      expect(key).toBe('settings.about.mark')
      expect(owner).toEqual({ size: 72 })
      return <span data-testid="seal">麒麟</span>
    }

    render(<AboutSection {...props(renderSlot)} />)

    expect(screen.getByRole('img', { name: 'QiLin seal mark' })).toBeTruthy()
    expect(screen.getByTestId('seal').textContent).toBe('麒麟')
    expect(screen.getByRole('heading', { name: 'About QiLin' })).toBeTruthy()
    expect(screen.getByText(/composable AI workspace/)).toBeTruthy()
    expect(screen.getByText('Current project · QiLin')).toBeTruthy()
    expect(screen.queryByText(/^v\d/u)).toBeNull()
  })

  it('renders a two-character 麒麟 fallback when the mark slot is empty', () => {
    const renderSlot: AboutSectionComponentProps['renderSlot'] = (key, _owner, options) => {
      expect(key).toBe('settings.about.mark')
      return options?.fallback
    }

    render(<AboutSection {...props(renderSlot)} />)

    expect(screen.getByText('麒麟')).toBeTruthy()
    expect(screen.queryByText('麟')).toBeNull()
  })
})
