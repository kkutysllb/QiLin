/**
 * The seam owns the child route: an explicit request wins, then the provider's
 * advertised default, then the deployment's, and a provider that inherits the
 * parent context keeps the parent route so its inherited prefix stays reusable.
 * The Session-owned allowlist bounds every selected route.
 */

import type { Agent } from '@qilin-agent/agent'
import { ReasoningEffortId } from '@qilin-agent/llm'
import { Session, SessionId, SessionSeq } from '@qilin-agent/session'
import { describe, expect, it } from 'vitest'
import {
  SubagentError, assertAllowedModelRoutes, assertChildRouteAuthorized, childRoutePolicy,
  resolveChildRoute, routeAllowedByPolicy,
} from '@qilin-agent/subagent'
import type { AllowedModelRoute, ChildRouteDefaults, SubagentProvider } from '@qilin-agent/subagent'

const ROUTES: readonly AllowedModelRoute[] = [
  { provider: 'zai-coding-cn', model: 'glm-5.3' },
  { provider: 'deepseek-official', model: 'deepseek-flash' },
]

/** One provider fixture; capabilities default to supporting child agent options. */
function provider(overrides: Partial<SubagentProvider> = {}): SubagentProvider {
  return {
    name: 'spawn',
    capabilities: { agentOptions: true, outputSchema: false, depthLimit: false, toolFilter: false, persona: false },
    inheritsParentContext: false,
    ...overrides,
  }
}

/** A start request carrying only what route resolution reads. */
interface RouteRequest {
  readonly agentOptions?: {
    readonly provider?: string
    readonly model?: string
    readonly reasoningEffort?: ReturnType<typeof ReasoningEffortId>
  }
}

describe('child route resolution', () => {
  it('keeps an explicit request route untouched', () => {
    const request: RouteRequest = { agentOptions: { provider: 'deepseek-official', model: 'deepseek-flash' } }
    const resolved = resolveChildRoute({ provider: 'zai-coding-cn', model: 'glm-5.3' }, provider(), request)
    expect(resolved).toBe(request)
  })

  it('prefers the provider route over the deployment default', () => {
    const resolved: RouteRequest = resolveChildRoute(
      { provider: 'zai-coding-cn', model: 'glm-5.3' },
      provider({ agentRouteDefaults: { provider: 'alpha', model: 'alpha-large' } }),
      {},
    )
    expect(resolved.agentOptions).toMatchObject({ provider: 'alpha', model: 'alpha-large' })
  })

  it('applies the deployment default when no other layer names a route', () => {
    const defaults: ChildRouteDefaults = { provider: 'zai-coding-cn', model: 'glm-5.3' }
    const resolved: RouteRequest = resolveChildRoute(defaults, provider(), {})
    expect(resolved.agentOptions).toMatchObject({ provider: 'zai-coding-cn', model: 'glm-5.3' })
  })

  it('keeps an inheriting provider on the parent route', () => {
    const request: RouteRequest = {}
    const resolved = resolveChildRoute({ provider: 'zai-coding-cn', model: 'glm-5.3' },
      provider({ name: 'fork', inheritsParentContext: true }), request)
    expect(resolved).toBe(request)
  })

  it('keeps a provider without agent options untouched', () => {
    const request: RouteRequest = {}
    const resolved = resolveChildRoute({ provider: 'zai-coding-cn', model: 'glm-5.3' },
      provider({ capabilities: { agentOptions: false, outputSchema: false, depthLimit: false, toolFilter: false, persona: false } }),
      request)
    expect(resolved).toBe(request)
  })

  it('adds the default effort only when the request names none', () => {
    const withDefault = resolveChildRoute(
      { provider: 'zai-coding-cn', model: 'glm-5.3', reasoningEffort: 'high' }, provider(), {},
    ) as RouteRequest
    expect(withDefault.agentOptions?.reasoningEffort).toBe(ReasoningEffortId('high'))
    const kept = resolveChildRoute(
      { provider: 'zai-coding-cn', model: 'glm-5.3', reasoningEffort: 'high' }, provider(),
      { agentOptions: { reasoningEffort: ReasoningEffortId('low') } },
    ) as RouteRequest
    expect(kept.agentOptions?.reasoningEffort).toBe(ReasoningEffortId('low'))
  })
})

/** One policy event as the delegation tool appends it before the first request. */
function policyEvent(routes: readonly AllowedModelRoute[]) {
  return {
    type: 'subagent/model-selection-policy' as const,
    seq: SessionSeq(0),
    time: 1,
    data: { allowedModels: routes.map(route => ({ ...route })) },
  }
}

/** A parent Agent over one detached Session, which is all the route reader touches. */
function parentOn(session: Session): Agent {
  return { id: session.id, session } as Agent
}

describe('Session route policy', () => {
  it('reads the recorded allowlist once and treats a policy-free Session as unbounded', () => {
    const bounded = Session.create(SessionId('bounded'), [policyEvent(ROUTES)])
    expect(childRoutePolicy(parentOn(bounded), undefined)).toEqual(ROUTES)
    const unbounded = Session.create(SessionId('unbounded'))
    expect(childRoutePolicy(parentOn(unbounded), undefined)).toBeUndefined()
  })

  it('rejects a route the recorded allowlist never authorized', () => {
    const parent = parentOn(Session.create(SessionId('bounded'), [policyEvent(ROUTES)]))
    expect(() => { assertChildRouteAuthorized(parent, undefined, { provider: 'zai-coding-cn', model: 'glm-5.3' }) })
      .not.toThrow()
    let thrown: unknown
    try {
      assertChildRouteAuthorized(parent, undefined, { provider: 'zai-coding-cn', model: 'glm-9' })
    } catch (error: unknown) {
      thrown = error
    }
    expect(thrown).toBeInstanceOf(SubagentError)
    expect((thrown as SubagentError).code).toBe('UNAUTHORIZED')
  })

  it('leaves a start without a named route unchecked', () => {
    const parent = parentOn(Session.create(SessionId('bounded'), [policyEvent(ROUTES)]))
    expect(() => { assertChildRouteAuthorized(parent, undefined, { reasoningEffort: ReasoningEffortId('high') }) })
      .not.toThrow()
  })
})

describe('route authorization', () => {
  it('admits any route without a policy', () => {
    expect(routeAllowedByPolicy(undefined, ROUTES[0]!)).toBe(true)
  })

  it('admits an authorized route and rejects another', () => {
    expect(routeAllowedByPolicy(ROUTES, { provider: 'zai-coding-cn', model: 'glm-5.3' })).toBe(true)
    expect(routeAllowedByPolicy(ROUTES, { provider: 'zai-coding-cn', model: 'glm-4.5' })).toBe(false)
  })

  it('rejects malformed or repeated route policies', () => {
    expect(() => { assertAllowedModelRoutes([{ provider: 'a', model: 'b' }, { provider: 'a', model: 'b' }]) })
      .toThrow(/repeats route/)
    expect(() => { assertAllowedModelRoutes([{ provider: '', model: 'b' }]) }).toThrow(/non-empty/)
    expect(() => { assertAllowedModelRoutes('routes') }).toThrow(/array of routes/)
  })
})
