// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { UserPluginsSettingsTab } from '../src/client/UserPluginsSettingsTab.tsx'
import type {
  UserPluginsSettingsTabInjected,
  UserPluginsSettingsTabProps,
} from '../src/client/UserPluginsSettingsTab.tsx'
import { en, type UserPluginsLocaleKey } from '../src/client/locales.ts'

afterEach(cleanup)

const t = ((key: UserPluginsLocaleKey, params?: Record<string, string | number>): string =>
  Object.entries(params ?? {}).reduce(
    (text, [name, value]) => text.replaceAll(`{${name}}`, String(value)),
    en[key],
  )) as UserPluginsSettingsTabProps['t']

const RECEIPT = { changed: true, restartRequired: true, outputTail: ['Progress: resolved 1, reused 0', 'added 1 package'] }

/** One engine layer, one profile-owned shipped layer, one user layer. */
const SNAPSHOT = {
  profile: 'web',
  entries: [
    { name: '@qilin/base', version: '3.0.0', layer: 0, source: 'builtin', updatable: false, removable: false },
    { name: '@qilin/coding-sidebar', version: '1.0.14', layer: 1, source: 'builtin', updatable: true, removable: false },
    { name: '@example/plugin', version: '1.2.3', layer: 2, source: 'user', updatable: true, removable: true },
  ],
} as const

function injected(over: Partial<UserPluginsSettingsTabInjected> = {}): UserPluginsSettingsTabInjected {
  return {
    list: vi.fn(async () => SNAPSHOT as never),
    install: vi.fn(async () => RECEIPT),
    update: vi.fn(async () => RECEIPT),
    remove: vi.fn(async () => RECEIPT),
    checkUpdates: vi.fn(async () => ({ entries: [] })),
    catalog: vi.fn(async () => ({ entries: [], page: 1, hasMore: false })),
    ...over,
  }
}

function renderTab(face: UserPluginsSettingsTabInjected = injected()): ReturnType<typeof render> {
  return render(<UserPluginsSettingsTab {...{ t, ...face } as unknown as UserPluginsSettingsTabProps} />)
}

// The heading owns the id the section is labelled by; queries scope to the section itself.
const section = (id: string): HTMLElement =>
  (document.getElementById(id) as HTMLElement).closest('section') as HTMLElement

