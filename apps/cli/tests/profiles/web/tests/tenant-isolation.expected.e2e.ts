/**
 * Multi-tenant isolation (plans/2026-10-11-multi-user-tenancy.md §12): one
 * deployment home, one built Web runtime per account, and **one harness home
 * per account** — sessions, tasks, workspaces, attachments, plugins, model
 * settings, and credentials all resolve inside that account.
 *
 * The criteria are the acceptance list: every one of those surfaces stays with
 * its tenant, the deployment home holds only the account roster and the tenant
 * directories, forwarded events do not cross, and a foreign Session identity is
 * refused by the executor rather than answered.
 *
 * Every criterion is two-sided on purpose. A tenant-scoped assertion alone
 * passes when a root never moved by reading nothing; the paired assertion that
 * the owning tenant does see its own state fails in that case.
 */
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { openForwardedEvents, sessionIdsUnder, withTenantWeb, type ForwardedEvent, type TenantWorld } from './tenant-web-process.ts'

const ALICE = 'alice'
const BOB = 'bob'

/** The task seeded into one tenant's own storage root before its runtime starts. */
const SEEDED_TASK_ID = 'retained-tenant-task'
const SEEDED_TASK_SESSION = 'unloaded-tenant-owner'

/** One daily reminder in the encoded form the Schedule storage domain stores. */
function seededTaskDocument(): string {
  const record = {
    id: SEEDED_TASK_ID,
    kind: 'daily',
    title: 'Retained tenant instruction',
    prompt: 'Retained tenant instruction',
    time: '09:00:00.125',
    timeZone: 'Asia/Shanghai',
    scheduledAt: '2099-01-01T01:00:00.125Z',
  }
  const task = { sessionId: SEEDED_TASK_SESSION, record, status: 'active' }
  return `${JSON.stringify({ unit: { name: 'schedule', version: 1 }, global: null, tables: { tasks: { [SEEDED_TASK_ID]: task } } }, null, 2)}\n`
}

/** Seed one tenant's Schedule domain under its own storage root. */
async function seedTenantTask(world: TenantWorld, tenant: string): Promise<void> {
  const storages = join(world.tenantDir(tenant), 'storages')
  await mkdir(storages, { recursive: true })
  await writeFile(join(storages, 'schedule.json'), seededTaskDocument())
}

/** Read one tenant's storage document, or an empty string when it has none. */
async function readTenantStorage(world: TenantWorld, tenant: string, file: string): Promise<string> {
  return await readFile(join(world.tenantDir(tenant), 'storages', file), 'utf8').catch(() => '')
}

/** Whether one forwarded `api-session/added` frame carries a Session identity. */
function addedSession(event: ForwardedEvent, sessionId: string): boolean {
  if (event.event !== 'api-session/added') return false
  const payload = event.args[0]
  return typeof payload === 'object' && payload !== null
    && (payload as { sessionId?: unknown }).sessionId === sessionId
}

