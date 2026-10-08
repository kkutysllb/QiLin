/**
 * The document file opener's Host carrier: one availability read per page, the
 * open/reveal gesture with its failure kinds, and the handler query that stays
 * distinct from an empty handler list.
 */
import { describe, expect, it, vi } from 'vitest'
import { RemoteError } from '@qilin-agent/client-test-runtime'
import { OpenInAppPathController, type OpenInAppPathRemote } from '../src/client/open-path.ts'
import type { SessionWorkspacePathApplication } from '@qilin-agent/api-session-controller/types'

const APPS: readonly SessionWorkspacePathApplication[] = [
  { id: 'vscode', name: 'VS Code', default: true, icon: null },
]

const ok = <T>(value: T) => ({ ok: true as const, value })
const refused = () => ({ ok: false as const, error: new RemoteError('gateway/internal', 'refused', {}) })

function remote(over: Partial<OpenInAppPathRemote> = {}): OpenInAppPathRemote {
  return {
    canOpenWorkspacePath: async () => ok(true),
    openWorkspacePath: async () => ok({ opened: true as const }),
    workspacePathApplications: async () => ok(APPS),
    ...over,
  }
}

describe('OpenInAppPathController availability', () => {
  it('reads desktop availability once and shares concurrent reads', async () => {
    const canOpenWorkspacePath = vi.fn(async () => ok(true))
    const controller = new OpenInAppPathController(remote({ canOpenWorkspacePath }))
    expect(controller.desktop.getSnapshot()).toBeNull()
    await Promise.all([controller.load(), controller.load()])
    expect(controller.desktop.getSnapshot()).toBe(true)
    expect(canOpenWorkspacePath).toHaveBeenCalledTimes(1)
  })

  it('publishes no desktop for a refused read and for an unreachable carrier', async () => {
    const refusedController = new OpenInAppPathController(remote({ canOpenWorkspacePath: async () => refused() }))
    await refusedController.load()
    expect(refusedController.desktop.getSnapshot()).toBe(false)

    const brokenController = new OpenInAppPathController(remote({
      canOpenWorkspacePath: () => Promise.reject(new Error('offline')),
    }))
    await brokenController.load()
    expect(brokenController.desktop.getSnapshot()).toBe(false)
  })
})

describe('OpenInAppPathController gestures', () => {
  it('opens with the default application, an explicit application, and the file-manager reveal', async () => {
    const openWorkspacePath = vi.fn(async () => ok({ opened: true as const }))
    const controller = new OpenInAppPathController(remote({ openWorkspacePath }))

    await expect(controller.openPath('/host/work/clip.mp4', 'open')).resolves.toBeNull()
    expect(openWorkspacePath).toHaveBeenLastCalledWith({ path: '/host/work/clip.mp4' })

    await expect(controller.openPath('/host/work/clip.mp4', 'open', 'vscode')).resolves.toBeNull()
    expect(openWorkspacePath).toHaveBeenLastCalledWith({ path: '/host/work/clip.mp4', application: 'vscode' })

    await expect(controller.openPath('/host/work/clip.mp4', 'reveal')).resolves.toBeNull()
    expect(openWorkspacePath).toHaveBeenLastCalledWith({ path: '/host/work/clip.mp4', action: 'reveal' })
  })

  it('names the failed gesture by what it asked for, and survives an unreachable carrier', async () => {
    const refusal = new OpenInAppPathController(remote({ openWorkspacePath: async () => refused() }))
    await expect(refusal.openPath('/host/work/clip.mp4', 'open')).resolves.toBe('openError')
    await expect(refusal.openPath('/host/work/clip.mp4', 'reveal')).resolves.toBe('revealError')

    const broken = new OpenInAppPathController(remote({
      openWorkspacePath: () => Promise.reject(new Error('offline')),
    }))
    await expect(broken.openPath('/host/work/clip.mp4', 'open')).resolves.toBe('openError')
  })
})

describe('OpenInAppPathController handlers', () => {
  it('queries the file handlers with the requesting preview\'s lifetime', async () => {
    const workspacePathApplications = vi.fn(async () => ok(APPS))
    const controller = new OpenInAppPathController(remote({ workspacePathApplications }))
    const signal = new AbortController().signal
    await expect(controller.applications('/host/work/clip.mp4', signal)).resolves.toEqual(APPS)
    expect(workspacePathApplications).toHaveBeenCalledWith({ path: '/host/work/clip.mp4' }, signal)
  })

  it('reports a refused query and an unreachable carrier as null, not as an empty list', async () => {
    const refusedQuery = new OpenInAppPathController(remote({ workspacePathApplications: async () => refused() }))
    await expect(refusedQuery.applications('/host/work/clip.mp4', new AbortController().signal)).resolves.toBeNull()

    const brokenQuery = new OpenInAppPathController(remote({
      workspacePathApplications: () => Promise.reject(new Error('offline')),
    }))
    await expect(brokenQuery.applications('/host/work/clip.mp4', new AbortController().signal)).resolves.toBeNull()
  })
})
