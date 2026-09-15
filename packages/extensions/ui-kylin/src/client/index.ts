/** Kylin dynamic-plugin cards, inventory panel, business-view host, and `@pluginId` source. */

import type { Context as ClientContext } from '@qilin/kylin'
import type { SessionId } from '@qilin/session/types'
import type {} from '@qilin/client-ui-tool/client'
import type {} from '@qilin/client-locale/client'
import type {} from '@qilin/client-ui-sidebar/client'
import type {} from '@qilin/api-remotes/client'
import type {} from '@qilin/client-ui-renderer/client'
import type {} from '@qilin/client-ui-session/client'
import type { InputTriggerService, InputTriggerSource } from '@qilin/client-ui-input-trigger/client'
import type {} from './events.ts'
import { KylinActionRow } from './KylinActionRow.tsx'
import { KylinDefineRow } from './KylinDefineRow.tsx'
import { KylinRunRow } from './KylinRunRow.tsx'
import { KylinPanel } from './KylinPanel.tsx'
import { createKylinInventory } from './inventory.ts'
import { KylinRunCardRegistry } from './run-card-index.ts'
import type { KylinDynamicPort } from './dynamic-port.ts'
import type { KylinCardFace, KylinPanelFace, KylinRunCardFace } from './slots.ts'
import { en, NS, zh } from './locales.ts'

export type { KylinCardFace, KylinPanelFace, KylinRunCardFace, KylinToolViewOwnerProps } from './slots.ts'
export type { KylinActionResult, KylinDynamicPort, KylinInventoryRow } from './dynamic-port.ts'
export type { KylinDefineRowProps } from './KylinDefineRow.tsx'
export type { KylinActionRowProps } from './KylinActionRow.tsx'
export type { KylinRunRowProps } from './KylinRunRow.tsx'
export type {
  KylinRunCardPointer, KylinRunCardStore, KylinToolViewKey,
} from './run-card-index.ts'
export type {
  ApprovalRequestId, KylinDynamicPackageId, KylinDynamicPluginId, KylinDynamicPluginRunId,
  DynamicKylinInventoryRow, DynamicKylinPackage, DynamicKylinRetracted,
} from './events.ts'
export type { KylinKey } from './locales.ts'

/** Required services for the two Tool cards, panel, Remote lifecycle, and Slash source. */
export const inject = [
  'slots', 'locale', 'inputTriggers', 'remote', 'remote.dynamicKylinRunner', 'dynamicKylinRunner',
]

