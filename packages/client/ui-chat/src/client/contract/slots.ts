/** Chat-owned Slot declarations and composed component props. */
import type { RefObject } from 'react'
import type { MessageId } from '@qilin-agent/llm/brand'
import type { SessionId, SessionSeq } from '@qilin-agent/session/types'
import type { PendingSubmission } from '@qilin-agent/api-session-controller/client'
import type { InboxState } from '@qilin-agent/agent/types'
import type {
  CommandNode, CompactionSummaryNode, ConversationGroupData, ConversationLocationDataStore,
  ConversationTurnDataMap, GroupSnapshot, MessageImageLoader, MessageImagesOwnerProps,
  RenderEntry, RenderMessageImages, TurnLocation,
} from '@qilin-agent/client-ui-conversation/client'
import type {
  InjectFace, KeyedSnapshotSelectorHook, PropsLocale, PropsRenderSlots, PropsRuntime, PropsStore,
  SlotHookFactory, SnapshotSelectorHook,
} from '@qilin-agent/client-ui-slots'
import type { MarkdownFileMentions } from '@qilin-agent/client-ui-primitives'
import type {} from '@qilin-agent/client-ui-layout/client'
import type { createChatStore } from '../stores.ts'
import type { FlowMotionRows } from '../chat/flow-motion.ts'
import type { ToolCallId } from './store.ts'
import type { ChatConversationViewNode, ChatNode, ChatNodeKind } from './chat-nodes.ts'
import type {
  ChatNodeProcessSource, ChatNodeSource, ChatSnapshot, ChatTurnProcessPresentation,
} from './snapshot.ts'
import type { TurnProcessSpec } from './turn-process.ts'
import type { ObservableSnapshot } from '@qilin-agent/client-store'
import type { ChatPresentationPolicy } from '../presentation-policy.ts'
import type { PerformanceUsageMode } from '../../chat-settings.ts'

/** Selector hook over the current Conversation binding's Chat target. */
export type UseChat = SnapshotSelectorHook<ChatSnapshot>

/** Per-key selector hook over one Chat Node. */
export type UseChatNode = KeyedSnapshotSelectorHook<ChatConversationViewNode | undefined>

/** Per-key selector hook over one Chat Node's Turn-process presentation. */
export type UseChatNodeProcess = KeyedSnapshotSelectorHook<ChatTurnProcessPresentation | undefined>

/**
 * Selector hook over the live presentation policy. Callers select one field or
 * a derived conclusion, never the whole policy, so a mode change re-renders
 * only components whose selected value changed.
 */
export type UsePresentation = SnapshotSelectorHook<ChatPresentationPolicy>

/** Where in a file an open should land. */
export interface OpenFileOptions {
  /** 1-based line to reveal; absent = the file's beginning. */
  readonly line?: number
}

/** Owner currency of the completed-Turn extension chain. */
export interface TurnTailOwnerProps {
  turn: TurnLocation
  seq: number
  openFile: (path: string) => void
}

/** Owner currency of finalized-assistant actions. */
export interface AssistantActionOwnerProps {
  messageId: MessageId
}

/** Optional prose file-mention provider consumed by Chat. */
export interface ChatFileMentions {
  /**
   * Resolve prose links for one closing Turn.
   * @param owner - closing-Turn identity and file opener.
   * @param sessionId - viewed Session, including when history is inherited from a fork.
   * @returns link resolver when available.
   */
  forClosing(owner: TurnTailOwnerProps, sessionId: SessionId): MarkdownFileMentions | undefined
}

declare module '@qilin-agent/kylin' {
  interface Context {
    /** Optional prose file-mention provider. */
    chatFileMentions: ChatFileMentions
  }
}

/** Hook constrained to business data published on the current Chat Node's Turn. */
export type UseChatNodeTurnData = <Key extends Extract<keyof ConversationTurnDataMap, string>>(
  key: Key,
) => Readonly<ConversationTurnDataMap[Key]> | undefined

/**
 * Subscribe to enclosing-Turn resets and own one initially collapsed disclosure.
 * Each invocation has independent open state; display-mode changes do not reset it.
 * @returns the current open state, explicit setter, and toggle action.
 */
export type UseDisclosure = () => {
  readonly expanded: boolean
  /** @param open - whether this disclosure is expanded. */
  readonly setExpanded: (open: boolean) => void
  readonly toggle: () => void
}

/**
 * Searchable process hiding bound to the current node render's viewport.
 * @param hidden - desired hidden state.
 * @param reveal - browser-find and focus-protection callback.
 * @returns the stable process-container ref.
 */
export type UseGroupAction = (hidden: boolean, reveal: () => void) => RefObject<HTMLDivElement>

/**
 * Plain header visibility bound to the flow's viewport, including growth on reveal.
 * @param ref - stable header element.
 * @param hidden - desired hidden state.
 */
export type UseGroupHeaderAction = (ref: RefObject<HTMLElement | null>, hidden: boolean) => void

