/** The Git card's staged form over the `workspace-git` settings namespace. */

import type { SnapshotStore } from '@qilin/client-store'
import type { ConfigForm } from '@qilin/client-ui-settings/client'
import { CardForm, numberField, textField, type CardActions, type CardFieldState, type CardShell } from './card-form.ts'

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
export interface GitCardState extends CardShell {
  /** Git executable path. */
  gitBin: CardFieldState
  /** gh executable path. */
  ghBin: CardFieldState
  /** Content or mutation command timeout. */
  timeoutMs: CardFieldState
  /** Repository-discovery command timeout. */
  discoveryTimeoutMs: CardFieldState
  /** gh command timeout. */
  ghTimeoutMs: CardFieldState
  /** Diff answer cap. */
  maxDiffBytes: CardFieldState
  /** stderr answer cap. */
  maxStderrChars: CardFieldState
  /** List entry cap. */
  maxListEntries: CardFieldState
}

/** The registration-side face the Git card's slot entry injects. */
export interface GitCardFace extends CardActions {
  hooks: {
    /** Card snapshot bound by the renderer as useGitCard. */
    gitCard: SnapshotStore<GitCardState>
  }
}

/** Bridges the `workspace-git` scope onto the Git card's staged form. */
export class GitCardController {
  private readonly form: CardForm<GitSettings>
  private readonly store: SnapshotStore<GitCardState>

  /** @param scope - the bound settings scope for the `workspace-git` namespace. */
  constructor(scope: ConfigForm<GitSettings>) {
    this.form = new CardForm(scope, [
      textField('gitBin'), textField('ghBin'),
      numberField('timeoutMs'), numberField('discoveryTimeoutMs'), numberField('ghTimeoutMs'),
      numberField('maxDiffBytes'), numberField('maxStderrChars'), numberField('maxListEntries'),
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
