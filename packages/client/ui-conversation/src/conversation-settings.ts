/** Conversation preferences stored in the Host user-settings document. */

import z from '@qilin/schemastery'

/** Settings namespace owned by the conversation plugin. */
export const CONVERSATION_SETTINGS_NAMESPACE = 'ui-conversation'

/** Field carrying the delivery mode for plain Enter while an agent is busy. */
export const BUSY_ENTER_FIELD = 'busyEnter'

/** Field carrying the transcript content width. */
export const CONTENT_WIDTH_FIELD = 'contentWidth'

/** Busy-Enter behaviors accepted at settings and input boundaries. */
export const BUSY_ENTER_BEHAVIORS = ['queue', 'steer'] as const

/** Configurable meaning of plain Enter while the addressed agent is busy. */
export type BusyEnterBehavior = typeof BUSY_ENTER_BEHAVIORS[number]

/** Default preserves Enter-as-Queue for running conversations. */
export const DEFAULT_BUSY_ENTER_BEHAVIOR: BusyEnterBehavior = 'queue'

/**
 * Content width that leaves the transcript to the layout's adaptive clamp
 * (`clamp(680px, 64% of the column, 920px)`); any other value is an explicit
 * width in px.
 */
export const CONTENT_WIDTH_ADAPTIVE = 0

/** Narrowest explicit content width (px); the layout center-column floor. */
export const CONTENT_WIDTH_MIN = 640

/** Widest persistable content width (px), bounding a hand-edited settings document. */
export const CONTENT_WIDTH_MAX = 2400

/** Increment one stepper click moves the content width (px). */
export const CONTENT_WIDTH_STEP = 20

/** Content width before the user picks one. */
export const DEFAULT_CONTENT_WIDTH = CONTENT_WIDTH_ADAPTIVE

/** Durable conversation section shared by the Host schema and the browser scope. */
export interface ConversationSettings {
  /** Delivery mode for plain Enter while the addressed agent is busy. */
  busyEnter: BusyEnterBehavior
  /** Transcript content width in px, or {@link CONTENT_WIDTH_ADAPTIVE} for the layout clamp. */
  contentWidth: number
}

/** Durable conversation schema; also the wire envelope the browser scope validates against. */
export const ConversationSettingsSchema: z<ConversationSettings> = z.object({
  [BUSY_ENTER_FIELD]: z.union([...BUSY_ENTER_BEHAVIORS]).default(DEFAULT_BUSY_ENTER_BEHAVIOR),
  [CONTENT_WIDTH_FIELD]: z.natural().max(CONTENT_WIDTH_MAX).default(DEFAULT_CONTENT_WIDTH),
})
