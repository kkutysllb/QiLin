/** One accepted preference drives every developer-tool consumer. */

import { createSnapshotStore, type ObservableSnapshot } from '@qilin/client-store'
import type { DeveloperToolsSettings } from '../developer-tools-settings.ts'
import type { SettingsScope } from './settings-contract.ts'

/** Shared preference; Host-backed features stay disabled until an accepted value arrives. */
export class DeveloperToolsPreference {
  /** Accepted enablement, observable through renderer-bound hooks. */
  readonly enabled: ObservableSnapshot<boolean>
  private readonly local = createSnapshotStore(true)

  /**
   * @param scope - settings-owned namespace scope.
   */
  constructor(private readonly scope: SettingsScope<DeveloperToolsSettings>) {
    // A remote browser keeps the choice process-local: the scope never writes
    // in memory mode, so the row's choice lives here until reload.
    this.enabled = scope.getSnapshot().mode === 'memory' ? this.local : {
      getSnapshot: () => scope.getSnapshot().value?.enabled ?? false,
      subscribe: (listener) => {
        let previous = this.enabled.getSnapshot()
        return scope.subscribe(() => {
          const next = this.enabled.getSnapshot()
          if (next === previous) return
          previous = next
          listener()
        })
      },
    }
  }

  /**
   * Persist a Host choice, or update the shared browser-local choice.
   * @param enabled - requested developer-tool mode.
   * @returns settlement after local publication or Host acceptance; rejects when
   * the write fails on the wire (a refused write recovers silently instead).
   */
  async setEnabled(enabled: boolean): Promise<void> {
    if (this.scope.getSnapshot().mode === 'memory') {
      this.local.set(enabled)
      return
    }
    await this.scope.set('enabled', enabled)
  }
}
