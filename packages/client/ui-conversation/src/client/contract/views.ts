/** Conversation view and session-local presentation state. */

/**
 * One conversation view tab, projected from a 'conversation.view' slot
 * entry's registration options (label falls back to the entry id).
 */
export interface ViewTab { id: string; label: string }

/** Per-session state owned by the target-neutral Conversation shell. */
export interface ConversationStoreState {
  /** Composer draft (persisted; survives session switches and reloads). */
  draft: string
  /** Preferred `conversation.view` entry id; null resolves to Chat when registered. */
  view: string | null
}
