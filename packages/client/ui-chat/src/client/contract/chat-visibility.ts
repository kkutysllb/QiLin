/** Chat-only row visibility; durable events and trajectory inspection remain intact. */
import type { ChatNode } from './chat-nodes.ts'

/**
 * Exclude system prompts and permission commands from visible Chat rows.
 * Logged context keeps its disclosure row — instructions, the skill catalog,
 * snapshot notices, and recalls — so a reader can open what the model received.
 * @param node - projected Chat node.
 * @returns whether the node contributes a visible Chat row.
 */
export function isVisibleChatNode(node: ChatNode): boolean {
  return node.visibility === 'visible'
    && node.kind !== 'system-prompt'
    && !(node.kind === 'command' && node.data.name === 'permission')
}
