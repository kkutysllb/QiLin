// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { BundleDetailSection } from '../src/client/BundleDetailSection.tsx'
import type { BundleDetailsState } from '../src/client/detail-store.ts'
import { en } from '../src/client/locales.ts'
import type { Translate } from '../src/client/presentation.ts'

afterEach(cleanup)

const t: Translate = ((key: keyof typeof en, params?: Record<string, string>) => {
  const template = en[key]
  return params === undefined ? template : template.replace(/\{(\w+)\}/gu, (match, name: string) => params[name] ?? match)
}) as Translate

const FOUND = { status: 'found', origin: 'readme', path: 'README.md', markdown: '# Readme\n\n![shot](img/shot.png)\n' } as const

function renderSection(details: BundleDetailsState, callbacks: { load?: () => void; retry?: () => void } = {}) {
  return render(
    <BundleDetailSection
      name="@acme/plugin" version="1.0.0" fromNpm={false} language="en" details={details} t={t}
      load={callbacks.load ?? (() => {})} retry={callbacks.retry ?? (() => {})}
      image={(_name, _document, destination) => `https://host.example/${destination}`}
    />,
  )
}

it('asks for the document of the bundle, version, and language it shows', () => {
  const load = vi.fn()
  renderSection({}, { load })
  expect(load).toHaveBeenCalledWith('@acme/plugin', '1.0.0', 'en', false)
  // Until the read settles the section shows its placeholder, named by the dictionary.
  expect(screen.getByRole('status', { name: en.detailLoading })).toBeTruthy()
})

it('renders the found document with its images resolved beside it', () => {
  renderSection({ [JSON.stringify(['@acme/plugin', '1.0.0', 'en'])]: { status: 'ready', detail: FOUND } })
  expect(screen.getByRole('heading', { name: 'Readme' })).toBeTruthy()
  expect(screen.getByRole('img', { name: 'shot' }).getAttribute('src')).toContain('https://host.example/img/shot.png')
})

it('renders nothing for a bundle without a document', () => {
  const view = renderSection({ [JSON.stringify(['@acme/plugin', '1.0.0', 'en'])]: { status: 'ready', detail: { status: 'none' } } })
  expect(view.container.innerHTML).toBe('')
})

it.each([
  ['too-large', en.detailTooLarge],
  ['network', en.detailNetwork],
  ['invalid', en.detailInvalid],
  ['denied', en.detailFailed],
  ['git-unavailable', en.detailFailed],
  ['other', en.detailFailed],
] as const)('names a %s failure and reads again on retry', (failure, message) => {
  const retry = vi.fn()
  renderSection({ [JSON.stringify(['@acme/plugin', '1.0.0', 'en'])]: { status: 'error', failure } }, { retry })
  expect(screen.getByRole('alert').textContent).toBe(message)
  fireEvent.click(screen.getByRole('button', { name: en.retry }))
  expect(retry).toHaveBeenCalledWith('@acme/plugin', '1.0.0', 'en', false)
})
