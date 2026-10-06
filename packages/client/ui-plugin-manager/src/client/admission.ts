/**
 * The workbench-audience presentation gate: entries a bundle registers read as
 * unregistered to the renderer while its audience excludes the active
 * workbench, so its seats fall back the way an absent plugin's do. The manager
 * page's own list and the Host's composition stay complete — this filters
 * presentation only.
 */

import type { Context as ClientContext } from '@qilin/kylin'
import type { PluginAudience } from '@qilin/api-remotes/client'
import type { Workbench, WorkbenchTag } from '@qilin/client-ui-workbench/client'
import type { PluginManagerState } from './manager-store.ts'

/**
 * Whether one bundle's UI presents on the active workbench.
 * @param audience - the bundle's recorded audience.
 * @param active - the workbench tag in view.
 */
export function audienceAdmits(audience: PluginAudience, active: WorkbenchTag): boolean {
  return audience === 'both' || audience === active
}

/**
 * Install the renderer's admission gate over the manager's package list and
 * the workbench tag, and keep its revision current while either moves. The
 * gate itself reads the latest snapshots per call, so an admission answer
 * never waits on this publisher.
 * @param ctx - the plugin manager's browser context (`slots` and `workbench` live on it).
 * @param workbench - the active-tag owner.
 * @param manager - the page state whose `packages` carry each bundle's audience.
 */
export function installAudienceGate(
  ctx: ClientContext,
  workbench: Workbench,
  manager: { getSnapshot(): PluginManagerState; subscribe(listener: () => void): () => void },
): void {
  let revision = 0
  let signature: string | undefined
  const listeners = new Set<() => void>()
  const republish = (): void => {
    // One comparable line per admitted-set state: the active tag and the names
    // its view hides. An equal line publishes nothing.
    const active = workbench.state.getSnapshot().active
    const hidden = manager.getSnapshot().packages
      .filter(pkg => !audienceAdmits(pkg.audience, active)).map(pkg => pkg.name).sort().join('\n')
    const next = `${active}\n${hidden}`
    if (next === signature) return
    signature = next
    revision += 1
    for (const listener of [...listeners]) listener()
  }
  ctx.slots.installAdmission({
    admit: (registrant) => {
      if (registrant === undefined) return true
      const active = workbench.state.getSnapshot().active
      const pkg = manager.getSnapshot().packages.find(candidate => candidate.name === registrant)
      // A name the manager has not read — built-ins before their first listing,
      // shell internals — presents; only a read record can exclude its bundle.
      return pkg === undefined ? true : audienceAdmits(pkg.audience, active)
    },
    revision: {
      getSnapshot: () => revision,
      subscribe: (listener) => {
        listeners.add(listener)
        return () => { listeners.delete(listener) }
      },
    },
  })
  const disposeWorkbench = workbench.state.subscribe(republish)
  const disposeManager = manager.subscribe(republish)
  republish()
  ctx.effect(() => () => { disposeWorkbench(); disposeManager() }, 'ui-plugin-manager: audience gate subscriptions')
}
