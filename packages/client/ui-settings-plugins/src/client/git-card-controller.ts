/** The Git card's staged form over the `workspace-git` settings namespace. */

import type { SnapshotStore } from '@qilin-agent/client-store'
import type { ConfigForm } from '@qilin-agent/client-ui-settings/client'
import { SettingsFormModel, settingsNumberField, settingsTextField, type SettingsFormActions, type SettingsFieldState, type SettingsFormShell } from '@qilin-agent/client-ui-primitives'

/**
 * Namespace of the workspace Git service. Spelled here rather than imported:
 * a client package must not depend on a Host package, and the service plugin
 * that owns it spells the same value.
 */
export const GIT_NS = 'workspace-git'

/** The Git fields this card edits — the whole served schema. */
export interface GitSettings {
  /** Git executable spawned for every repository call. */
  gitBin?: string
  /** gh executable spawned for every pull-request call. */
  ghBin?: string
  /** Timeout on one content or mutation command, in milliseconds. */
  timeoutMs?: number
  /** Timeout on one repository-discovery command, in milliseconds. */
  discoveryTimeoutMs?: number
  /** Timeout on one `gh` call, in milliseconds. */
  ghTimeoutMs?: number
  /** Inclusive byte cap on one diff answer. */
  maxDiffBytes?: number
  /** Character cap on the stderr carried by one error answer. */
  maxStderrChars?: number
  /** Entry cap on one branch or pull-request list answer. */
  maxListEntries?: number
}

/** What the Git card renders. */
export interface GitCardState extends SettingsFormShell {
  /** Git executable path. */
  gitBin: SettingsFieldState
  /** gh executable path. */
  ghBin: SettingsFieldState
  /** Content or mutation command timeout. */
  timeoutMs: SettingsFieldState
  /** Repository-discovery command timeout. */
  discoveryTimeoutMs: SettingsFieldState
  /** gh command timeout. */
  ghTimeoutMs: SettingsFieldState
  /** Diff answer cap. */
  maxDiffBytes: SettingsFieldState
  /** stderr answer cap. */
  maxStderrChars: SettingsFieldState
  /** List entry cap. */
  maxListEntries: SettingsFieldState
}

/** The registration-side face the Git card's slot entry injects. */
export interface GitCardFace extends SettingsFormActions {
  hooks: {
    /** Card snapshot bound by the renderer as useGitCard. */
    gitCard: SnapshotStore<GitCardState>
  }
}

/** Bridges the `workspace-git` scope onto the Git card's staged form. */
export class GitCardController {
  private readonly form: SettingsFormModel<GitSettings>
  private readonly store: SnapshotStore<GitCardState>

  /** @param scope - the bound settings scope for the `workspace-git` namespace. */
  constructor(scope: ConfigForm<GitSettings>) {
    this.form = new SettingsFormModel(scope, [
      settingsTextField('gitBin'), settingsTextField('ghBin'),
      settingsNumberField('timeoutMs'), settingsNumberField('discoveryTimeoutMs'), settingsNumberField('ghTimeoutMs'),
      settingsNumberField('maxDiffBytes'), settingsNumberField('maxStderrChars'), settingsNumberField('maxListEntries'),
    ])
    this.store = this.form.bind(() => this.projection())
  }

  private projection(): GitCardState {
    return {
      ...this.form.shell(),
      gitBin: this.form.field('gitBin'),
      ghBin: this.form.field('ghBin'),
      timeoutMs: this.form.field('timeoutMs'),
      discoveryTimeoutMs: this.form.field('discoveryTimeoutMs'),
      ghTimeoutMs: this.form.field('ghTimeoutMs'),
      maxDiffBytes: this.form.field('maxDiffBytes'),
      maxStderrChars: this.form.field('maxStderrChars'),
      maxListEntries: this.form.field('maxListEntries'),
    }
  }

  /**
   * Build the face the card's slot registration injects.
   * @returns the card's snapshot and its form actions.
   */
  inject(): GitCardFace {
    return { hooks: { gitCard: this.store }, ...this.form.actions() }
  }
}
