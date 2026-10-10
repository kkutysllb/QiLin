/** The shell card's staged form over the `bash` settings namespace. */

import type { SnapshotStore } from '@qilin-agent/client-store'
import type { ConfigForm } from '@qilin-agent/client-ui-settings/client'
import { SettingsFormModel, settingsNumberField, type SettingsFormActions, type SettingsFieldState, type SettingsFormShell } from '@qilin-agent/client-ui-primitives'

/**
 * Namespace of the shell capability. Spelled here rather than imported: a
 * client package must not depend on a Host package, and the executor families
 * that own it spell the same value.
 */
export const SHELL_NS = 'shell'

/** The shell fields this card edits — a subset of the served schema by design. */
export interface BashSettings {
  /** Foreground command timeout in milliseconds. */
  timeoutMs?: number
  /** Per-stream in-memory output cap in bytes. */
  maxOutputBytes?: number
}

/** What the shell card renders. */
export interface BashCardState extends SettingsFormShell {
  /** Command timeout in milliseconds. */
  timeoutMs: SettingsFieldState
  /** Per-stream output cap in bytes. */
  maxOutputBytes: SettingsFieldState
}

/** The registration-side face the shell card's slot entry injects. */
export interface BashCardFace extends SettingsFormActions {
  hooks: {
    /** Card snapshot bound by the renderer as useBashCard. */
    bashCard: SnapshotStore<BashCardState>
  }
}

/** Bridges the `bash` scope onto the shell card's staged form. */
export class BashCardController {
  private readonly form: SettingsFormModel<BashSettings>
  private readonly store: SnapshotStore<BashCardState>

  /** @param scope - the bound settings scope for the `bash` namespace. */
  constructor(scope: ConfigForm<BashSettings>) {
    this.form = new SettingsFormModel(scope, [settingsNumberField('timeoutMs'), settingsNumberField('maxOutputBytes')])
    this.store = this.form.bind(() => this.projection())
  }

  private projection(): BashCardState {
    return {
      ...this.form.shell(),
      timeoutMs: this.form.field('timeoutMs'),
      maxOutputBytes: this.form.field('maxOutputBytes'),
    }
  }

  /**
   * Build the face the card's slot registration injects.
   * @returns the card's snapshot and its form actions.
   */
  inject(): BashCardFace {
    return { hooks: { bashCard: this.store }, ...this.form.actions() }
  }
}
