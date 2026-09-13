// @vitest-environment jsdom
/** PluginCard header: icon tile, collapsed value summary, pending tag, disclosure. */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { PluginCard } from '../src/client/PluginCard.tsx'
import type { CardShell } from '../src/client/card-form.ts'
import type { PluginsSettingsLocaleKey } from '../src/client/locales.ts'
import { en } from '../src/client/locales.ts'

afterEach(cleanup)

const t = (key: PluginsSettingsLocaleKey) => en[key]

function shell(overrides: Partial<CardShell> = {}): CardShell {
  return {
    available: true, writable: true, dirty: false, invalid: false, saving: false, failed: false,
    ...overrides,
  }
}

function mount(summary = 'zsh', icon = <svg data-testid="glyph" />) {
  const onSave = vi.fn()
  const onDiscard = vi.fn()
  render(
    <PluginCard
      t={t}
      titleKey="bashTitle"
      descriptionKey="bashDescription"
      icon={icon}
      summary={summary}
      state={shell()}
      onSave={onSave}
      onDiscard={onDiscard}
    >
      <p>controls</p>
    </PluginCard>,
  )
  return { onSave, onDiscard }
}

describe('PluginCard header', () => {
  it('renders the icon tile and the collapsed value summary', () => {
    mount()
    expect(screen.getByTestId('glyph')).toBeTruthy()
    expect(screen.getByText('zsh')).toBeTruthy()
    // Collapsed: controls are not mounted, so there is nothing to edit yet.
    expect(screen.queryByText('controls')).toBeNull()
  })

  it('hides the summary while open and shows the form with its actions', () => {
    mount()
    fireEvent.click(screen.getByRole('button'))
    expect(screen.queryByText('zsh')).toBeNull()
    expect(screen.getByText('controls')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Save' })).toBeTruthy()
  })

  it('renders no summary while the committed value is empty', () => {
    mount('')
    expect(screen.queryByText('zsh')).toBeNull()
    expect(screen.getByTestId('glyph')).toBeTruthy()
  })

  it('keeps the summary beside the pending tag when the card holds staged edits', () => {
    render(
      <PluginCard
        t={t}
        titleKey="bashTitle"
        descriptionKey="bashDescription"
        summary="zsh"
        state={shell({ dirty: true })}
        onSave={vi.fn()}
        onDiscard={vi.fn()}
      >
        <p>controls</p>
      </PluginCard>,
    )
    expect(screen.getByText('Unsaved')).toBeTruthy()
    expect(screen.getByText('zsh')).toBeTruthy()
  })
})