/** Viewport capability supplied once for each rendered Chat flow. */
export interface ChatFlowHookContext {
  readonly motion: FlowMotionRows
}

/** Flow-wide behavior hooks bound to one viewport, independently of Session identity. */
export interface ChatFlowInjected {
  hooks: {
    groupAction: SlotHookFactory<'conversation.chat.flow', UseGroupAction>
    groupHeaderAction: SlotHookFactory<'conversation.chat.flow', UseGroupHeaderAction>
  }
}

/** Stable sources and capabilities bound to one rendered Chat Node. */
export interface ChatNodeHookContext {
  readonly turnData: ConversationLocationDataStore<ConversationTurnDataMap> | undefined
  readonly disclosureReset: ObservableSnapshot<number>
  /** Absent for standalone rendering without a Chat flow. */
  readonly useGroupAction?: UseGroupAction | undefined
}

/** Slot-level Hook factories for keyed Chat renderers. */
export interface ChatNodeInjected {
  hooks: {
    turnData: SlotHookFactory<'conversation.chat.node', UseChatNodeTurnData>
    disclosure: SlotHookFactory<'conversation.chat.node', UseDisclosure>
  }
}

/** Stable owner currency delivered to a keyed Chat renderer. */
export interface ChatNodeOwnerProps {
  /** Renderer-owned Node portion selected by the grouping Definition. */
  groupPart?: string
  cwd?: string | undefined
  /** Open the current source file of a skill referenced by a sent message. */
  openSkill: (name: string) => void
  openFile: (path: string, options?: OpenFileOptions) => void
  inspectCall: ((callId: ToolCallId) => void) | undefined
  forkAt: (seq: number) => void
  /**
   * Revise one sent user message: replace the composer draft with its text
   * (the user edits the bubble and resends a new turn). User bubbles only;
   * absent for owners that do not provide the wiring.
   * @param text - the user message's plain text.
   */
  editUserMessage?: ((text: string) => void) | undefined
  /** Session-authorized image loader for the attachment presentation slot. */
  loadImage: MessageImageLoader
  renderMessageImages: RenderMessageImages
  fileMentions: (owner: TurnTailOwnerProps) => MarkdownFileMentions | undefined
  /** Turn-process state when this Node belongs to a projected Turn. */
  turnProcess?: TurnProcessOwnerProps | undefined
}

/** Shared presentation state for one Turn-process answer generation. */
export interface TurnProcessOwnerProps {
  /** Process content eligible to share one Turn-level disclosure. */
  readonly hasContent: boolean
  readonly spec: TurnProcessSpec
  readonly foldable: boolean
  readonly open: boolean
  setOpen(open: boolean): void
}

/** Shared presentation-policy source for renderers that depend on the work-details mode. */
export interface PresentationInjected {
  hooks: {
    /** Live presentation policy derived from the accepted work-details mode. */
    presentation: ObservableSnapshot<ChatPresentationPolicy>
  }
}

/** Shared settings source for the performance row, composer statistics, and turn tail. */
export interface PerformanceUsageInjected {
  hooks: {
    /** Accepted performance and usage detail preference. */
    performanceUsage: ObservableSnapshot<PerformanceUsageMode>
  }
}

/** Full props of one keyed Chat renderer. */
export type ChatNodeViewProps<Kind extends ChatNodeKind = ChatNodeKind> =
  PropsRuntime<'conversation.chat.node', Kind> & PropsLocale<'chat'>

/** Command-row owner share. */
export interface CommandRowOwnerProps {
  node: CommandNode
  compaction?: CompactionSummaryNode
}

/** Full props of a registered command row. */
export type CommandRowProps = PropsRuntime<'conversation.chat.commandview'>

/** Shared Chat store handle. */
export type ChatStore = ReturnType<typeof createChatStore>

/** In-memory reader position resilient to transcript reflow. */
export interface ChatScrollPosition {
  readonly anchorKey: string
  readonly anchorTop: number
  readonly scrollTop: number
}

/** Business callbacks injected into the Chat view. */
export interface ChatViewInjected {
  hooks: {
    /** Live presentation policy derived from the accepted work-details mode. */
    presentation: ObservableSnapshot<ChatPresentationPolicy>
  }
  keyedHooks: {
    /** Resolve the stable source for one Chat Node key. */
    chatNode: (key: string) => ChatNodeSource
    /** Resolve the stable Turn-process source for one Chat Node key. */
    chatNodeProcess: (key: string) => ChatNodeProcessSource
    /** Resolve one optional group without subscribing the root View to its data. */
    chatGroup: (key: string) => ObservableSnapshot<GroupSnapshot<ConversationGroupData<'chat'>> | undefined> | undefined
  }
  /** Open the current source file of a skill referenced by a sent message. */
  openSkill: (name: string) => void
  /** Open one HTTP(S) message link at the selected destination, using an external tab if Sidebar Browser is unavailable. */
  openExternalLink: (url: string) => void
  openFile: (path: string, options?: OpenFileOptions) => Promise<void>
  /** Open the right Sidebar's Trajectory tab focused on one tool call. */
  openTrajectory: (callId: string) => void
  loadOlder: () => void
  /** Jump loader: page history back through seq; resolves when the window covers it. */
  loadThrough: (seq: SessionSeq) => Promise<void>
  loadImage: MessageImageLoader
  chatScroll: {
    save: (position: ChatScrollPosition | null) => void
    read: () => ChatScrollPosition | null
  }
  forkAt: (seq: number) => void
  /**
   * Revise one sent user message: replace the composer draft with its text.
   * Implemented by the composition wiring over the conversation service.
   * @param text - the user message's plain text.
   */
  editUserMessage?: ((text: string) => void) | undefined
  fileMentions: (owner: TurnTailOwnerProps) => MarkdownFileMentions | undefined
}

