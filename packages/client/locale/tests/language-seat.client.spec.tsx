// @vitest-environment jsdom
/** The General settings language card rendered through its seat: the inject face and its locale write. */
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import { SlotTestRuntime, stubConfigForm } from '@qilin-agent/client-test-runtime'
import { apply, inject } from '../src/client/index.ts'
import type { LocaleSettings } from '../src/locale-settings.ts'
import type { LocaleRuntime } from '../src/client/index.ts'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

it('renders the language card through the seat and writes the chosen locale', async () => {
  const runtime = await SlotTestRuntime.create()
  const form = stubConfigForm<LocaleSettings>()
  runtime.ctx.provide('configForms', { get: () => form.scope } as never)
  try {
    await runtime.mount({ inject, apply })
    await runtime.declare({ 'settings.general.item': { kind: 'list', scope: 'root' } })
    const view = runtime.renderSlot('settings.general.item', {})
    // The seat's inject face answers the card's own locale write.
    const locale = runtime.ctx.get('locale') as LocaleRuntime
    fireEvent.click(view.view.getByRole('button', { name: '中文' }))
    await waitFor(() => { expect(locale.getSnapshot().active).toBe('zh') })
    // The card's copy follows the same subscription the inject face primed.
    expect(view.view.getByText('语言')).toBeTruthy()
    fireEvent.click(view.view.getByRole('button', { name: 'English' }))
    await waitFor(() => { expect(locale.getSnapshot().active).toBe('en') })
    expect(view.view.getByText('Language')).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
    vi.restoreAllMocks()
  } finally { await runtime.dispose() }
})
