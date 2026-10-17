// @vitest-environment jsdom
/** macOS desktop detection: the render-time read and the attribute watcher. */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { isDarwinDesktop, watchDarwinDesktop } from '../src/darwin-desktop.ts'

afterEach(() => {
  vi.unstubAllGlobals()
  delete document.documentElement.dataset.platform
})

describe('isDarwinDesktop', () => {
  it('reads the platform mark on every call', () => {
    expect(isDarwinDesktop()).toBe(false)
    document.documentElement.dataset.platform = 'darwin'
    expect(isDarwinDesktop()).toBe(true)
    document.documentElement.dataset.platform = 'win32'
    expect(isDarwinDesktop()).toBe(false)
  })

  it('reports a documentless run as not darwin', () => {
    vi.stubGlobal('document', undefined)
    expect(isDarwinDesktop()).toBe(false)
  })
})

describe('watchDarwinDesktop', () => {
  it('notifies on every platform attribute change until disposed', async () => {
    const listener = vi.fn()
    const stop = watchDarwinDesktop(listener)
    document.documentElement.dataset.platform = 'darwin'
    await vi.waitFor(() => { expect(listener).toHaveBeenCalledTimes(1) })
    // The listener fires on changes only; the current value needs a fresh read.
    expect(isDarwinDesktop()).toBe(true)

    listener.mockClear()
    stop()
    stop()
    document.documentElement.dataset.platform = 'win32'
    await new Promise((resolve) => { setTimeout(resolve, 0) })
    expect(listener).not.toHaveBeenCalled()
  })

  it('watches nothing without a document', () => {
    vi.stubGlobal('document', undefined)
    const stop = watchDarwinDesktop(vi.fn())
    expect(() => { stop() }).not.toThrow()
  })
})