/** Existing Session-owned node sources shared by the view and its flow renderer. */
export type ChatFlowDataInjected = Pick<ChatViewInjected, 'hooks' | 'keyedHooks'>

/** Ordered rows and reconciled local echoes rendered inside one Chat viewport. */
export interface ChatFlowOwnerProps extends Pick<ChatNodeOwnerProps,
  'cwd' | 'openSkill' | 'openFile' | 'inspectCall' | 'forkAt' | 'loadImage' | 'fileMentions'> {
  readonly entries: readonly RenderEntry[]
  readonly pendingInputs: readonly (PendingSubmission | InboxState['next-step'][number])[]
  readonly lastInputTurn: number | undefined
  readonly deferCollapse: boolean
}

/** Full props of the Chat-owned flow renderer. */
export type ChatFlowSlotProps =
  PropsRuntime<'conversation.chat.flow'>
  & PropsRenderSlots<'conversation.chat.node' | 'conversation.message.images'>
  & PropsStore<ChatStore>
  & InjectFace<ChatFlowDataInjected>
  & PropsLocale<'chat'>

/** Full Chat view props. */
export type ChatViewSlotProps =
  PropsRuntime<'conversation.view'>
  & PropsRenderSlots<'conversation.chat.node' | 'conversation.message.images'>
  & PropsStore<ChatStore>
  & InjectFace<ChatViewInjected>
  & PropsLocale<'chat'>

/** Full props of the durable-message image renderer. */
export type MessageImagesProps = PropsRuntime<'conversation.message.images'> & PropsLocale<'conversation'>

declare module '@qilin-agent/client-ui-slots' {
  interface SessionStandardProps {
    /** Selector hook over the current Conversation binding's Chat target. */
    useChat: UseChat
  }

  interface LocaleNamespaceMap {
    /** Chat target, transcript node, statistics, and details copy. */
    chat: import('../locale.ts').ChatKey
  }

  interface SlotMap {
    /** Ordered Chat rows and local echoes with viewport-bound visibility hooks. */
    'conversation.chat.flow': {
      kind: 'single'
      scope: 'session'
      owner: ChatFlowOwnerProps
      hookContext: ChatFlowHookContext
      inject: ChatFlowInjected
    }
    /**
     * Final Chat node renderer, keyed by `ChatNodeKind`. The component receives
     * the typed node, shared Chat actions, and Turn-data hook. Reusing a key
     * replaces that node renderer; a kind with no occupant renders no row.
     */
    'conversation.chat.node': {
      kind: 'keyed'
      scope: 'session'
      owner: ChatNodeOwnerProps
      keyProps: { [Kind in ChatNodeKind]: { node: ChatNode<Kind> } }
      hookContext: ChatNodeHookContext
      inject: ChatNodeInjected
    }
    /**
     * Renderer for one consecutive group of durable message images. The owner
     * supplies image references, an authorized loader, and alignment. A
     * registration replaces the shipped gallery; without one, images are omitted.
     */
    'conversation.message.images': { kind: 'single'; scope: 'session'; owner: MessageImagesOwnerProps }
    /**
     * Command row keyed by the command name. The component receives the folded
     * command lifecycle and linked compaction when present. Reusing a key
     * replaces that command renderer; an unoccupied key uses the generic card.
     */
    'conversation.chat.commandview': { kind: 'keyed'; scope: 'session'; owner: CommandRowOwnerProps }
    /**
     * Ordered feature contributions before a completed Turn's action row. Each
     * entry receives the Turn, closing sequence, and file opener. A fresh `id`
     * adds an entry; entries without content return null.
     */
    'conversation.chat.turnTail': { kind: 'list'; scope: 'session'; owner: TurnTailOwnerProps }
    /**
     * Ordered actions for one finalized assistant message. Each entry receives
     * the durable message id; a fresh `id` adds an action and reusing one replaces
     * that entry. With no entries, the standard action row remains unchanged.
     */
    'conversation.chat.assistant-actions': { kind: 'list'; scope: 'session'; owner: AssistantActionOwnerProps }
  }
}