/** Mount every Kylin browser surface over the shared Host inventory. */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-kylin: dictionaries')

  const port: KylinDynamicPort = {
    stop: async (sessionId, pluginId) => {
      const answered = await ctx.remote.dynamicKylinRunner.stopFromPanel(sessionId, pluginId)
      if (!answered.ok) return { ok: false, message: `${answered.error.code}: ${answered.error.message}` }
      if (answered.value.ok || answered.value.reason === 'not-running') return { ok: true }
      return { ok: false, message: answered.value.message }
    },
    remove: async (sessionId, pluginId) => {
      const answered = await ctx.remote.dynamicKylinRunner.undefineFromPanel(sessionId, pluginId)
      if (!answered.ok) return { ok: false, message: `${answered.error.code}: ${answered.error.message}` }
      return answered.value.ok ? { ok: true } : { ok: false, message: answered.value.message }
    },
    inventory: async () => {
      const answered = await ctx.remote.dynamicKylinRunner.inventory()
      if (!answered.ok) throw new Error(`${answered.error.code}: ${answered.error.message}`)
      return answered.value
    },
  }
  const inventory = createKylinInventory(port, (error) => {
    console.error('[ui-kylin] reading the Kylin inventory failed:', error)
  })
  const runner = ctx.dynamicKylinRunner
  const loaded = { getSnapshot: () => runner.getSnapshot(), subscribe: (fn: () => void) => runner.subscribe(fn) }
  const runCards = new KylinRunCardRegistry()

  ctx.effect(() => inventory.subscribe(() => {
    const snapshot = inventory.getSnapshot()
    if (snapshot.read) runner.reconcileApprovals(snapshot.rows)
  }), 'ui-kylin: reconcile pending approvals')

  ctx.remote.$on('kylin/dynamic-package', () => { inventory.refresh() })
  ctx.remote.$on('kylin/dynamic-retract', () => { inventory.refresh() })
  ctx.remote.$on('kylin/request-run', (request) => {
    if (!inventory.getSnapshot().rows.some(row => row.pluginId === request.pluginId)) inventory.refresh()
  })
  ctx.remote.$on('kylin/request-run-resolved', () => { inventory.refresh() })
  ctx.on('connection/reset', () => {
    inventory.reset()
    inventory.refresh()
  })

  ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
    name: 'sidebar.footer.action',
    id: 'kylin-panel',
    locale: NS,
    inject: (): KylinPanelFace => ({
      hooks: {
        inventory,
        activeRuns: runner.activeRuns,
        runErrors: runner.lastRunError,
        loaded,
        renderFailures: runner.renderFailures,
      },
      onApprove: (requestId, approveFutureVersions) => runner.approve(requestId, approveFutureVersions),
      onDecline: requestId => runner.decline(requestId),
      onRun: request => runner.startUserRun(request),
      onStop: async (sessionId, pluginId) => {
        const result = await port.stop(sessionId, pluginId)
        inventory.refresh()
        return result
      },
      onRemove: async (sessionId, pluginId) => {
        const result = await port.remove(sessionId, pluginId)
        if (result.ok) inventory.retire(pluginId)
        inventory.refresh()
        return result
      },
      onRefresh: () => { inventory.refresh() },
    }),
  }, KylinPanel))

  const cardFace = (): KylinCardFace => ({ hooks: { inventory, loaded } })
  ctx.slots.inject('tool.call.toolview', () => ctx.slots.register({
    name: 'tool.call.toolview',
    key: 'kylin_define',
    locale: NS,
    inject: cardFace,
  }, KylinDefineRow))

  ctx.slots.inject('tool.call.toolview', () => ctx.slots.register({
    name: 'tool.call.toolview',
    key: 'kylin_run',
    locale: NS,
    children: { 'tool.view.kylin': { kind: 'keyed', scope: 'session' } },
    inject: (sessionId: SessionId): KylinRunCardFace => {
      const store = runCards.forSession(sessionId)
      return {
        hooks: { inventory, loaded, runCards: store, activeRuns: runner.activeRuns },
        onObserveRunCard: (pointer) => { store.observe(pointer) },
      }
    },
  }, KylinRunRow))

  ctx.slots.inject('tool.call.toolview', function* () {
    yield ctx.slots.register({
      name: 'tool.call.toolview', key: 'kylin_stop', locale: NS,
    }, KylinActionRow)
    yield ctx.slots.register({
      name: 'tool.call.toolview', key: 'kylin_undefine', locale: NS,
    }, KylinActionRow)
  })

  const rowsOf = (sessionId: SessionId, query: string) => inventory.getSnapshot().rows
    .filter(row => row.agentId === sessionId && String(row.pluginId).includes(query))
  const source: InputTriggerSource = {
    trigger: '@',
    name: 'kylin',
    order: 1,
    candidates(session, { query }) {
      const rows = rowsOf(session.sessionId, query)
      return Promise.resolve(rows.map((row) => {
        const packageId = row.nextPackageId ?? row.currentPackageId ?? row.packages.at(-1)?.packageId
        const pkg = packageId === undefined ? undefined : row.packages.find(candidate => candidate.packageId === packageId)
        return {
          name: String(row.pluginId),
          ...pkg === undefined ? {} : { description: pkg.purpose },
        }
      }))
    },
    warm() { inventory.refresh() },
    lexicon(session) { return rowsOf(session.sessionId, '').map(row => String(row.pluginId)) },
    subscribeLexicon(_session, listener) { return inventory.subscribe(listener) },
    onPick({ candidate }) { return { text: `@${candidate.name} ` } },
  }
  const slash = ctx.get('inputTriggers') as InputTriggerService
  ctx.effect(() => slash.registerSource(source), 'ui-kylin: @pluginId source')

  inventory.refresh()
}
