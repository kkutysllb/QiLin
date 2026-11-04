/**
 * Test-only direct-agent turn driver shared by assembled Loader fixtures.
 * @module @qilin-agent/loader-smoke/agent-turn
 */

import type { Context } from '@qilin-agent/kylin'
import type { Agent } from '@qilin-agent/agent'
import { createUserMessage, expandAssistantStream, type TokenUsage } from '@qilin-agent/llm'
import type { SessionEvent, SessionId } from '@qilin-agent/session'

/** The optional settlement-join face the assembled subagent service exposes. */
interface SettlementJoin {
  awaitStopped(childId: SessionId): Promise<void>
  flushSettlementNotices(parent: Agent, options: { deadlineMs: number }): Promise<{
    woke: boolean
    queued: number
    unread: number
    stopped?: 'deadline' | 'cancelled'
  }>
}

/** Bound on one fixture run's settlement join, mirroring the one-shot runner's order of magnitude. */
const SETTLEMENT_JOIN_DEADLINE_MS = 10_000
/** Maximum notice-driven turns one fixture run joins. */
const SETTLEMENT_JOIN_MAX_TURNS = 8

/**
 * Join background child settlement the way the shipped one-shot runner does: a
 * settlement notice reaches a running parent only at its turn boundary, so a
 * driver that stopped at the task turn's idle would drop the notice-driven turn.
 * @param ctx - assembled Loader context carrying the optional subagent service.
 * @param agent - the root agent whose children to settle.
 * @param children - durable child session ids observed during the turn.
 */
async function settleChildren(subagents: SettlementJoin, agent: Agent, children: readonly string[]): Promise<void> {
  const deadline = Date.now() + SETTLEMENT_JOIN_DEADLINE_MS
  for (const child of children) {
    try {
      await subagents.awaitStopped(child as SessionId)
    } catch (error: unknown) {
      // A child that never published a settlement leaves the notice join to time out.
      void error
    }
  }
  for (let turns = 0; turns < SETTLEMENT_JOIN_MAX_TURNS; turns++) {
    const budget = deadline - Date.now()
    if (budget <= 0) return
    const report = await subagents.flushSettlementNotices(agent, { deadlineMs: budget })
    if (report.stopped !== undefined) return
    if (report.woke) {
      await agent.whenIdle()
      continue
    }
    // Nothing queued and nothing appeared: the parent reached quiescence.
    if (report.unread > 0 || agent.status === 'idle') return
  }
  // A wake this pass started must finish before the fixture turn reports.
  await agent.whenIdle()
}

/** Result envelope consumed only by snapshot and composition tests. */
export interface FixtureTurnResult {
  readonly type: 'result'
  readonly sessionId: string
  readonly output: string
  readonly usage?: TokenUsage
}

/** Options for one fixture turn against exactly one configured root agent. */
export interface FixtureTurnOptions {
  readonly task: string
  readonly onEvent?: (sessionId: string, event: SessionEvent) => void
}

function addUsage(total: TokenUsage | undefined, step: TokenUsage): TokenUsage {
  const next: TokenUsage = {
    inputTokens: (total?.inputTokens ?? 0) + step.inputTokens,
    outputTokens: (total?.outputTokens ?? 0) + step.outputTokens,
  }
  for (const key of ['cacheReadTokens', 'cacheWriteTokens', 'reasoningTokens'] as const) {
    if (total?.[key] !== undefined || step[key] !== undefined) next[key] = (total?.[key] ?? 0) + (step[key] ?? 0)
  }
  return next
}

function assistantText(event: Extract<SessionEvent, { type: 'assistant/message' }>): string | undefined {
  const blocks = event.data.message.content.filter(block => block.type === 'text')
  return blocks.length === 0 ? undefined : blocks.map(block => block.text).join('')
}

async function onlyRootAgent(ctx: Context): Promise<Agent> {
  const registry = ctx.get('agents')
  if (registry === undefined) throw new Error('fixture turn requires exactly one top-level agent, found 0')
  // Configured agents publish asynchronously (persistence create/resume runs
  // before publication), so a settled Loader does not imply a registered
  // agent yet; wait for the first publication instead of requiring it.
  if (registry.roots().length === 0) {
    await new Promise<void>((resolve) => {
      const dispose = ctx.on('agent/created', () => {
        dispose()
        resolve()
      })
    })
  }
  const agents = registry.roots()
  const [agent] = agents
  if (agent === undefined || agents.length !== 1) {
    throw new Error(`fixture turn requires exactly one top-level agent, found ${agents.length}`)
  }
  return agent
}

/**
 * Drive one task from its durable inbox receipt through whole-agent idle, then
 * join background child settlement the way the shipped one-shot runner does: a
 * settlement notice reaches a running parent only at its turn boundary, so the
 * join flushes notices and awaits the turns they start.
 * @param ctx - settled Loader context with exactly one configured root agent.
 * @param options - task and optional canonical-event observer.
 * @returns the final assistant text and accumulated model usage.
 */
export async function runFixtureTurn(ctx: Context, options: FixtureTurnOptions): Promise<FixtureTurnResult> {
  const agent = await onlyRootAgent(ctx)
  await agent.whenIdle()

  const message = createUserMessage({
    content: [{ type: 'text', text: options.task }],
    source: { kind: 'user' },
  })
  let received = false
  let output = ''
  const usageByStep = new Map<string, TokenUsage>()
  // The subagent event map belongs to an optional peer package this harness
  // does not import at runtime; a composition without the service has no
  // settlement work and therefore records no child.
  const settlement = ctx.get('subagents') as SettlementJoin | undefined
  const children: string[] = []
  const offSubagentStart = settlement === undefined
    ? undefined
    : ctx.on('subagent/start' as never, ((info: { id: unknown }) => {
      children.push(String(info.id))
    }) as never)
  const disposeListener = ctx.on('session/event', (session, event) => {
    if (session !== agent.session) return
    if (!received) {
      if (event.type !== 'agent/inbox/spliced'
        || !event.data.inserted.some(inserted => inserted.id === message.id)) return
      received = true
    }
    options.onEvent?.(session.id, event)
    if (event.type === 'assistant/message') {
      output = assistantText(event) ?? output
      if (event.data.usage !== undefined) {
        usageByStep.set(`${event.data.turn}/${event.data.step}`, event.data.usage)
      }
    } else if (event.type === 'assistant/attempt') {
      const usage = expandAssistantStream(event.data.stream)
        .findLast(member => member.chunk.type === 'usage')?.chunk
      if (usage?.type === 'usage') {
        usageByStep.set(`${event.data.turn}/${event.data.step}`, usage.usage)
      }
    }
  })

  try {
    agent.followup(message)
    await agent.whenIdle()
    if (settlement !== undefined) await settleChildren(settlement, agent, children)
  } finally {
    disposeListener()
    offSubagentStart?.()
  }
  await ctx.sessions.flush(agent.session)
  const usage = [...usageByStep.values()].reduce<TokenUsage | undefined>(addUsage, undefined)
  return {
    type: 'result',
    sessionId: agent.session.id,
    output,
    ...usage === undefined ? {} : { usage },
  }
}
