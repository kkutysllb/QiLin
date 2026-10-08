/** Sidechat threads: seeded child sessions owned by the Session Controller. */

import { randomUUID } from 'node:crypto'
import type { AgentHandle } from '@qilin-agent/agent'
import { brandString } from '@qilin-agent/brand'
import type { Context } from '@qilin-agent/kylin'
import type { MessageSource } from '@qilin-agent/llm'
import { createUserMessage } from '@qilin-agent/llm'
import type {
  ContinuableSubagentDescriptorData, SubagentDescriptorData,
} from '@qilin-agent/subagent'
import {
  foldSubagentDescriptor,
  snapshotSubagentDescriptor,
} from '@qilin-agent/subagent'
import type { SessionObservation } from '@qilin-agent/session-query'
import { SessionQueryError } from '@qilin-agent/session-query'
import { SessionTitleInvalidError } from '@qilin-agent/session-title'
import {
  SessionLogOffset,
  SessionSeq,
} from '@qilin-agent/session'
import type {
  SessionEvent, SessionId, SessionSeq as SessionSeqType,
} from '@qilin-agent/session'
import { RemoteError } from '@qilin-agent/typert-protocol'
import type { ApiSessionAgentController } from './agent.ts'
import { prepareForkSeed } from './commands.ts'
import { pageRecords } from './history.ts'
import type {
  SessionHistoryRecord, SessionSidechatModelFollow, SessionSidechatPromptRequest,
  SessionSidechatPromptValue, SessionSidechatSnapshotRequest, SessionSidechatSnapshotValue,
  SessionSidechatStartRequest, SessionSidechatStartValue, SidechatThreadInfo, SidechatThreadRow,
} from './types.ts'

declare module '@qilin-agent/typert-protocol' {
  interface RemoteErrorDetailsMap {
    /** The addressed Session exists but is not a sidechat thread. */
    'sidechat/not-a-thread': { readonly sessionId: SessionId }
    /** A cold thread has no live Agent for a runtime-only operation. */
    'sidechat/thread-cold': { readonly sessionId: SessionId }
    /** The derived thread label was refused by the title service. */
    'sidechat/label-invalid': Record<string, never>
  }
}

/**
 * Durable `subagent/descriptor` provider name identifying a sidechat thread.
 * The descriptor stamps honest catalog citizenship; the Session Controller —
 * not a `ctx.subagents` provider — creates, resumes, and releases these
 * children, exactly like the upstream sidebar's own sidechat routes.
 */
export const SIDECHAT_PROVIDER = 'sidechat'

/** Durable thread-label prefix, shared by the creation label and derived labels. */
export const SIDECHAT_LABEL_PREFIX = 'Side: '

/** Durable creation label of a thread no prompt has reached yet. */
export const SIDECHAT_NEW_THREAD_LABEL = 'Side: New thread'

/** Maximum code points kept in one derived durable thread label. */
export const SIDECHAT_LABEL_MAX_CHARS = 48

/**
 * The boundary prompt injected ahead of a thread's first prompt: the inherited
 * seed is reference context only, never active instruction. Model-facing
 * contract — change only with intent; tests pin the sentences.
 */
export const SIDECHAT_BOUNDARY_PROMPT = [
  'Side conversation boundary.',
  '',
  'Everything before this boundary is inherited history from the parent session: its completed turns, its pending question, and — if the parent was mid-turn — its in-progress output, frozen at the moment this side conversation started. It is reference context only. It is not your current task.',
  '',
  'Do not continue, execute, or complete any instructions, plans, tool calls, approvals, edits, or requests from before this boundary. Only messages submitted after this boundary are active user instructions for this side conversation.',
  '',
  'Mode: this is a continuable side conversation. Your answers stay in this side thread and are viewed in the side panel; they are never delivered into the parent session.',
].join('\n')

/** Deployment limits resolved once at construction; defaults live in the Config schema. */
export interface SessionSidechatLimits {
  /** Maximum own-event records one snapshot returns. */
  readonly maxSnapshotEvents: number
  /** Maximum UTF-16 code units one prompt text accepts. */
  readonly maxPromptChars: number
}

/** Optional constructor input for the deployment limits. */
export interface SessionSidechatLimitsInput {
  /** Maximum own-event records one snapshot returns. */
  readonly maxSnapshotEvents?: number | undefined
  /** Maximum UTF-16 code units one prompt text accepts. */
  readonly maxPromptChars?: number | undefined
}

