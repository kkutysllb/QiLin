import { Context, Service } from '@qilin-agent/kylin'
import type { TypertRemoteContribution } from '@qilin-agent/typert-protocol'
import { describe, expect, it, vi } from 'vitest'
import type { SessionId } from '@qilin-agent/session/types'
import type { TeamTaskId, TeamTaskView as TeamTask } from '@qilin-agent/agent-team/client'
import type { RemoteResult } from '@qilin-agent/typert-protocol'
import { LocaleRuntime } from '@qilin-agent/client-locale/client'
import { SlotRegistry } from '@qilin-agent/client-ui-renderer/client'
import { createTeamPageStore } from '../src/client/team-page-store.ts'
import type { TeamPageInjected } from '../src/client/team-writes.ts'
import { mountAgentTeamUi } from '../src/client/mount.ts'
import { SquadChip, type SquadChipInjected } from '../src/client/SquadChip.tsx'
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
  ctx.provide('uiSession.sessionStatus', { getSnapshot: () => new Map(), subscribe: () => () => {} } as never)
  const sidebarOpenTabIn = vi.fn((sessionId: SessionId, kind: string) => {
    navigation.push(['tab', sessionId, kind])
  })
  ctx.provide('sidebarRight', { openTabIn: sidebarOpenTabIn } as never)
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
      squadEntry: () => undefined,
      squadActions: () => undefined as never,
      collapseHeader,
      select: (sessionId: SessionId) => { mainSessionId = sessionId },
    }
  }
  const fiber = ctx.plugin({ inject: [...inject], apply })
  await fiber
  const squadEntry = () => ctx.slots.entries('conversation.session.header.actions')
    .find(candidate => candidate.component === SquadChip)
  const squadActions = (): SquadChipInjected => {
    const { openTeam } = squadEntry()!.inject!()
    if (typeof openTeam !== 'function') throw new Error('Squad chip lacks its injected callback')
    return { openTeam: openTeam as SquadChipInjected['openTeam'] }
  }
  return {
    ctx,
    fiber,
    navigation,
    mounts,
    remoteDisposals,
    squadEntry,
    squadActions,
    sidebarOpenTabIn,
    collapseHeader,
    select: (sessionId: SessionId) => { mainSessionId = sessionId },
  }
}

/** The Team page's face, resolved from the registered body and a fresh store instance. */
function pageFace(b: Awaited<ReturnType<typeof bench>>, sessionId: SessionId = SESSION) {
  const pageEntry = b.ctx.slots.entries('sidebar.right.pane.tab')
    .find(candidate => candidate.component === TeamBody)!
  const instance = createTeamPageStore().create()
  return (pageEntry.inject as unknown as (
    sessionId: SessionId, actions: typeof instance.actions,
  ) => TeamPageInjected)(sessionId, instance.actions)
}

describe('ui-team browser plugin', () => {
  it('mounts the write namespace and registers disposable Team surfaces', async () => {
    const b = await bench()
    // The plugin mounts `agentTeams` itself, so the namespace must not appear
    // here: an entry waiting for a service its own apply creates never
    // activates (see default-product-isolation.e2e.ts).
    expect(inject).toEqual([
      'sessions', 'uiWorkspace', 'slots', 'locale', 'remote', 'sidebarRight', 'sidebarRightTabs',
      'uiSession.sessionStatus',
    ])
    expect(b.mounts).toHaveLength(1)
    const t = b.ctx.locale.bind('agent-team')
    expect(t('roster')).toBe('Members')

    expect(b.navigation).toEqual([])

    await b.fiber?.dispose()
    expect(b.squadEntry()).toBeUndefined()
    expect(b.remoteDisposals).toHaveLength(1)
    expect(t('empty')).toBe('empty')
  })

  it('registers the squad chip after the subagent count and opens the Team page by kind', async () => {
    const b = await bench()
    expect(b.squadEntry()).toMatchObject({
      options: { id: 'agent-team-squad', order: 40 },
      locale: 'agent-team',
    })
    b.squadActions().openTeam(SESSION)
    expect(b.sidebarOpenTabIn).toHaveBeenCalledExactlyOnceWith(SESSION, 'agent-team')
    expect(b.navigation).toEqual([['tab', SESSION, 'agent-team']])
    await b.fiber?.dispose()
  })

  it('registers the tab type, page body, and chip title under the sidebar seats', async () => {
    const b = await bench()
    const tabEntries = b.ctx.slots.entries('sidebar.right.pane.tab')
    expect(tabEntries.find(candidate => candidate.component === TeamBody)).toBeDefined()
    const titleEntries = b.ctx.slots.entries('sidebar.right.pane.tab.title')
    expect(titleEntries.length).toBeGreaterThan(0)
    await b.fiber?.dispose()
  })

  it('routes page-face teammate navigation back through its Lead', async () => {
    const b = await bench({ addressed: true })
    const face = pageFace(b, CHILD)
    face.openTeammate(CHILD, CHILD)
    expect(b.navigation).toEqual([
      ['open', { parentSessionId: SESSION, childSessionId: CHILD, mode: 'continuable' }],
    ])

    face.openTeammate(CHILD, SESSION)
    expect(b.navigation).toEqual([
      ['open', { parentSessionId: SESSION, childSessionId: CHILD, mode: 'continuable' }],
      ['open', SESSION],
    ])
  })

  it('does not open a teammate from a conversation outside the main view', async () => {
    const b = await bench()
    b.select('other-session' as SessionId)
    pageFace(b).openTeammate(SESSION, CHILD)
    expect(b.navigation).toEqual([])
  })

  it('re-registers after the conversation header slot is collapsed and declared again', async () => {
    const b = await bench()
    expect(b.squadEntry()).toBeDefined()
    b.collapseHeader()
    expect(b.squadEntry()).toBeUndefined()
    b.ctx.slots.register({
      name: 'root',
      children: { 'conversation.session.header.actions': { kind: 'list', scope: 'session' } },
    } as never, () => null)
    await Promise.resolve()
    expect(b.squadEntry()).toBeDefined()
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
    const face = pageFace(b)
    face.refresh(SESSION)
    face.openAgent({ parentSessionId: SESSION, childSessionId: CHILD, mode: 'continuable' })
    expect(b.navigation).toEqual([
      ['refresh', SESSION],
      ['open', { parentSessionId: SESSION, childSessionId: CHILD, mode: 'continuable' }],
    ])
  })

  it('keeps the node half inert', () => {
    expect(() => { nodeApply() }).not.toThrow()
  })
})
