/** Per-Session Chat view store. */
import { defineStore, type EngineStoreHandle } from '@qilin-agent/client-store'
import type { ChatStoreState, TurnProcessViewEntry } from './contract/store.ts'
import type { TurnProcessSpec } from './contract/turn-process.ts'

type ChatActions = {
  setTurnProcessOpen: (
    draft: ChatStoreState,
    turn: number,
    answerStep: number,
    open: boolean,
    reader?: boolean,
    focusedNode?: string,
  ) => void
  consumeTurnProcessFocus: (draft: ChatStoreState, turn: number) => void
}

/**
 * Resolve the manual disclosure choice for one Turn.
 * @param state - Chat store snapshot.
 * @param turn - owning Turn.
 * @returns the Turn's stored entry, when present.
 */
export function storedTurnProcessEntry(
  state: Readonly<ChatStoreState>,
  turn: number,
): Readonly<TurnProcessViewEntry> | undefined {
  return state.turnProcesses.find(entry => entry.turn === turn)
}

/**
 * Whether a foldable Turn's process is open: the reader's choice for the current answer generation
 * wins; otherwise the latest completed Turn stays open until the next input, and older Turns fold.
 * @param state - Chat store snapshot.
 * @param spec - the Turn's process specification.
 * @param defaultOpen - whether this Turn is exempt from automatic folding.
 * @returns the effective open state.
 */
export function turnProcessOpen(
  state: Readonly<ChatStoreState>,
  spec: Pick<TurnProcessSpec, 'turn' | 'answerStep'>,
  defaultOpen: boolean,
): boolean {
  const stored = storedTurnProcessEntry(state, spec.turn)
  if (stored === undefined) return defaultOpen
  // A reader's own expansion outlives the answer step it was made in: rows the
  // reader opened stay open when the running Turn settles. Automatic reveals do
  // not, so a historical Turn still folds with its generation.
  if (stored.reader === true && stored.collapsed !== true) return true
  if (stored.answerStep !== (spec.answerStep ?? 0)) return defaultOpen
  return stored.collapsed !== true
}

/**
 * Create the Chat view store handle.
 * @returns a handle instantiated once per rendered Session scope.
 */
export function createChatStore(): EngineStoreHandle<ChatStoreState, ChatActions> {
  return defineStore({
    init: (): ChatStoreState => ({ turnProcesses: [] }),
    actions: {
      setTurnProcessOpen: (draft, turn, answerStep, open, reader = false, focusedNode) => {
        const index = draft.turnProcesses.findIndex(entry => entry.turn === turn)
        const previous = index < 0 ? undefined : draft.turnProcesses[index]
        const carriedFocusedNode = focusedNode ?? previous?.focusedNode
        const next = (open
          ? {
            turn, answerStep,
            ...reader ? { reader: true as const } : {},
            ...(carriedFocusedNode === undefined ? {} : { focusedNode: carriedFocusedNode }),
          }
          : { turn, answerStep, collapsed: true as const }) satisfies TurnProcessViewEntry
        if (index < 0) draft.turnProcesses.push(next)
        else draft.turnProcesses[index] = next
      },
      consumeTurnProcessFocus: (draft, turn) => {
        const index = draft.turnProcesses.findIndex(entry => entry.turn === turn)
        const entry = index < 0 ? undefined : draft.turnProcesses[index]
        if (entry === undefined || entry.focusedNode === undefined) return
        const { focusedNode: _consumed, ...next } = entry
        draft.turnProcesses[index] = next
      },
    },
  })
}