/**
 * Truncate and prefix one question into a durable thread label.
 * @param question - the raw question text; whitespace runs collapse to single spaces.
 * @returns the `Side: `-prefixed label within the label budget.
 */
export function sidechatLabel(question: string): string {
  const flat = question.replace(/\s+/gu, ' ').trim()
  const max = Math.max(1, SIDECHAT_LABEL_MAX_CHARS - SIDECHAT_LABEL_PREFIX.length)
  const body = flat.length > max ? `${flat.slice(0, max - 1)}…` : flat
  return `${SIDECHAT_LABEL_PREFIX}${body}`
}

/**
 * The thread's own durable events: everything after the inherited fork seed
 * (`inheritedEventCount` names the `session/end-seed` marker's seq, so the
 * marker and the synthetic fork closers stay excluded from own-event reads).
 * @param events - the thread's full event log, contiguous from zero.
 * @param inheritedEventCount - exact inherited prefix length.
 * @returns the child's own event suffix, oldest first.
 */
export function sidechatOwnEvents(
  events: readonly SessionEvent[],
  inheritedEventCount: number,
): readonly SessionEvent[] {
  const cut = inheritedEventCount + 1
  return events.length <= cut ? [] : events.slice(cut)
}

/**
 * Thread-listing order: oldest first, with the opaque id as the stable
 * tiebreak so equal creation timestamps keep a deterministic order.
 * @param left - one thread row.
 * @param right - the other thread row.
 * @returns a negative, zero, or positive `Array.prototype.sort` value.
 */
export function sidechatThreadRowOrder(left: SidechatThreadRow, right: SidechatThreadRow): number {
  return left.createdAt - right.createdAt
    || (left.id < right.id ? -1 : left.id > right.id ? 1 : 0)
}

/** One resolved sidechat thread: validated identity facts from one observation. */
interface ResolvedThread extends Disposable {
  readonly observation: SessionObservation
  readonly ownEvents: readonly SessionEvent[]
  readonly descriptor: ContinuableSubagentDescriptorData
  readonly parentSessionId: SessionId
  /** Durable display title from the title projection, when one is logged. */
  readonly title: string | undefined
}

/**
 * Owns the sidechat thread lifecycle for the Session Controller: seeded
 * creation, first-contact delivery, cold resume, cancellation, release, and
 * enumeration. Generic Session routing fences `origin: 'subagent'` identities
 * away from ordinary prompts; this controller is their designated owner and
 * talks to the Agent registry directly, mirroring the upstream sidebar's own
 * sidechat routes.
 *
 * The controller holds every thread's {@link AgentHandle}: a released or
 * disposed thread stays a persisted Session while no Agent keeps it live.
 */
export class SessionSidechatController {
  private readonly threadHandles = new Map<SessionId, AgentHandle>()
  private readonly resumes = new Map<SessionId, Promise<AgentHandle>>()
  private readonly limits: SessionSidechatLimits

  /**
   * @param ctx - Host context carrying Agent, query, projection, and title services.
   * @param agents - Session Agent policy reused for composition and selection.
   * @param limits - deployment limits; each field defaults when omitted.
   */
  constructor(
    private readonly ctx: Context,
    private readonly agents: Pick<ApiSessionAgentController, 'composeAgent' | 'presetForObservation' | 'selectForNextRequest' | 'selectionFor' | 'serializeImageAdmission'>,
    limits: SessionSidechatLimitsInput,
  ) {
    this.limits = {
      maxSnapshotEvents: limits.maxSnapshotEvents ?? 400,
      maxPromptChars: limits.maxPromptChars ?? 100_000,
    }
    ctx.effect(() => async () => {
      const handles = [...this.threadHandles.values()]
      this.threadHandles.clear()
      this.resumes.clear()
      await Promise.allSettled(handles.map(handle => handle.dispose()))
    }, 'session-controller.sidechat-threads')
  }

