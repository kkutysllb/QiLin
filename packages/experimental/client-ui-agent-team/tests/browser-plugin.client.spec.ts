import { Context, Service } from '@qilin/kylin'
import type { TypertRemoteContribution } from '@qilin/typert-protocol'
import { describe, expect, it, vi } from 'vitest'
import type { SessionId } from '@qilin/session/types'
import type { TeamTaskId, TeamTaskView as TeamTask } from '@qilin/experimental-agent-team/client'
import type { RemoteResult } from '@qilin/typert-protocol'
import { LocaleRuntime } from '@qilin/client-locale/client'
import { SlotRegistry } from '@qilin/client-ui-renderer/client'
import { createTeamPageStore } from '../src/client/team-page-store.ts'
import { mountAgentTeamUi } from '../src/client/mount.ts'
import { TeamAction, type TeamActionInjected } from '../src/client/TeamAction.tsx'
import { TeamBody } from '../src/client/TeamBody.tsx'
import { apply, inject } from '../src/client/index.ts'
import { apply as nodeApply } from '../src/index.ts'

const SESSION = 'team-session' as SessionId
const CHILD = 'team-child' as SessionId
const TASK = 'task-1' as TeamTaskId

function okTask(): RemoteResult<TeamTask> {
  return {
    ok: true,
    value: {
      id: TASK, revision: 1, subject: 's', description: 'd', status: 'pending',
      blockedBy: [], writeScopes: [], ready: true, writeScopeWarnings: [],
    },
  }
}

async function bench(options: { addressed?: boolean; mount?: boolean } = {}) {
  const ctx = new Context()
  const navigation: unknown[] = []
  const mounts: unknown[] = []
  const remoteDisposals: unknown[] = []
  let mainSessionId = options.addressed === true ? CHILD : SESSION
  ctx.provide('sessions', {
    binding: (id: SessionId) => options.addressed === true && id === CHILD
      ? { session: { getSnapshot: () => ({
        subagent: {
          address: {
            parentSessionId: SESSION,
            childSessionId: CHILD,
            mode: 'continuable' as const,
          },
        },
      }) } }
      : undefined,
    refreshProjections: (id: SessionId) => {
      navigation.push(['refresh', id])
      return Promise.resolve()
    },
    retainInfo: (id: SessionId) => ({
      getSnapshot: () => ({
        referenceCount: id === mainSessionId ? 1 : 0,
        retainedBy: id === mainSessionId ? { mainView: 1 } : {},
      }),
      subscribe: () => () => {},
    }),
  })
  ctx.provide('uiWorkspace', {
    openSession: (target: unknown) => { navigation.push(['open', target]) },
  } as never)
  class Remote extends Service {
    constructor() { super(ctx, 'remote') }
    async $mount(contribution: TypertRemoteContribution) {
      mounts.push(contribution)
      return async () => { remoteDisposals.push(contribution) }
    }
  }
  new Remote()
  ctx.provide('remote.agentTeams', {
    createTask: async () => okTask(),
    updateTask: async () => okTask(),
  })
  ctx.provide('conversation', {})
  ctx.provide('locale', new LocaleRuntime(ctx))
  ctx.provide('sidebarRightTabs', { register: vi.fn(() => () => {}) } as never)
  await ctx.plugin(SlotRegistry).await()
  const collapseHeader = ctx.slots.register({
    name: 'root',
    children: {
      'conversation.session.header.actions': { kind: 'list', scope: 'session' },
      'sidebar.right.pane.tab': { kind: 'keyed', scope: 'session' },
      'sidebar.right.pane.tab.title': { kind: 'keyed', scope: 'session' },
    },
  } as never, () => null)
  if (options.mount === false) {
    return {
      ctx,
      fiber: undefined,
      navigation,
      mounts,
      remoteDisposals,
      entry: () => undefined,
      actions: () => undefined as never,
      collapseHeader,
      select: (sessionId: SessionId) => { mainSessionId = sessionId },
    }
  }
  const fiber = ctx.plugin({ inject: [...inject], apply })
  await fiber
  const entry = () => ctx.slots.entries('conversation.session.header.actions')
    .find(candidate => candidate.component === TeamAction)
  const actions = (): TeamActionInjected => {
    const injected = entry()!.inject!()
    const { openTeammate } = injected
    if (typeof openTeammate !== 'function') {
      throw new Error('Team header action lacks its injected callbacks')
    }
    return {
      openTeammate: openTeammate as TeamActionInjected['openTeammate'],
    }
  }
  return {
    ctx,
    fiber,
    navigation,
    mounts,
    remoteDisposals,
    entry,
    actions,
    collapseHeader,
    select: (sessionId: SessionId) => { mainSessionId = sessionId },
  }
}

