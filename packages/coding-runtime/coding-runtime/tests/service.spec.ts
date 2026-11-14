import { describe, expect, it } from 'vitest'
import { Context } from '@qilin-agent/kylin'
import { CodingRuntime } from '@qilin-agent/coding-runtime'
import type { CodingRunRequest, CodingRunResult } from '@qilin-agent/coding-runtime'

/**
 * Minimal concrete runtime: records requests, "executes" by invoking every
 * binding once in declaration order, and lets tests script the outcome. The
 * Service Definition package ships no provider, so the contract is exercised through
 * the smallest subclass that honors it.
 */
class StubRuntime extends CodingRuntime {
  resolve(request: import('@qilin-agent/coding-runtime').CodingRunRequest): import('@qilin-agent/coding-runtime').CodingRunSpec { return { ...request, cwd: request.cwd ?? process.cwd(), timeoutMs: request.timeoutMs ?? 120_000 } }

  readonly language = 'typescript'
  readonly isolation = 'in-process-stub'
  requests: CodingRunRequest[] = []
  nextResult: CodingRunResult = { logs: [] }

  async run(request: CodingRunRequest): Promise<CodingRunResult> {
    this.requests.push(request)
    if (request.signal?.aborted) {
      return { logs: [], error: { kind: 'abort', message: String(request.signal.reason) } }
    }
    for (const namespace of request.bindings) {
      for (const fn of Object.values(namespace.functions)) {
        await fn({ from: 'stub' })
      }
    }
    return this.nextResult
  }
}

async function setup() {
  const ctx = new Context()
  await ctx.plugin(StubRuntime)
  const runtime = ctx.codingRuntime as StubRuntime
  return { ctx, runtime }
}

describe('CodingRuntime service seam', () => {
  it('registers as ctx.codingRuntime and serves the abstract API', async () => {
    const { runtime } = await setup()
    expect(runtime.language).toBe('typescript')
    expect(runtime.isolation).toBe('in-process-stub')
    expect(runtime.sandboxMode).toBeUndefined()

    const calls: unknown[] = []
    const result = await runtime.run(runtime.resolve({
      program: 'return 1',
      bindings: [{ global: 'tools', functions: { probe: async (args) => { calls.push(args); return null } } }],
    }))
    expect(result).toEqual({ logs: [] })
    expect(calls).toEqual([{ from: 'stub' }])
    expect(runtime.requests).toHaveLength(1)
  })

  it('reports a failed run as an error field on a resolved result, never a rejection', async () => {
    const { runtime } = await setup()
    runtime.nextResult = {
      logs: ['boom'],
      error: { kind: 'exception', message: 'boom' },
    }
    const result = await runtime.run(runtime.resolve({ program: 'throw new Error("boom")', bindings: [] }))
    expect(result.error).toEqual({ kind: 'exception', message: 'boom' })
    expect(result.value).toBeUndefined()
  })

  it('reports a pre-aborted signal as an abort failure', async () => {
    const { runtime } = await setup()
    const controller = new AbortController()
    controller.abort('cancelled')
    const result = await runtime.run(runtime.resolve({ program: 'return 1', bindings: [], signal: controller.signal }))
    expect(result.error).toEqual({ kind: 'abort', message: 'cancelled' })
  })

  it('is removed from the context when the providing fiber disposes (HMR safety)', async () => {
    const ctx = new Context()
    const fiber = await ctx.plugin(StubRuntime)
    expect(ctx.get('codingRuntime')).toBeInstanceOf(StubRuntime)

    await fiber.dispose()
    expect(ctx.get('codingRuntime')).toBeUndefined()
  })

  it('rejects a second implementation in the same context (duplicate service)', async () => {
    const { ctx } = await setup()
    await expect(ctx.plugin(StubRuntime)).rejects.toThrow(/registered/)
  })

})