  /**
   * Start one sidechat thread: fork the parent's log up to the cut into a
   * `subagent`-origin child, stamp its sidechat descriptor as the first own
   * event, hold its handle, and deliver the boundary plus an optional first
   * question.
   * @param request - parent Session, optional exact cut, optional first question.
   * @param signal - caller cancellation for source reads and delivery.
   * @returns the new thread identity.
   */
  async start(request: SessionSidechatStartRequest, signal: AbortSignal): Promise<SessionSidechatStartValue> {
    let atSeq: SessionSeqType | undefined
    try {
      atSeq = request.atSeq === undefined ? undefined : SessionSeq(request.atSeq)
    } catch {
      throw new RemoteError('gateway/bad-request', 'atSeq must be a non-negative safe integer', {})
    }
    const question = validateQuestion(request.question)
    const prepared = await prepareForkSeed(this.ctx, this.agents, request.sessionId, atSeq)
    signal.throwIfAborted()
    const childId = brandString<SessionId>(`session-${randomUUID()}`)
    const composition = await this.agents.composeAgent(prepared.presetId)
    // The descriptor is the child's first own event, after the seed's
    // end-seed marker and fork closers: the subagent history address requires
    // an own descriptor at or past the inherited boundary. Seed seqs are
    // contiguous from zero, so the appended event's seq is the seed length.
    const descriptor = snapshotSubagentDescriptor({
      mode: 'continuable',
      provider: SIDECHAT_PROVIDER,
      label: question === undefined ? SIDECHAT_NEW_THREAD_LABEL : sidechatLabel(question),
    })
    const seed: SessionEvent[] = [...prepared.seed, {
      type: 'subagent/descriptor',
      seq: SessionSeq(prepared.seed.length),
      time: Date.now(),
      data: descriptor,
    }]
    let handle: AgentHandle
    try {
      handle = await this.ctx.agents.create({
        sessionId: childId,
        seed,
        inheritedEventCount: SessionLogOffset(prepared.boundary + 1),
        meta: {
          ...(prepared.header.cwd === undefined ? {} : { cwd: prepared.header.cwd }),
          parentSession: prepared.header.id,
          isSeeded: true,
          origin: 'subagent',
          delegationDepth: (prepared.header.delegationDepth ?? 0) + 1,
          ...(composition.agentPreset === undefined
            ? {}
            : { agentPreset: composition.agentPreset }),
        },
        setup: composition.setup,
      })
    } catch (error: unknown) {
      throw new RemoteError(
        'gateway/internal',
        `failed to start sidechat thread for session "${request.sessionId}": ${String(error)}`,
        {},
      )
    }
    this.threadHandles.set(childId, handle)
    if (question !== undefined) {
      try {
        await this.deliverFirstContact(handle.agent, question, signal)
      } catch (error: unknown) {
        await this.releaseThread(childId)
        throw error
      }
    }
    return { threadId: childId }
  }

  /**
   * Deliver one follow-up message to a thread, resuming a cold thread first.
   * The first delivered prompt injects the boundary ahead of the question and
   * renames the thread from its placeholder label; every prompt re-aligns the
   * thread's model selection to its parent and reports the outcome.
   * @param request - thread identity, message text, and correlation id.
   * @param signal - caller cancellation for resume and source reads.
   * @returns the acceptance, earned label, and model-follow outcome.
   */
  async prompt(request: SessionSidechatPromptRequest, signal: AbortSignal): Promise<SessionSidechatPromptValue> {
    const text = request.text.trim()
    if (text.length === 0) {
      throw new RemoteError('gateway/bad-request', 'sidechat prompt text must not be empty', {})
    }
    if (text.length > this.limits.maxPromptChars) {
      throw new RemoteError(
        'gateway/bad-request',
        `sidechat prompt text must contain at most ${String(this.limits.maxPromptChars)} UTF-16 code units`,
        {},
      )
    }
    using thread = await this.resolveThread(request.sessionId)
    const live = this.liveAgent(request.sessionId)
      ?? (await this.resumeThread(request.sessionId, thread.observation, signal)).agent
    const firstContact = !boundaryDelivered(thread.ownEvents)
    // Align before delivery: the awakened loop must assemble its next request
    // from the parent-following selection, not the thread's previous one.
    const modelFollow = await this.followParentModel(thread.parentSessionId, live, signal)
    if (firstContact) {
      live.inject(createUserMessage({
        content: [{ type: 'text', text: SIDECHAT_BOUNDARY_PROMPT }],
        source: { kind: 'sidechat-boundary' },
      }))
    }
    live.followup(createUserMessage({
      content: [{ type: 'text', text }],
      source: { kind: 'user', ...(request.requestId === undefined ? {} : { rpcId: request.requestId }) },
    }))
    const label = firstContact ? await this.renameThread(live, text) : undefined
    return { accepted: true, ...(label === undefined ? {} : { label }), modelFollow }
  }