describe('ui-team browser plugin', () => {
  it('mounts the write namespace and registers one disposable header action', async () => {
    const b = await bench()
    // The plugin mounts `agentTeams` itself, so the namespace must not appear
    // here: an entry waiting for a service its own apply creates never
    // activates (see default-product-isolation.e2e.ts).
    expect(inject).toEqual(['sessions', 'uiWorkspace', 'slots', 'locale', 'remote', 'sidebarRightTabs'])
    expect(b.mounts).toHaveLength(1)
    expect(b.entry()).toMatchObject({
      options: { id: 'agent-team', order: -20 },
      locale: 'agent-team',
    })
    const t = b.ctx.locale.bind('agent-team')
    expect(t('trigger')).toBe('Agent Team')

    expect(b.navigation).toEqual([])

    await b.fiber?.dispose()
    expect(b.entry()).toBeUndefined()
    expect(b.remoteDisposals).toHaveLength(1)
    expect(t('empty')).toBe('empty')
  })

  it('registers the tab type, page body, and chip title under the sidebar seats', async () => {
    const b = await bench()
    const tabEntries = b.ctx.slots.entries('sidebar.right.pane.tab')
    expect(tabEntries.find(candidate => candidate.component === TeamBody)).toBeDefined()
    const titleEntries = b.ctx.slots.entries('sidebar.right.pane.tab.title')
    expect(titleEntries.length).toBeGreaterThan(0)
    await b.fiber?.dispose()
  })

  it('opens a continuable teammate address without touching the parent catalog', async () => {
    const b = await bench()
    b.actions().openTeammate(SESSION, CHILD)
    expect(b.navigation).toEqual([
      ['open', { parentSessionId: SESSION, childSessionId: CHILD, mode: 'continuable' }],
    ])
  })

  it('routes teammate navigation from an addressed teammate conversation back through its Lead', async () => {
    const b = await bench({ addressed: true })
    b.actions().openTeammate(CHILD, CHILD)
    expect(b.navigation).toEqual([
      ['open', { parentSessionId: SESSION, childSessionId: CHILD, mode: 'continuable' }],
    ])
  })

  it('opens the Lead from an addressed teammate conversation', async () => {
    const b = await bench({ addressed: true })
    b.actions().openTeammate(CHILD, SESSION)
    expect(b.navigation).toEqual([['open', SESSION]])
  })

  it('does not open a teammate from a conversation outside the main view', async () => {
    const b = await bench()
    b.select('other-session' as SessionId)
    b.actions().openTeammate(SESSION, CHILD)
    expect(b.navigation).toEqual([])
  })

  it('re-registers after the conversation header slot is collapsed and declared again', async () => {
    const b = await bench()
    expect(b.entry()).toBeDefined()
    b.collapseHeader()
    expect(b.entry()).toBeUndefined()
    b.ctx.slots.register({
      name: 'root',
      children: { 'conversation.session.header.actions': { kind: 'list', scope: 'session' } },
    } as never, () => null)
    await Promise.resolve()
    expect(b.entry()).toBeDefined()
  })

  it('propagates the mount failure without registering the UI', async () => {
    const b = await bench()
    const contribution = {} as TypertRemoteContribution
    vi.spyOn(b.ctx.remote, '$mount')
      .mockRejectedValueOnce(new Error('namespace unavailable'))
    await expect(mountAgentTeamUi(b.ctx, contribution)).rejects.toThrow('namespace unavailable')
    expect(b.remoteDisposals).toEqual([])
  })

  it('rolls the mounted namespace back when the UI registration fails', async () => {
    const b = await bench({ mount: false })
    const contribution = {} as TypertRemoteContribution
    vi.spyOn(b.ctx.slots, 'inject').mockImplementationOnce(() => { throw new Error('slot failed') })
    await expect(mountAgentTeamUi(b.ctx, contribution)).rejects.toThrow('slot failed')
    expect(b.remoteDisposals).toHaveLength(1)
  })

  it('wires the page face through the mounted services', async () => {
    const b = await bench()
    const pageEntry = b.ctx.slots.entries('sidebar.right.pane.tab').find(candidate => candidate.component === TeamBody)!
    const instance = createTeamPageStore().create()
    const face = (pageEntry.inject as (
      sessionId: SessionId, actions: typeof instance.actions,
    ) => { refresh(id: SessionId): Promise<void> })(SESSION, instance.actions)
    await face.refresh(SESSION)
    expect(b.navigation).toEqual([['refresh', SESSION]])
  })

  it('keeps the node half inert', () => {
    expect(() => { nodeApply() }).not.toThrow()
  })
})
