/**
 * Child LLM route authority for the subagent seam.
 *
 * A start may name a provider/model explicitly, a provider may advertise its
 * own default route, and the deployment may set one for every delegation. This
 * module owns the precedence between them and the Session-owned allowlist that
 * bounds what a start may select, so every backend enforces one rule instead of
 * each delegation tool keeping its own copy.
 *
 * @module @qilin-agent/subagent/child-route
 */

import type { Agent, AgentOptions } from '@qilin-agent/agent'
import { ReasoningEffortId } from '@qilin-agent/llm'
import { SessionSeq } from '@qilin-agent/session'
import type { Session, SessionId } from '@qilin-agent/session'
import { SubagentError } from './error.ts'
import type { AllowedModelRoute, ChildRouteDefaults, SubagentProvider } from './types.ts'

/** Supplies the user-selected default child route to the seam, or undefined when unset. */
export type ChildRoutePreference = () => AllowedModelRoute | undefined

/** Deepest ancestor chain walked when a Session has recorded no policy of its own. */
const POLICY_INHERITANCE_DEPTH = 8

/**
 * Exact route identity used for equality checks.
 * @param route - one provider/model pair.
 * @returns a string that is equal exactly when both fields are equal.
 */
export function modelRouteKey(route: AllowedModelRoute): string {
  return `${route.provider}\0${route.model}`
}

/**
 * Reject malformed or duplicate routes at a durable or configuration boundary.
 * @param routes - candidate exact routes.
 * @returns nothing; the assertion narrows `routes` or throws.
 */
export function assertAllowedModelRoutes(routes: unknown): asserts routes is readonly AllowedModelRoute[] {
  if (!Array.isArray(routes)) {
    throw new Error('subagent model selection requires an array of routes')
  }
  const seen = new Set<string>()
  for (const candidate of routes as readonly unknown[]) {
    if (typeof candidate !== 'object' || candidate === null || Array.isArray(candidate)
      || !('provider' in candidate) || typeof candidate.provider !== 'string'
      || !('model' in candidate) || typeof candidate.model !== 'string'
      || candidate.provider.length === 0 || candidate.model.length === 0) {
      throw new Error('subagent model selection requires non-empty provider and model ids')
    }
    const key = modelRouteKey({ provider: candidate.provider, model: candidate.model })
    if (seen.has(key)) {
      throw new Error(`subagent model selection repeats route "${candidate.provider}/${candidate.model}"`)
    }
    seen.add(key)
  }
}

/** Whether one option set names a route a caller selected explicitly. */
function namedRoute(options: AgentOptions | undefined): AllowedModelRoute | undefined {
  if (options?.provider === undefined || options.model === undefined) return undefined
  return { provider: options.provider, model: options.model }
}

/**
 * Resolve the child route one start runs on.
 *
 * An explicit request wins and is never rewritten. Otherwise the provider's
 * advertised default applies, then the deployment's. A provider that inherits
 * the parent context keeps the parent route: its child reuses the inherited
 * conversation prefix, and a different model would invalidate that reuse.
 * @param defaults - deployment-level child route, absent when unset.
 * @param provider - the provider that will run the child.
 * @param request - the caller's start request.
 * @returns the request carrying the resolved route, or the original request when no layer applies.
 */
export function resolveChildRoute<R extends { readonly agentOptions?: AgentOptions }>(
  defaults: ChildRouteDefaults | undefined,
  provider: SubagentProvider,
  request: R,
): R {
  if (namedRoute(request.agentOptions) !== undefined) return request
  if (!provider.capabilities.agentOptions) return request
  if (provider.inheritsParentContext) return request
  const route: ChildRouteDefaults | undefined = provider.agentRouteDefaults ?? defaults
  if (route === undefined) return request
  const existing = request.agentOptions ?? {}
  const merged: AgentOptions = {
    ...existing,
    provider: route.provider,
    model: route.model,
    ...(route.reasoningEffort === undefined || existing.reasoningEffort !== undefined
      ? {}
      : { reasoningEffort: ReasoningEffortId(route.reasoningEffort) }),
  }
  return { ...request, agentOptions: merged }
}

/** Policy cache: a Session's allowlist is append-once, so one read per Session is final. */
const policies = new WeakMap<Session, readonly AllowedModelRoute[] | undefined>()

/** Read the first policy event a Session recorded, if any. */
function ownPolicy(session: Session): readonly AllowedModelRoute[] | undefined {
  for (let index = 0; index <= Number(session.seq); index += 1) {
    // oxlint-disable-next-line typescript/no-deprecated -- Existing Session history read; migration deferred.
    const event = session.eventAt(SessionSeq(index))
    if (event?.type !== 'subagent/model-selection-policy') continue
    return event.data.allowedModels
  }
  return undefined
}

/**
 * Read the allowlist that bounds one parent's delegation routes.
 *
 * The composition records the policy on the Session that receives the
 * delegation tool. A child composed from its parent's preset inherits that
 * decision, so an unrecorded Session walks its ancestor chain before the
 * service treats selection as unbounded.
 * @param parent - the exact parent Agent starting the child.
 * @param registry - Session registry used to resolve ancestors, absent in tests that own no registry.
 * @returns the bound routes, or undefined when no Session in the chain recorded one.
 */
export function childRoutePolicy(
  parent: Agent,
  registry: { get(id: SessionId): Session | undefined } | undefined,
): readonly AllowedModelRoute[] | undefined {
  let session: Session | undefined = parent.session
  for (let depth = 0; session !== undefined && depth <= POLICY_INHERITANCE_DEPTH; depth += 1) {
    const cached = policies.get(session)
    if (cached !== undefined) return cached
    const policy = ownPolicy(session)
    if (policy !== undefined) {
      policies.set(session, policy)
      return policy
    }
    const parentId: SessionId | undefined = session.header.origin === 'subagent'
      ? session.header.parentSession
      : undefined
    session = parentId === undefined || registry === undefined ? undefined : registry.get(parentId)
  }
  return undefined
}

/**
 * Whether one allowlist admits a route.
 * @param policy - routes the Session authorized; undefined means unbounded.
 * @param route - the route a start selected.
 * @returns whether the start may proceed.
 */
export function routeAllowedByPolicy(
  policy: readonly AllowedModelRoute[] | undefined,
  route: AllowedModelRoute,
): boolean {
  return policy === undefined
    || policy.some(candidate => modelRouteKey(candidate) === modelRouteKey(route))
}

/**
 * Reject a selected route the parent Session never authorized.
 * @param parent - the exact parent Agent starting the child.
 * @param registry - Session registry used to resolve inherited policies.
 * @param options - effective child options after route resolution.
 */
export function assertChildRouteAuthorized(
  parent: Agent,
  registry: { get(id: SessionId): Session | undefined } | undefined,
  options: AgentOptions | undefined,
): void {
  const route = namedRoute(options)
  if (route === undefined) return
  if (routeAllowedByPolicy(childRoutePolicy(parent, registry), route)) return
  throw new SubagentError(
    `child LLM route "${route.provider}/${route.model}" is not allowed for this Session`,
    'UNAUTHORIZED',
  )
}