  /**
   * Cancel the thread's running turn, keeping queued inbox work.
   * @param request - thread whose active turn is cancelled.
   * @returns the cancellation acknowledgement.
   */
  cancel(request: { readonly sessionId: SessionId }): { readonly accepted: true } {
    const live = this.liveAgent(request.sessionId)
    if (live === undefined) {
      throw new RemoteError(
        'sidechat/thread-cold',
        `sidechat thread "${request.sessionId}" has no live Agent to cancel`,
        { sessionId: request.sessionId },
      )
    }
    live.cancel({ kind: 'user' }, { keepInbox: true })
    return { accepted: true }
  }

  /**
   * Read one thread's own durable events (tail-bounded) and its live facts.
   * @param request - thread identity.
   * @param signal - caller cancellation for persistence reads.
   * @returns the thread info and its own event tail.
   */
  async snapshot(request: SessionSidechatSnapshotRequest, signal: AbortSignal): Promise<SessionSidechatSnapshotValue> {
    using thread = await this.resolveThread(request.sessionId)
    signal.throwIfAborted()
    const records: SessionHistoryRecord[] = pageRecords(thread.ownEvents.slice(-this.limits.maxSnapshotEvents))
    return { info: this.infoOf(thread), records }
  }

  /**
   * Release one thread's live Agent. History stays persisted; a later prompt
   * resumes the thread. Releasing a cold thread is accepted idempotently.
   * @param request - thread whose live Agent is released.
   * @returns the release acknowledgement.
   */
  async release(request: { readonly sessionId: SessionId }): Promise<{ readonly accepted: true }> {
    await this.resolveIdentity(request.sessionId)
    await this.releaseThread(request.sessionId)
    return { accepted: true }
  }

  /**
   * List the parent's sidechat threads in creation order.
   * @param request - parent Session identity.
   * @param signal - caller cancellation for persistence reads.
   * @returns one row per sidechat thread, oldest first.
   */
  async threads(
    request: { readonly sessionId: SessionId },
    signal: AbortSignal,
  ): Promise<{ readonly threads: readonly SidechatThreadRow[] }> {
    const corpus = await this.ctx.sessionQuery.listSessions(signal)
    const rows: SidechatThreadRow[] = []
    for (const record of corpus) {
      const header = record.header
      if (header.origin !== 'subagent' || header.parentSession !== request.sessionId) continue
      const own = await this.ownEventsOf(header.id)
      if (own === undefined) continue
      const descriptor = foldOwnSidechatDescriptor(own.events)
      if (descriptor?.provider !== SIDECHAT_PROVIDER || descriptor.mode !== 'continuable') continue
      const live = this.liveAgent(header.id)
      rows.push({
        id: header.id,
        createdAt: header.createdAt,
        label: own.title ?? descriptor.label,
        live: live !== undefined,
        running: live?.status === 'running',
      })
    }
    rows.sort(sidechatThreadRowOrder)
    return { threads: rows }
  }

  /** Live facts and durable label of one resolved thread. */
  private infoOf(thread: ResolvedThread): SidechatThreadInfo {
    const header = thread.observation.header
    const live = this.liveAgent(header.id)
    const selection = live === undefined
      ? coldSelection(thread.observation)
      : this.agents.selectionFor(live).current
    return {
      sessionId: header.id,
      label: thread.title ?? thread.descriptor.label,
      live: live !== undefined,
      running: live?.status === 'running',
      ...(selection === undefined ? {} : { provider: selection.provider, model: selection.model }),
      ...(header.agentPreset === undefined ? {} : { preset: header.agentPreset }),
    }
  }

  /** The thread's live Agent from the registry. */
  private liveAgent(sessionId: SessionId): ReturnType<Context['agents']['get']> {
    return this.ctx.agents.get(sessionId)
  }

  /** Rename a thread after its first prompt through the title service when mounted. */
  private renameThread(live: NonNullable<ReturnType<Context['agents']['get']>>, question: string): Promise<string | undefined> {
    const titles = this.ctx.get('sessionTitle')
    if (titles === undefined) return Promise.resolve(undefined)
    try {
      return Promise.resolve(titles.rename(live.session, sidechatLabel(question)).title)
    } catch (error: unknown) {
      if (error instanceof SessionTitleInvalidError) {
        throw new RemoteError('sidechat/label-invalid', error.message, {})
      }
      throw error
    }
  }

