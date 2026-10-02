// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { RenderResult } from '@testing-library/react'
import { UploadOverlay } from '../src/client/UploadOverlay.tsx'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

/** Namespace-bound translate stand-in with the exact keys the overlay reads. */
const t = ((key: string, params?: { count: string }) =>
  params === undefined ? `t:${key}` : `t:${key}:${params.count}`) as never

function mount(onUploaded: () => void = (): void => {}): RenderResult {
  return render(<UploadOverlay sessionId='s1' root='workspace/' onUploaded={onUploaded} t={t}>tree</UploadOverlay>)
}

/** The wrapper div the handlers sit on. */
function target(view: RenderResult): HTMLElement {
  return view.container.firstElementChild as HTMLElement
}

function enter(view: RenderResult, types: readonly string[] = ['Files']): void {
  fireEvent.dragEnter(target(view), { dataTransfer: { types: [...types], files: [] } })
}

function drop(view: RenderResult, files: File[], types: readonly string[] = ['Files']): void {
  fireEvent.drop(target(view), { dataTransfer: { types: [...types], files } })
}

function okResponse(): Response {
  const response: Partial<Response> = { ok: true, text: async (): Promise<string> => '' }
  return response as Response
}

describe('UploadOverlay', () => {
  it('shows the overlay while a Files drag is present and hides it when the drag leaves', () => {
    const view = mount()
    enter(view)
    expect(view.getByText('t:upload.dropHint')).toBeTruthy()
    fireEvent.dragLeave(target(view), { dataTransfer: { types: ['Files'], files: [] } })
    expect(view.queryByText('t:upload.dropHint')).toBeNull()
  })

  it('ignores drags that carry no Files type', () => {
    const fetchMock = vi.fn(async (): Promise<Response> => okResponse())
    vi.stubGlobal('fetch', fetchMock)
    const view = mount()
    enter(view, ['text/plain'])
    expect(view.queryByText('t:upload.dropHint')).toBeNull()
    drop(view, [new File(['x'], 'a.txt')], ['text/plain'])
    expect(fetchMock).not.toHaveBeenCalled()
    expect(view.queryByTestId('files-upload-report')).toBeNull()
  })

  it('uploads a dropped file under the displayed root and reports success', async () => {
    let resolveFetch!: (response: Response) => void
    const fetchMock = vi.fn((_url: string, _init?: RequestInit): Promise<Response> =>
      new Promise((resolve) => { resolveFetch = resolve }))
    vi.stubGlobal('fetch', fetchMock)
    const uploaded = vi.fn()
    const view = mount(uploaded)
    enter(view)
    expect(view.getByText('t:upload.dropHint')).toBeTruthy()
    drop(view, [new File(['abc'], 'a.txt')])
    // The drop itself dismisses the overlay; a drag arriving mid-upload shows
    // the busy hint instead of the drop hint.
    enter(view)
    expect(view.getByText('t:upload.uploading')).toBeTruthy()
    resolveFetch(okResponse())

    await waitFor(() => { expect(view.getByText('a.txt')).toBeTruthy() })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/sidebar/media/upload?sessionId=s1&path=workspace%2Fa.txt')
    expect(init.method).toBe('PUT')
    expect(await waitFor(() => view.getByText('t:upload.done:1'))).toBeTruthy()
    expect(uploaded).toHaveBeenCalledTimes(1)
  })

  it('reports an oversized file without fetching', async () => {
    const fetchMock = vi.fn(async (): Promise<Response> => okResponse())
    vi.stubGlobal('fetch', fetchMock)
    const view = mount()
    drop(view, [new File([new Uint8Array(20 * 1024 * 1024 + 1)], 'big.bin')])

    await waitFor(() => { expect(view.getByText(/big\.bin: too large/)).toBeTruthy() })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(view.getByText('t:upload.done:0')).toBeTruthy()
  })

  it('reports a rejected upload with the response text', async () => {
    const rejected: Partial<Response> = { ok: false, text: async (): Promise<string> => 'outside the workspace' }
    vi.stubGlobal('fetch', vi.fn(async (): Promise<Response> => rejected as Response))
    const uploaded = vi.fn()
    const view = mount(uploaded)
    drop(view, [new File(['x'], 'a.txt')])

    await waitFor(() => { expect(view.getByText('a.txt: outside the workspace')).toBeTruthy() })
    expect(uploaded).not.toHaveBeenCalled()
  })

  it('reports a network failure with the error message', async () => {
    vi.stubGlobal('fetch', vi.fn(async (): Promise<Response> => {
      throw new Error('offline')
    }))
    const view = mount()
    drop(view, [new File(['x'], 'a.txt')])

    await waitFor(() => { expect(view.getByText('a.txt: offline')).toBeTruthy() })
  })

  it('reports a non-Error upload failure by its string form', async () => {
    vi.stubGlobal('fetch', vi.fn(async (): Promise<Response> => {
      throw 'aborted'
    }))
    const view = mount()
    drop(view, [new File(['x'], 'a.txt')])

    await waitFor(() => { expect(view.getByText('a.txt: aborted')).toBeTruthy() })
  })

  it('a drop carrying no files uploads nothing', () => {
    const fetchMock = vi.fn(async (): Promise<Response> => okResponse())
    vi.stubGlobal('fetch', fetchMock)
    const view = mount()
    drop(view, [])

    expect(fetchMock).not.toHaveBeenCalled()
    expect(view.queryByTestId('files-upload-report')).toBeNull()
  })

  it('clears the previous report when a new drag starts', async () => {
    vi.stubGlobal('fetch', vi.fn(async (): Promise<Response> => okResponse()))
    const view = mount()
    drop(view, [new File(['x'], 'a.txt')])
    await waitFor(() => { expect(view.getByText('t:upload.done:1')).toBeTruthy() })

    enter(view)
    expect(view.queryByText('t:upload.done:1')).toBeNull()
  })
})
