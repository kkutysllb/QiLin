// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useSyncExternalStore } from 'react'
import type { SessionId } from '@qilin/session/types'
import { SessionLogDownloadController } from '../src/client/controller.ts'
import { SessionLogDownloadHeaderAction } from '../src/client/HeaderAction.tsx'
import type { SessionLogDownloadDialogProps } from '../src/client/Dialog.tsx'
import { en } from '../src/client/locales.ts'

const SID = 'session-export-header' as SessionId

function bindSessionExport(controller: SessionLogDownloadController) {
  return function useSessionLogDownload<T>(selector: (state: ReturnType<typeof controller.store.getSnapshot>) => T): T {
    return useSyncExternalStore(
      listener => controller.store.subscribe(listener),
      () => selector(controller.store.getSnapshot()),
    )
  }
}

function bench(controller: SessionLogDownloadController) {
  const props = {
    sessionId: SID,
    useSessionLogDownload: bindSessionExport(controller),
    dismiss: (sessionId: SessionId) => { controller.dismiss(sessionId) },
    t: (key: keyof typeof en): string => en[key],
  } as unknown as SessionLogDownloadDialogProps
  return render(<SessionLogDownloadHeaderAction {...props} />)
}

afterEach(cleanup)

describe('Session export Header contribution', () => {
  it('renders no header control of its own', () => {
    const view = bench(new SessionLogDownloadController(async () => new Response('zip'), vi.fn()))
    expect(view.container.querySelector('button')).toBeNull()
  })

  it('reports a download started by the /export command through the shared dialog', async () => {
    const controller = new SessionLogDownloadController(async () => new Response('zip'), vi.fn())
    const view = bench(controller)
    await controller.download(SID)
    const dialog = await view.findByRole('dialog', { name: 'Session download started' })
    fireEvent.click(view.getAllByRole('button', { name: 'Close' })[0]!)
    await waitFor(() => { expect(dialog.isConnected).toBe(false) })
  })
})
