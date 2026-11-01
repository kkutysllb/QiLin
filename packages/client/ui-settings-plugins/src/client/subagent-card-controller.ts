/** Shared presentation and actions for the two Host-owned Subagent settings sections. */

import type { SettingsFormShell } from '@qilin-agent/client-ui-primitives'
import type { SnapshotStore } from '@qilin-agent/client-store'
import type { SubagentLimitsCardFace, SubagentLimitsCardState } from './subagent-limits-card-controller.ts'
import type {
  SubagentModelSelectionCardFace, SubagentModelSelectionCardState,
} from './subagent-model-selection-card-controller.ts'

/** Resolve once a form source leaves its saving phase, so the next namespace writes after it. */
async function settled(store: SnapshotStore<{ saving: boolean }>): Promise<void> {
  if (!store.getSnapshot().saving) return
  await new Promise<void>((resolve) => {
    const off = store.subscribe(() => {
      if (store.getSnapshot().saving) return
      off()
      resolve()
    })
  })
}

/** Resolve once a form source is writable again; a first write recomposes the profile, and its
 * section is briefly read-only until the Host answers the next read. */
async function writable(store: SnapshotStore<{ available: boolean; writable: boolean }>): Promise<void> {
  const ready = (): boolean => {
    const state = store.getSnapshot()
    return state.available && state.writable
  }
  if (ready()) return
  await new Promise<void>((resolve) => {
    const off = store.subscribe(() => {
      if (!ready()) return
      off()
      resolve()
    })
  })
}

/** Both existing form sources and the actions exposed by one Subagent card. */
export interface SubagentCardFace {
  hooks: SubagentLimitsCardFace['hooks'] & SubagentModelSelectionCardFace['hooks']
  editLimit: SubagentLimitsCardFace['edit']
  resetLimit: SubagentLimitsCardFace['resetField']
  toggleEnabled: SubagentModelSelectionCardFace['toggleEnabled']
  toggleModel: SubagentModelSelectionCardFace['toggleModel']
  selectDefaultRoute: SubagentModelSelectionCardFace['selectDefaultRoute']
  retryCatalog: SubagentModelSelectionCardFace['retryCatalog']
  /** Save valid drafts through their owning namespace controllers. */
  save: () => void
  /** Discard both drafts without changing persisted settings. */
  discard: () => void
}

/**
 * Derive the shared card state without duplicating either form's subscriptions.
 * @param limits - Current delegation-limit form.
 * @param models - Current model-authorization form.
 * @returns Availability and settlement across the sections this Host serves.
 */
export function subagentCardShell(
  limits: SubagentLimitsCardState,
  models: SubagentModelSelectionCardState,
): SettingsFormShell {
  const sections = [limits, models].filter(section => section.available)
  return {
    available: sections.length > 0,
    writable: sections.every(section => section.writable),
    dirty: sections.some(section => section.dirty),
    invalid: sections.some(section => section.invalid)
      || (models.available && models.dirty && models.conflicted),
    saving: sections.some(section => section.saving),
    failed: sections.some(section => section.failed),
  }
}

/**
 * Compose one card from the existing forms; each write retains its namespace revision fence.
 * @param limits - Limit form source and actions.
 * @param models - Model form source and actions.
 * @returns Framework-bound sources and shared save/discard actions.
 */
export function subagentCardFace(
  limits: SubagentLimitsCardFace,
  models: SubagentModelSelectionCardFace,
): SubagentCardFace {
  return {
    hooks: { ...limits.hooks, ...models.hooks },
    editLimit: limits.edit,
    resetLimit: limits.resetField,
    toggleEnabled: models.toggleEnabled,
    toggleModel: models.toggleModel,
    selectDefaultRoute: models.selectDefaultRoute,
    retryCatalog: models.retryCatalog,
    save: () => {
      const limitState = limits.hooks.subagentLimitsCard.getSnapshot()
      const modelState = models.hooks.subagentModelSelectionCard.getSnapshot()
      const state = subagentCardShell(limitState, modelState)
      if (!state.available || !state.writable || !state.dirty || state.invalid || state.saving) return
      // One Save writes two namespaces, and the profile patch fences each write by its
      // revision: the limit write must wait for the model write to settle instead of
      // racing it, or the later write loses the fence and is dropped.
      void (async () => {
        if (modelState.available && modelState.dirty) {
          models.save()
          await settled(models.hooks.subagentModelSelectionCard)
        }
        if (limitState.available && limitState.dirty) {
          await writable(limits.hooks.subagentLimitsCard)
          limits.save()
          await settled(limits.hooks.subagentLimitsCard)
        }
      })()
    },
    discard: () => {
      if (subagentCardShell(
        limits.hooks.subagentLimitsCard.getSnapshot(),
        models.hooks.subagentModelSelectionCard.getSnapshot(),
      ).saving) return
      limits.discard()
      models.discard()
    },
  }
}