  /** Deliver the boundary plus the first question on a freshly created thread. */
  private async deliverFirstContact(
    live: NonNullable<ReturnType<Context['agents']['get']>>,
    question: string,
    signal: AbortSignal,
  ): Promise<void> {
    signal.throwIfAborted()
    live.inject(createUserMessage({
      content: [{ type: 'text', text: SIDECHAT_BOUNDARY_PROMPT }],
      source: { kind: 'sidechat-boundary' },
    }))
    live.followup(createUserMessage({
      content: [{ type: 'text', text: question }],
      source: { kind: 'user' },
    }))
    await this.renameThread(live, question)
  }

  /** Re-align one thread's selection to its parent's; failures surface as the reported outcome. */
  private async followParentModel(
    parentSessionId: SessionId,
    live: NonNullable<ReturnType<Context['agents']['get']>>,
    signal: AbortSignal,
  ): Promise<SessionSidechatModelFollow> {
    try {
      const selection = await this.parentSelection(parentSessionId, signal)
      if (selection === undefined) {
        return { ok: false, reason: `parent session "${parentSessionId}" has no recorded model selection` }
      }
      const current = this.agents.selectionFor(live).current
      if (current.provider === selection.provider && current.model === selection.model) {
        return { ok: true, provider: selection.provider, model: selection.model }
      }
      await this.agents.serializeImageAdmission(live, () => {
        this.agents.selectForNextRequest(live, selection)
        return Promise.resolve()
      })
      return { ok: true, provider: selection.provider, model: selection.model }
    } catch (error: unknown) {
      if (signal.aborted) throw error
      return { ok: false, reason: error instanceof Error ? error.message : String(error) }
    }
  }

  /** Effective model selection of the parent: its live pick, else its persisted projection pick. */
  private async parentSelection(parentSessionId: SessionId, signal: AbortSignal): Promise<{ provider: string; model: string } | undefined> {
    const live = this.liveAgent(parentSessionId)
    if (live !== undefined) {
      const selection = this.agents.selectionFor(live).current
      return { provider: selection.provider, model: selection.model }
    }
    using observation = await this.ctx.sessionQuery.observeSession(parentSessionId, { signal })
    return coldSelection(observation)
  }

  /**
   * Resolve one sidechat thread observation, refusing identities that are not
   * sidechat threads of their recorded parent. The caller owns the returned
   * observation's disposal.
   * @param sessionId - claimed thread identity.
   */
  private async resolveThread(sessionId: SessionId): Promise<ResolvedThread> {
    const observation = await this.observeThread(sessionId)
    try {
      const ownEvents = sidechatOwnEvents(observation.events, observation.inheritedEventCount)
      const descriptor = foldOwnSidechatDescriptor(ownEvents)
      const parentSessionId = observation.header.parentSession
      if (observation.header.origin !== 'subagent'
        || parentSessionId === undefined
        || descriptor === undefined
        || descriptor.provider !== SIDECHAT_PROVIDER
        || descriptor.mode !== 'continuable') {
        throw notThreadError(sessionId)
      }
      return {
        observation,
        ownEvents,
        descriptor,
        parentSessionId,
        title: durableTitle(observation),
        [Symbol.dispose]: () => { observation[Symbol.dispose]() },
      }
    } catch (error: unknown) {
      observation[Symbol.dispose]()
      throw error
    }
  }

  /**
   * Validate the sidechat identity of one Session, releasing the read before
   * returning.
   * @param sessionId - claimed thread identity.
   */
  private async resolveIdentity(sessionId: SessionId): Promise<void> {
    const observation = await this.observeThread(sessionId)
    try {
      const ownEvents = sidechatOwnEvents(observation.events, observation.inheritedEventCount)
      const descriptor = foldOwnSidechatDescriptor(ownEvents)
      if (observation.header.origin !== 'subagent'
        || descriptor === undefined
        || descriptor.provider !== SIDECHAT_PROVIDER
        || descriptor.mode !== 'continuable') {
        throw notThreadError(sessionId)
      }
    } finally {
      observation[Symbol.dispose]()
    }
  }

  /** Observe one candidate thread, folding absent sessions to the not-found code. */
  private async observeThread(sessionId: SessionId): Promise<SessionObservation> {
    try {
      return await this.ctx.sessionQuery.observeSession(sessionId, { projectionMode: 'all' })
    } catch (error: unknown) {
      if (error instanceof SessionQueryError && error.code === 'SESSION_QUERY_SESSION_NOT_FOUND') {
        throw new RemoteError('session/not-found', `session "${sessionId}" not found`, { sessionId })
      }
      throw new RemoteError(
        'gateway/internal',
        `sidechat thread read failed for session "${sessionId}": ${String(error)}`,
        {},
      )
    }
  }

