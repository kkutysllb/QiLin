import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@qilin-agent/kylin'
import AgentLoop from '@qilin-agent/agent-loop'
import { mountAgentLoopTestDependencies } from '@qilin-agent/agent-loop-testkit'
import { SessionId } from '@qilin-agent/session'
import JsonlSessionPersistence from '@qilin-agent/session-persistence-jsonl'
import SubagentService from '@qilin-agent/subagent'
import * as SubagentFork from '@qilin-agent/subagent-fork-in-process'
import * as SubagentSpawn from '@qilin-agent/subagent-spawn-in-process'
import { TestSessionQuery } from './test-session-query.ts'
import TeamService, { TeamError } from '../src/index.ts'
import type { Agent } from '@qilin-agent/agent'
import { teamWireError } from '../src/remote.ts'

const roots: string[] = []
const contexts: Context[] = []
let sequence = 0

afterEach(async () => {
  for (const ctx of contexts.splice(0).reverse()) await ctx.fiber.dispose()
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

/**
 * Mount the service with its runtime dependencies and return the Lead agent
 * plus one conversation outside any Team, mirroring the service specs' bench.
 */
async function setup() {
  sequence += 1
  const ctx = new Context()
  contexts.push(ctx)
  await mountAgentLoopTestDependencies(ctx)
  const storageRoot = mkdtempSync(join(tmpdir(), 'qilin-team-wire-'))
  roots.push(storageRoot)
  await ctx.plugin(JsonlSessionPersistence, { root: storageRoot })
  await ctx.plugin(TestSessionQuery)
  await ctx.plugin(AgentLoop, { agents: [] })
  await ctx.plugin(SubagentService)
  await ctx.plugin(SubagentSpawn, { providerName: 'spawn' })
  await ctx.plugin(SubagentFork, { providerName: 'fork' })
  await ctx.plugin(TeamService)
  const lead = await ctx.agentLoop.create(SessionId(`wire-lead-${sequence}`), { provider: 'mock', model: 'mock' })
  return { ctx, lead }
}

describe('Team wire methods', () => {
  it('creates a task through the wire face of the domain operation', async () => {
    const { ctx, lead } = await setup()
    const view = await ctx.agentTeams.remoteCreateTask(lead, {
      subject: 'Ship docs',
      description: 'Write the guide',
      writeScopes: ['docs'],
    })
    expect(view).toMatchObject({ revision: 1, subject: 'Ship docs', status: 'pending' })
  })

  it('maps a non-member identity onto the not-a-member Remote code', async () => {
    const { ctx, lead } = await setup()
    const impostor = { ...lead } as Agent
    await expect(ctx.agentTeams.remoteCreateTask(impostor, {
      subject: 'Ship docs', description: 'Write the guide',
    })).rejects.toMatchObject({ code: 'agent-team/not-a-member' })
  })

  it('maps a domain refusal onto the rejected Remote code with its Team code', async () => {
    const { ctx, lead } = await setup()
    await expect(ctx.agentTeams.remoteCreateTask(lead, {
      subject: '   ', description: 'Write the guide',
    })).rejects.toMatchObject({
      code: 'agent-team/rejected',
      details: { code: 'TEAM_INVALID_ARGUMENT' },
    })
  })

  it('maps a lost compare-and-set onto the stale-revision Remote code', async () => {
    const { ctx, lead } = await setup()
    const view = await ctx.agentTeams.remoteCreateTask(lead, {
      subject: 'Ship docs', description: 'Write the guide',
    })
    await expect(ctx.agentTeams.remoteUpdateTask(lead, {
      taskId: view.id, expectedRevision: 999, action: 'edit',
      subject: 'Ship docs', description: 'Rewrite the guide',
    })).rejects.toMatchObject({ code: 'agent-team/stale-revision' })
  })

  it('commits a wire edit and returns the committed revision', async () => {
    const { ctx, lead } = await setup()
    const view = await ctx.agentTeams.remoteCreateTask(lead, {
      subject: 'Ship docs', description: 'Write the guide',
    })
    const next = await ctx.agentTeams.remoteUpdateTask(lead, {
      taskId: view.id, expectedRevision: view.revision, action: 'edit',
      subject: 'Ship docs', description: 'Rewrite the guide',
    })
    expect(next.revision).toBe(view.revision + 1)
    expect(next.description).toBe('Rewrite the guide')
  })
})

describe('teamWireError', () => {
  it('passes values outside the Team domain through unchanged', () => {
    const boom = new Error('boom')
    expect(teamWireError(boom)).toBe(boom)
    expect(teamWireError(undefined)).toBeUndefined()
  })

  it('rethrows Team errors with the shared code vocabulary', () => {
    const stale = new TeamError('stale', 'TEAM_TASK_STALE_REVISION')
    const mapped = teamWireError(stale) as { code: string; message: string }
    expect(mapped.code).toBe('agent-team/stale-revision')
    expect(mapped.message).toBe('stale')
  })
})
