/** Conversation view and session-local presentation state. */

/**
 * One conversation view tab, projected from a 'conversation.view' slot
 * entry's registration options (label falls back to the entry id).
 */
export interface ViewTab { id: string; label: string }

/** Per-session state owned by the target-neutral Conversation shell. */
/** Conversation view and session-local presentation state. */

/**
 * One conversation view tab, projected from a 'conversation.view' slot
 * entry's registration options (label falls back to the entry id).
 */
export interface ViewTab { id: string; label: string }

/** One-shot focus request addressed to a Conversation View. */
export interface ConversationViewRequest {
  /** Target `conversation.view` entry id. */
  readonly view: string
  /** Target-owned opaque focus identity. */
  readonly focus: string
}

export interface ConversationStoreState {
  /** Composer draft (persisted; survives session switches and reloads). */
  draft: string
  /** Preferred `conversation.view` entry id; null resolves to Chat when registered. */
  view: string | null
  /** One-shot focus request addressed to the selected View. */
  viewRequest: ConversationViewRequest | null
}