  /** Read the own-event suffix and durable title of one corpus row. */
  private async ownEventsOf(
    sessionId: SessionId,
  ): Promise<{ readonly events: readonly SessionEvent[]; readonly title: string | undefined } | undefined> {
    let observation: SessionObservation
    try {
      observation = await this.ctx.sessionQuery.observeSession(sessionId, { projectionMode: 'all' })
    } catch (error: unknown) {
      // The listing raced a concurrent removal; the row is simply not listed.
      if (error instanceof SessionQueryError
        && error.code === 'SESSION_QUERY_SESSION_NOT_FOUND') return undefined
      throw error
    }
    using held = observation
    return {
      events: sidechatOwnEvents(held.events, held.inheritedEventCount),
      title: durableTitle(held),
    }
  }

  /** Resume one cold thread, deduplicating concurrent resumes, and keep the handle. */
  private async resumeThread(sessionId: SessionId, observation: SessionObservation, signal: AbortSignal): Promise<AgentHandle> {
    let resume = this.resumes.get(sessionId)
    if (resume === undefined) {
      resume = this.resumeObserved(sessionId, observation, signal)
        .finally(() => { this.resumes.delete(sessionId) })
      this.resumes.set(sessionId, resume)
    }
    return resume
  }

  private async resumeObserved(sessionId: SessionId, observation: SessionObservation, signal: AbortSignal): Promise<AgentHandle> {
    const held = this.threadHandles.get(sessionId)
    if (held !== undefined) return held
    const composition = await this.agents.composeAgent(this.agents.presetForObservation(observation))
    try {
      const handle = await this.ctx.agents.resume({
        resumeSessionId: sessionId,
        setup: composition.setup,
        signal,
      })
      this.threadHandles.set(sessionId, handle)
      return handle
    } catch (error: unknown) {
      throw new RemoteError(
        'gateway/internal',
        `failed to resume sidechat thread "${sessionId}": ${String(error)}`,
        {},
      )
    }
  }

  /** Dispose one held thread handle, tolerating a missing entry. */
  private async releaseThread(sessionId: SessionId): Promise<void> {
    const handle = this.threadHandles.get(sessionId)
    if (handle === undefined) return
    this.threadHandles.delete(sessionId)
    await handle.dispose()
  }
}

/** Effective selection of a cold observation: the wire projection's effective pick. */
function coldSelection(observation: SessionObservation): { provider: string; model: string } | undefined {
  const projection = observation.projections?.values.modelSelection
  if (projection === undefined || projection.next === null) return undefined
  return { provider: projection.next.provider, model: projection.next.model }
}

/** Durable display title of one observed thread, when the projection has one. */
function durableTitle(observation: SessionObservation): string | undefined {
  const title = observation.projections?.values.title
  return typeof title === 'string' ? title : undefined
}

/** Whether the thread log already carries the boundary injection (the first prompt was delivered). */
function boundaryDelivered(ownEvents: readonly SessionEvent[]): boolean {
  return ownEvents.some(event => event.type === 'user/message'
    && (event.data as { source?: MessageSource }).source?.kind === 'sidechat-boundary')
}

/** The child's own sidechat descriptor: last valid `subagent/descriptor` in the own suffix. */
function foldOwnSidechatDescriptor(ownEvents: readonly SessionEvent[]): SubagentDescriptorData | undefined {
  for (let index = ownEvents.length - 1; index >= 0; index--) {
    const event = ownEvents[index]
    if (event === undefined || event.type !== 'subagent/descriptor') continue
    try {
      return foldSubagentDescriptor([event])
    } catch {
      // A malformed payload names no thread; keep scanning earlier candidates.
    }
  }
  return undefined
}

function validateQuestion(question: string | undefined): string | undefined {
  if (question === undefined) return undefined
  const text = question.trim()
  if (text.length === 0) {
    throw new RemoteError('gateway/bad-request', 'sidechat start question must not be blank when present', {})
  }
  return text
}

function notThreadError(sessionId: SessionId): RemoteError {
  return new RemoteError(
    'sidechat/not-a-thread',
    `session "${sessionId}" is not a sidechat thread`,
    { sessionId },
  )
}
