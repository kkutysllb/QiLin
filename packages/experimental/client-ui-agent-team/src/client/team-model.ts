/**
 * Pure Team-page arithmetic: status→copy mapping, dot states, and the
 * create/edit draft rules, shared by the conversation popover and the
 * right-Sidebar page. No React, no stores, no Remote calls.
 */
import type { TeamTaskId, TeamTaskView as TeamTask } from '@qilin-agent/experimental-agent-team/client'
import type { StateDotState } from '@qilin-agent/client-ui-primitives'
import type { TeamKey } from './locales.ts'

/** Durable lifecycle overlaid with the member Session's live turn activity. */
export type MemberStatus = 'running' | 'inactive' | 'provisioning' | 'failed'

/**
 * Map one task status onto its status copy key.
 * @param status - the task's durable status.
 * @returns the locale key naming that status.
 */
export function statusKey(status: TeamTask['status']): TeamKey {
  switch (status) {
    case 'pending': return 'status.pending'
    case 'in_progress': return 'status.in_progress'
    case 'completed': return 'status.completed'
    /* v8 ignore next -- Team views omit deleted task tombstones. */
    case 'deleted': return 'status.completed'
  }
}

/**
 * Map one member status onto its status copy key.
 * @param status - the member's overlaid lifecycle status.
 * @returns the locale key naming that status.
 */
export function memberStatusKey(status: MemberStatus): TeamKey {
  switch (status) {
    case 'running': return 'memberStatus.running'
    case 'inactive': return 'memberStatus.inactive'
    case 'provisioning': return 'memberStatus.provisioning'
    case 'failed': return 'memberStatus.failed'
  }
}

/**
 * Map one live member status onto its roster dot state.
 * @param status - a member status that renders as a dot rather than a glyph.
 * @returns the shared dot state for that status.
 */
export function memberDotState(status: Exclude<MemberStatus, 'inactive'>): StateDotState {
  switch (status) {
    case 'running':
    case 'provisioning': return 'ongoing'
    case 'failed': return 'error'
  }
}

/**
 * Map one task onto its board dot state: blocked pending tasks warn.
 * @param task - the task view to render.
 * @returns the shared dot state for the task's board position.
 */
export function taskDotState(task: TeamTask): StateDotState {
  switch (task.status) {
    case 'pending': return task.ready ? 'idle' : 'warning'
    case 'in_progress': return 'ongoing'
    case 'completed': return 'done'
    /* v8 ignore next -- Team views omit deleted task tombstones. */
    case 'deleted': return 'idle'
  }
}

/** One create or edit draft exactly as the form holds it: texts, not yet lists. */
export interface TeamDraft {
  /** Task subject exactly as typed; commits require it nonempty. */
  subject: string
  /** Task description exactly as typed. */
  description: string
  /** Blocker task ids as one comma-separated line. */
  blockers: string
  /** Write scopes as one comma-separated line. */
  scopes: string
}

/**
 * An empty draft for the create form.
 * @returns a draft with every field blank.
 */
export function emptyTeamDraft(): TeamDraft {
  return { subject: '', description: '', blockers: '', scopes: '' }
}

/**
 * A draft pre-filled from one task for the edit form.
 * @param task - the task being edited.
 * @returns the draft holding the task's current texts and lists.
 */
export function teamDraftOf(task: TeamTask): TeamDraft {
  return {
    subject: task.subject,
    description: task.description,
    blockers: task.blockedBy.join(', '),
    scopes: task.writeScopes.join(', '),
  }
}

/**
 * Split one comma-separated line into trimmed, de-duplicated items in first
 * occurrence order; empty items drop.
 * @param text - the line as typed.
 * @returns the normalized items.
 */
export function teamItems(text: string): string[] {
  const items: string[] = []
  for (const item of text.split(',')) {
    const trimmed = item.trim()
    if (trimmed !== '' && !items.includes(trimmed)) items.push(trimmed)
  }
  return items
}

/**
 * Whether one draft names a subject and a description and may commit.
 * @param draft - the form state as typed.
 * @returns whether the commit button may act on this draft.
 */
export function isTeamDraftCommittable(draft: TeamDraft): boolean {
  return draft.subject.trim() !== '' && draft.description.trim() !== ''
}

/**
 * Normalize one draft into the wire request's fields: trimmed texts, parsed lists.
 * @param draft - the form state as typed.
 * @returns the fields one create or edit request carries.
 */
export function teamFormFieldsOf(draft: TeamDraft): {
  readonly subject: string
  readonly description: string
  readonly blockers: readonly TeamTaskId[]
  readonly writeScopes: readonly string[]
} {
  return {
    subject: draft.subject.trim(),
    description: draft.description.trim(),
    blockers: teamItems(draft.blockers).map(id => id as TeamTaskId),
    writeScopes: teamItems(draft.scopes),
  }
}

/**
 * Whether two id-or-scope lists name the same set regardless of order; an
 * order-only difference needs no write.
 * @param left - one list as currently stored.
 * @param right - the other list as committed from the form.
 * @returns whether both lists hold the same members.
 */
export function sameTeamSet(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && [...left].sort().join('\n') === [...right].sort().join('\n')
}
