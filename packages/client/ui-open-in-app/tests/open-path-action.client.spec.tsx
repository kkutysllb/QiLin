// @vitest-environment jsdom
/**
 * The document file-opening controls: what each seat renders for a Host with
 * and without a desktop opener, the gestures each control offers, and how a
 * failed gesture and a failed handler query are announced.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { makeTranslate } from '@qilin/client-test-runtime'
import { createSnapshotStore } from '@qilin/client-store'
import type { SessionId } from '@qilin/session/types'
import type { SessionWorkspacePathApplication } from '@qilin/api-session-controller/types'
import { OpenPathAction, OpenPathEmptyAction } from '../src/client/OpenPathAction.tsx'
import type { OpenPathActionProps } from '../src/client/OpenPathAction.tsx'
import type { OpenInAppPathAction, OpenInAppPathFailure } from '../src/client/open-path.ts'
import { zh } from '../src/client/locales.ts'

afterEach(cleanup)

const PATH = '/host/project/work/clip.mp4'
const APPS: readonly SessionWorkspacePathApplication[] = [
  { id: 'vscode', name: 'VS Code', default: true, icon: null },
  { id: 'finder', name: 'Finder', default: false, icon: 'data:image/png;base64,AA' },
]

interface Bench {
  props: OpenPathActionProps
  openPath: ReturnType<typeof vi.fn>
  applications: ReturnType<typeof vi.fn>
  loadDesktop: ReturnType<typeof vi.fn>
}

function bench(over: {
  desktop?: boolean | null
  applications?: (path: string, signal: AbortSignal) => Promise<readonly SessionWorkspacePathApplication[] | null>
  openPath?: (path: string, action: OpenInAppPathAction, application?: string) => Promise<OpenInAppPathFailure | null>
} = {}): Bench {
  const desktop = createSnapshotStore<boolean | null>(over.desktop === undefined ? true : over.desktop)
  const loadDesktop = vi.fn(async () => {})
  const applications = vi.fn(over.applications ?? (async () => APPS))
  const openPath = vi.fn(over.openPath ?? (async () => null))
  const props = {
    absolutePath: PATH,
    sessionId: 's-1' as SessionId,
    useOpenInAppDesktop: (select: (value: boolean | null) => unknown): unknown => select(desktop.getSnapshot()),
    loadDesktop,
    applications,
    openPath,
    t: makeTranslate(zh),
  } as OpenPathActionProps
  return { props, openPath, applications, loadDesktop }
}

describe('document file opener visibility', () => {
  it('renders nothing until the Host answers, asking once for its availability', () => {
    const b = bench({ desktop: null })
    const view = render(<OpenPathAction {...b.props} />)
    expect(view.container.innerHTML).toBe('')
    expect(b.loadDesktop).toHaveBeenCalledTimes(1)
  })

  it('renders nothing on a Host that cannot open paths', () => {
    const b = bench({ desktop: false })
    const view = render(<OpenPathAction {...b.props} />)
    expect(view.container.innerHTML).toBe('')
    expect(b.loadDesktop).not.toHaveBeenCalled()
  })
})

describe('document file opener gestures', () => {
  it('opens the file in the default application from the header control', async () => {
    const b = bench()
    const view = render(<OpenPathAction {...b.props} />)
    const main = screen.getByRole('button', { name: zh['path.open'] })
    expect(view.container.querySelector('[data-open-path-open]')).not.toBeNull()
    fireEvent.click(main)
    await waitFor(() => {
      expect(b.openPath).toHaveBeenCalledWith(PATH, 'open', undefined)
    })
  })

  it('lists the file handlers and the file manager reveal, opening the picked handler', async () => {
    const b = bench()
    render(<OpenPathAction {...b.props} />)
    fireEvent.click(screen.getByRole('button', { name: zh['path.more'] }))
    expect(await screen.findByText(zh['path.appDefault'].replace('{app}', 'VS Code'))).toBeDefined()
    expect(screen.getByText('Finder')).toBeDefined()
    expect(b.applications).toHaveBeenCalledWith(PATH, expect.any(AbortSignal))
    fireEvent.click(screen.getByText('Finder'))
    await waitFor(() => {
      expect(b.openPath).toHaveBeenCalledWith(PATH, 'open', 'finder')
    })

    fireEvent.click(screen.getByRole('button', { name: zh['path.more'] }))
    fireEvent.click(await screen.findByText(zh['path.reveal']))
    await waitFor(() => {
      expect(b.openPath).toHaveBeenCalledWith(PATH, 'reveal', undefined)
    })
  })

  it('marks the handler query in flight, then says it failed instead of showing an empty list', async () => {
    const pending = Promise.withResolvers<readonly SessionWorkspacePathApplication[] | null>()
    const b = bench({ applications: () => pending.promise })
    render(<OpenPathAction {...b.props} />)
    fireEvent.click(screen.getByRole('button', { name: zh['path.more'] }))
    expect(await screen.findByText(zh['path.appsLoading'])).toBeDefined()
    pending.resolve(null)
    expect(await screen.findByText(zh['path.appsError'])).toBeDefined()
  })

  it('announces a failed gesture on the control that made it', async () => {
    const b = bench({ openPath: async () => 'openError' })
    render(<OpenPathAction {...b.props} />)
    fireEvent.click(screen.getByRole('button', { name: zh['path.open'] }))
    await waitFor(() => {
      expect(screen.getByRole('button', { name: zh['path.openError'] })).toBeDefined()
    })
  })

  it('ignores a second gesture while one is in flight', async () => {
    const pending = Promise.withResolvers<null>()
    const openPath = vi.fn(() => pending.promise.then(() => null))
    const b = bench({ openPath })
    render(<OpenPathAction {...b.props} />)
    const main = screen.getByRole('button', { name: zh['path.open'] }) as HTMLButtonElement
    fireEvent.click(main)
    expect(main.disabled).toBe(true)
    fireEvent.click(main)
    expect(b.openPath).toHaveBeenCalledTimes(1)
    pending.resolve(null)
    await waitFor(() => { expect(main.disabled).toBe(false) })
  })

  it('falls back to the generic glyph when the Host icon fails to load', async () => {
    const b = bench()
    render(<OpenPathAction {...b.props} />)
    fireEvent.click(screen.getByRole('button', { name: zh['path.more'] }))
    const image = await waitFor(() => {
      const found = document.querySelector('img')
      expect(found).not.toBeNull()
      return found as HTMLImageElement
    })
    fireEvent.error(image)
    await waitFor(() => { expect(document.querySelector('img')).toBeNull() })
  })
})

describe('unpreviewable file opener', () => {
  it('labels the main action and opens the file the preview could not render', async () => {
    const b = bench()
    const view = render(<OpenPathEmptyAction {...b.props} />)
    expect(view.container.querySelector('[data-open-path-unpreviewable]')).not.toBeNull()
    const main = screen.getByRole('button', { name: zh['path.open'] })
    expect(main.textContent).toBe(zh['path.open'])
    fireEvent.click(main)
    await waitFor(() => {
      expect(b.openPath).toHaveBeenCalledWith(PATH, 'open', undefined)
    })
  })
})
