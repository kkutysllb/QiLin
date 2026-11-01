/** Chat-owned per-Session view state. */

/** Tool call identity as carried by Chat nodes. */
export type ToolCallId = string

/** One manual whole-Turn disclosure choice for a Turn answer generation. */
export interface TurnProcessViewEntry {
  readonly turn: number
  readonly answerStep: number
  /** Explicitly collapsed; absent means opened. */
  readonly collapsed?: true
  /** Written by the reader's own toggle rather than an automatic reveal. */
  readonly reader?: true
}

/** Per-Session state shared only by the Chat view and details surface. */
export interface ChatStoreState {
  turnProcesses: TurnProcessViewEntry[]
}
