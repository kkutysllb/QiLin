/** A synchronous spawn failure of the confinement runner resolves as sandbox-unavailable. */
import { expect, it, vi } from 'vitest'
import type { ConfinedArgv } from '@qilin-agent/sandbox'
import { PythonPtcRuntime } from '../src/index.ts'
import { createRuntimeContext } from './setup.ts'

const thrown = vi.hoisted((): { value: unknown } => ({ value: undefined }))

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>()
  return {
    ...actual,
    spawn(...args: Parameters<typeof actual.spawn>): ReturnType<typeof actual.spawn> {
      if (thrown.value !== undefined) {
        const failure = thrown.value
        thrown.value = undefined
        throw failure
      }
      return actual.spawn(...args)
    },
  }
})

it('classifies a sandbox runner that cannot spawn as unavailable', async () => {
  const ctx = await createRuntimeContext({ mode: 'read-only' })
  await ctx.plugin(PythonPtcRuntime)
  const runner = '/opt/qilin/qilin-sandbox-runner'
  vi.spyOn(ctx.sandbox, 'confine').mockImplementation(async (argv): Promise<ConfinedArgv> => ({
    argv: [runner, ...argv.slice(1)],
    enforcement: 'partial',
    denialSignatures: [],
    runnerFailureRules: [],
  }))
  thrown.value = Object.assign(new Error('spawn ENOENT'), { code: 'ENOENT', path: runner, syscall: 'spawn' })
  const result = await ctx.ptcRuntime.run(ctx.ptcRuntime.resolve({ program: 'return 1', bindings: [] }))
  expect(result.error?.kind).toBe('sandbox-unavailable')
  expect(result.error?.message).toContain('runner could not start')
})