describe('UserPluginsSettingsTab', () => {
  it('keeps update enabled for the profile-owned shipped layer and removal disabled for every shipped layer', async () => {
    renderTab()
    await screen.findByText('@qilin/base')

    const installed = within(section('user-plugin-installed'))
    const update = installed.getAllByRole('button', { name: en.update })
    const uninstall = installed.getAllByRole('button', { name: en.uninstall })
    // Engine layer: version-coupled to the installation, both actions refused.
    expect((update[0] as HTMLButtonElement).disabled).toBe(true)
    expect((uninstall[0] as HTMLButtonElement).disabled).toBe(true)
    // Profile-owned shipped layer: upgradeable in place, never removable.
    expect((update[1] as HTMLButtonElement).disabled).toBe(false)
    expect((uninstall[1] as HTMLButtonElement).disabled).toBe(true)
    // User layer: both actions available.
    expect((update[2] as HTMLButtonElement).disabled).toBe(false)
    expect((uninstall[2] as HTMLButtonElement).disabled).toBe(false)
    expect(installed.getAllByText(new RegExp(en.builtin))).toHaveLength(2)
    expect(installed.getByText(new RegExp(`${en.user} · 1\\.2\\.3`))).toBeTruthy()
  })

  it('runs an update, reports the restart requirement, and shows the retained output', async () => {
    const face = injected()
    renderTab(face)
    await screen.findByText('@qilin/coding-sidebar')

    fireEvent.click(within(section('user-plugin-installed')).getAllByRole('button', { name: en.update })[1]!)
    expect(face.update).toHaveBeenCalledExactlyOnceWith('@qilin/coding-sidebar')
    await screen.findByRole('status')
    expect(screen.getByRole('status').textContent).toBe(en.restart)
    expect(screen.getByText(/added 1 package/)).toBeTruthy()
  })

  it('surfaces a failed mutation and a failed listing as one alert', async () => {
    const face = injected({ update: vi.fn(async () => { throw new Error('pnpm failed') }) })
    renderTab(face)
    await screen.findByText('@qilin/coding-sidebar')
    fireEvent.click(within(section('user-plugin-installed')).getAllByRole('button', { name: en.update })[1]!)
    // The alert carries the Remote's own reason, not just a generic failure line.
    expect((await screen.findByRole('alert')).textContent).toContain('pnpm failed')

    cleanup()
    renderTab(injected({ list: vi.fn(async () => { throw new Error('offline') }) }))
    expect((await screen.findByRole('alert')).textContent).toContain('offline')

    cleanup()
    // A failure without a message falls back to the localized line, and the
    // alert offers a retry that re-reads the listing.
    const flaky = vi.fn()
      .mockRejectedValueOnce('no message')
      .mockResolvedValue({ profile: 'web', entries: [] } as never)
    renderTab(injected({ list: vi.fn(async () => { throw 'no message' }) }))
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain(en.installFailed)

    cleanup()
    const recovering = injected({ list: flaky as never })
    renderTab(recovering)
    expect((await screen.findByRole('alert')).textContent).toContain(en.installFailed)
    fireEvent.click(screen.getByRole('button', { name: en.retry }))
    expect(await screen.findByText(en.empty)).toBeTruthy()
    expect(flaky).toHaveBeenCalledTimes(2)
  })

  it('checks for updates and annotates only upgradeable rows that are behind', async () => {
    const face = injected({
      checkUpdates: vi.fn(async () => ({
        entries: [
          { name: '@qilin/base', currentVersion: '3.0.0', latestVersion: '9.9.9' },
          { name: '@qilin/coding-sidebar', currentVersion: '1.0.14', latestVersion: '1.1.0' },
          { name: '@example/plugin', currentVersion: '1.2.3', latestVersion: null },
        ],
      })),
    })
    renderTab(face)
    await screen.findByText('@qilin/base')
    fireEvent.click(within(section('user-plugin-installed')).getByRole('button', { name: en.checkUpdates }))

    await waitFor(() => { expect(screen.getByText(/1.0.14 → 1.1.0/)).toBeTruthy() })
    // The engine layer cannot be upgraded, so npm's newer tag stays unannotated.
    expect(screen.queryByText(/3.0.0 → 9.9.9/)).toBeNull()
    expect(face.checkUpdates).toHaveBeenCalledOnce()
  })

  it('installs a package spec and clears the field', async () => {
    const face = injected()
    renderTab(face)
    await screen.findByText('@qilin/base')
    const form = within(section('user-plugin-install'))
    const field = form.getByRole('textbox', { name: en.packageSpec })
    const submit = form.getByRole('button', { name: en.install })
    expect((submit as HTMLButtonElement).disabled).toBe(true)

    fireEvent.change(field, { target: { value: 'github:owner/dsh-plugin' } })
    fireEvent.click(submit)
    await waitFor(() => { expect(face.install).toHaveBeenCalledExactlyOnceWith('github:owner/dsh-plugin') })
    await waitFor(() => { expect((field as HTMLInputElement).value).toBe('') })
  })

  it('searches community plugins and installs one from the result list', async () => {
    const face = injected({
      catalog: vi.fn(async () => ({
        entries: [{ fullName: 'owner/dsh-plugin', description: 'A plugin', stars: 12, updatedAt: '', url: 'https://example.test' }],
        page: 1,
        hasMore: false,
      })),
    })
    renderTab(face)
    await screen.findByText('@qilin/base')
    const community = within(section('user-plugin-community'))
    fireEvent.change(community.getByRole('textbox', { name: en.communityQuery }), { target: { value: 'plugin' } })
    fireEvent.click(community.getByRole('button', { name: en.search }))

    await waitFor(() => { expect(face.catalog).toHaveBeenCalledExactlyOnceWith('plugin', 1) })
    expect(await screen.findByText('owner/dsh-plugin')).toBeTruthy()
    expect(screen.getByText('12 stars')).toBeTruthy()
    fireEvent.click(within(section('user-plugin-community')).getByRole('button', { name: en.installCommunity }))
    await waitFor(() => { expect(face.install).toHaveBeenCalledExactlyOnceWith('owner/dsh-plugin') })
  })

  it('reports an empty community result and an empty install list', async () => {
    renderTab(injected({ list: vi.fn(async () => ({ profile: 'web', entries: [] })) }))
    expect(await screen.findByText(en.empty)).toBeTruthy()

    const community = within(section('user-plugin-community'))
    fireEvent.change(community.getByRole('textbox', { name: en.communityQuery }), { target: { value: 'nothing' } })
    fireEvent.click(community.getByRole('button', { name: en.search }))
    expect(await screen.findByText(en.noCommunity)).toBeTruthy()
  })

  it('ignores an empty install submission and renders unknown versions without an arrow', async () => {
    const face = injected({
      list: vi.fn(async () => ({
        profile: 'web',
        entries: [{ name: '@example/plugin', version: null, layer: 0, source: 'user' as const, updatable: true, removable: true }],
      })),
      checkUpdates: vi.fn(async () => ({ entries: [{ name: '@example/plugin', currentVersion: null, latestVersion: null }] })),
    })
    renderTab(face)
    await screen.findByText('@example/plugin')
    expect(screen.getByText(new RegExp(en.versionUnknown))).toBeTruthy()

    fireEvent.click(within(section('user-plugin-installed')).getByRole('button', { name: en.checkUpdates }))
    await waitFor(() => { expect(face.checkUpdates).toHaveBeenCalledOnce() })
    // A registry miss (null latest) leaves the row unannotated.
    expect(screen.queryByText(/→/u)).toBeNull()

    fireEvent.submit(within(section('user-plugin-install')).getByRole('button', { name: en.install }).closest('form')!)
    expect(face.install).not.toHaveBeenCalled()
  })

  it('renders a community row without a description', async () => {
    const face = injected({
      catalog: vi.fn(async () => ({
        entries: [{ fullName: 'owner/bare', description: null, stars: 0, updatedAt: '', url: 'https://example.test' }],
        page: 1,
        hasMore: false,
      })),
    })
    renderTab(face)
    await screen.findByText('@qilin/base')
    const community = within(section('user-plugin-community'))
    fireEvent.click(community.getByRole('button', { name: en.search }))
    expect(await screen.findByText('owner/bare')).toBeTruthy()
    expect(screen.getByText('0 stars')).toBeTruthy()
  })

  it('uninstalls a user layer and shows each pending label while the Remote is in flight', async () => {
    const settle: Array<(receipt: typeof RECEIPT) => void> = []
    const pending = (): Promise<typeof RECEIPT> => new Promise((resolve) => { settle.push(resolve) })
    const face = injected({ update: vi.fn(pending), remove: vi.fn(pending) })
    renderTab(face)
    await screen.findByText('@qilin/coding-sidebar')
    const installed = within(section('user-plugin-installed'))

    fireEvent.click(installed.getAllByRole('button', { name: en.update })[1]!)
    expect(installed.getByRole('button', { name: en.updating })).toBeTruthy()
    settle[0]!(RECEIPT)
    await screen.findByRole('status')

    fireEvent.click(within(section('user-plugin-installed')).getAllByRole('button', { name: en.uninstall })[2]!)
    expect(face.remove).toHaveBeenCalledExactlyOnceWith('@example/plugin')
    expect(within(section('user-plugin-installed')).getByRole('button', { name: en.uninstalling })).toBeTruthy()
    settle[1]!(RECEIPT)
    await waitFor(() => { expect(screen.queryByRole('button', { name: en.uninstalling })).toBeNull() })
  })

  it('surfaces a failed update check and a failed community search', async () => {
    renderTab(injected({
      checkUpdates: vi.fn(async () => { throw new Error('registry down') }),
      catalog: vi.fn(async () => { throw new Error('github down') }),
    }))
    await screen.findByText('@qilin/base')
    fireEvent.click(within(section('user-plugin-installed')).getByRole('button', { name: en.checkUpdates }))
    expect((await screen.findByRole('alert')).textContent).toContain('registry down')

    fireEvent.click(within(section('user-plugin-community')).getByRole('button', { name: en.search }))
    await waitFor(() => { expect(screen.getByRole('alert').textContent).toContain('github down') })
  })

  it('holds the listing in its loading state until the Remote settles', async () => {
    const pending = new Promise<never>(() => {})
    renderTab(injected({ list: vi.fn(() => pending) }))
    expect(screen.getByText(en.loading)).toBeTruthy()
  })
})
