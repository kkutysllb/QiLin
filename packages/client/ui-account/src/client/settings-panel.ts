/**
 * Whether the neighbouring settings panel is mounted. The account menu's
 * Settings row is that panel's entry point, and a composition may omit the
 * panel entirely — a fixture surface that serves no settings traffic mounts the
 * menu alone — so the row follows this flag instead of the menu's own
 * activation waiting on the panel's service.
 */

import { createSnapshotStore, type SnapshotStore } from '@qilin/client-store'

/** Live availability of the settings panel behind the menu's Settings row. */
export class SettingsPanelPresence {
  /** Reactive presence flag; false until the panel provides its open channel. */
  readonly mounted: SnapshotStore<boolean> = createSnapshotStore(false)

  /**
   * Publish whether the panel's open channel resolves.
   * @param mounted - whether the settings shell is mounted in this composition.
   */
  publish(mounted: boolean): void {
    if (this.mounted.getSnapshot() === mounted) return
    this.mounted.set(mounted)
  }
}