it('keeps sessions, tasks, workspaces, plugins, and model settings with their tenant', async (test) => {
  await withTenantWeb(test, {
    tenants: [ALICE, BOB],
    prepare: async (world) => { await seedTenantTask(world, ALICE) },
  }, async (tenants) => {
    const { world } = tenants
    const alice = tenants.host(ALICE)
    const bob = tenants.host(BOB)
    const aliceProjects = join(world.root, `${ALICE}-project`)
    const bobProjects = join(world.root, `${BOB}-project`)
    await mkdir(aliceProjects, { recursive: true })
    await mkdir(bobProjects, { recursive: true })

    // 1. Sessions are private. Each runtime lists its own after the other tenant
    // has already created one, so a shared Session root would surface the foreign
    // Session in that listing instead of only in the on-disk roots below.
    const aliceSession = await alice.rpc<{ sessionId: string }>('session/create', { request: { cwd: alice.cwd } })
    const bobSession = await bob.rpc<{ sessionId: string }>('session/create', { request: { cwd: bob.cwd } })
    const aliceList = await alice.rpc<{ items: { sessionId: string }[] }>('session/list', { _request: {} })
    const bobList = await bob.rpc<{ items: { sessionId: string }[] }>('session/list', { _request: {} })
    const aliceIds = aliceList.items.map(item => item.sessionId)
    const bobIds = bobList.items.map(item => item.sessionId)
    expect(aliceIds).toContain(aliceSession.sessionId)
    expect(bobIds).toContain(bobSession.sessionId)
    expect(aliceIds).not.toContain(bobSession.sessionId)
    expect(bobIds).not.toContain(aliceSession.sessionId)
    expect(await sessionIdsUnder(join(world.tenantDir(ALICE), 'sessions'))).toContain(aliceSession.sessionId)
    expect(await sessionIdsUnder(join(world.tenantDir(ALICE), 'sessions'))).not.toContain(bobSession.sessionId)
    expect(await sessionIdsUnder(join(world.tenantDir(BOB), 'sessions'))).toContain(bobSession.sessionId)
    expect(await sessionIdsUnder(join(world.tenantDir(BOB), 'sessions'))).not.toContain(aliceSession.sessionId)

    // 2. Tasks are private: the seeded reminder is read by its own tenant only, so
    // the other runtime proves it never scans that tenant's task domain.
    const aliceTasks = await alice.rpc<{ id: string; sessionId: string }[]>('schedule/catalog', {})
    const bobTasks = await bob.rpc<{ id: string }[]>('schedule/catalog', {})
    expect(aliceTasks).toEqual([expect.objectContaining({ id: SEEDED_TASK_ID, sessionId: SEEDED_TASK_SESSION })])
    expect(bobTasks).toEqual([])

    // 3. Workspaces are private: the owner may delete its own workspace; the other
    // tenant's runtime never had that workspace, so it answers a lookup failure.
    const aliceWorkspace = await alice.rpc<{ created: boolean; workspace: { workspaceId: string } }>(
      'workspace/create', { request: { path: aliceProjects } },
    )
    expect(aliceWorkspace.created).toBe(true)
    const bobDeletes = await bob.rpcResult('workspace/delete', { request: { workspaceId: aliceWorkspace.workspace.workspaceId } })
    expect(bobDeletes.ok, JSON.stringify(bobDeletes)).toBe(false)
    expect(await readTenantStorage(world, ALICE, 'workspace.json')).toContain(aliceProjects)
    expect(await readTenantStorage(world, BOB, 'workspace.json')).not.toContain(aliceProjects)
    expect(await alice.rpc('workspace/delete', { request: { workspaceId: aliceWorkspace.workspace.workspaceId } })).toBeDefined()

    // 4. Model settings are per account: a value written through one runtime
    // stays in that runtime's own harness home, and the other account is
    // unaffected — it configures its own.
    const before = await alice.rpc<{ hasDocument: boolean }>('settings/describe', {})
    expect(before.hasDocument).toBe(true)
    await alice.rpc('settings/update', { ns: 'ui-theme', patch: { fontSize: 16 }, expectedRevision: 0 })
    await expect.poll(
      async () => (await alice.rpc<{ namespaces: { ns: string; value: { fontSize?: number } }[] }>('settings/describe', {}))
        .namespaces.find(entry => entry.ns === 'ui-theme')?.value.fontSize,
      { timeout: 10_000 },
    ).toBe(16)
    const bobSettings = await bob.rpc<{ namespaces: { ns: string; value: { fontSize?: number } }[] }>('settings/describe', {})
    // The other account never carries the value the first one wrote. A default
    // it reports on its own is its own document, not inheritance.
    expect(bobSettings.namespaces.find(entry => entry.ns === 'ui-theme')?.value.fontSize).not.toBe(16)
    expect(await readFile(join(world.tenantDir(ALICE), 'settings.yaml'), 'utf8')).toContain('fontSize')
    expect(await readFile(join(world.tenantDir(BOB), 'settings.yaml'), 'utf8').catch(() => '')).not.toContain('fontSize')

    // 5. Plugins are per account too: each runtime booted its own profile
    // directory inside its own home, and the deployment home holds neither a
    // profile nor a settings document — only the roster and the tenant homes.
    for (const tenant of [ALICE, BOB]) {
      expect(await readdir(world.tenantDir(tenant))).toContain('profiles')
    }
    // Only the account that configured something holds a settings document;
    // the other home carries its own credentials and profile, not that value.
    expect(await readdir(world.tenantDir(ALICE))).toContain('settings.yaml')
    expect(await readdir(world.tenantDir(BOB))).not.toContain('settings.yaml')
    const deploymentEntries = await readdir(world.home)
    expect(deploymentEntries).not.toContain('profiles')
    expect(deploymentEntries).not.toContain('settings.yaml')

    // 6. Forwarded events do not cross: each tenant's stream delivers its own
    // Session additions, and neither delivers the other's.
    const aliceEvents = await openForwardedEvents(alice)
    const bobEvents = await openForwardedEvents(bob)
    try {
      const secondAlice = await alice.rpc<{ sessionId: string }>('session/create', { request: { cwd: alice.cwd } })
      await aliceEvents.waitFor(event => addedSession(event, secondAlice.sessionId))
      const bobSession = await bob.rpc<{ sessionId: string }>('session/create', { request: { cwd: bob.cwd } })
      await bobEvents.waitFor(event => addedSession(event, bobSession.sessionId))
      const bobAdditions = bobEvents.received
        .filter(event => event.event === 'api-session/added')
        .flatMap(event => event.args)
        .map(payload => (payload as { sessionId?: unknown }).sessionId)
      expect(bobAdditions).toContain(bobSession.sessionId)
      expect(bobAdditions).not.toContain(secondAlice.sessionId)
      expect(bobAdditions).not.toContain(aliceSession.sessionId)
    } finally {
      await aliceEvents.close()
      await bobEvents.close()
    }

    // 7. A foreign Session identity is refused by the executor, and the same
    // request succeeds for the tenant that owns it.
    const stolen = await bob.rpcResult('session/rename', { request: { sessionId: aliceSession.sessionId, title: 'stolen by bob' } })
    expect(stolen.ok, JSON.stringify(stolen)).toBe(false)
    const renamed = await alice.rpc<{ title: string }>('session/rename', { request: { sessionId: aliceSession.sessionId, title: 'owned by alice' } })
    expect(renamed.title).toBe('owned by alice')
  })
})
