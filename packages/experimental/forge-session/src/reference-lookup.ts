/** Resolve unqualified CLI references in the shell execution world and persist only confirmed URLs. */

import type { Context } from '@qilin-agent/kylin'
import type { Session } from '@qilin-agent/session'
import type { ToolExecution, ToolExecutionResult } from '@qilin-agent/tools'
import type {} from '@qilin-agent/shell'
import type {} from '@qilin-agent/shell-env'
import type {} from '@qilin-agent/sandbox-policy'
import { isAbsolute, sep } from 'node:path'
import { z } from 'zod'
import { ownChangeRequestUrls } from './commands.ts'
import { ghReferences } from './references.ts'

const completedShell = z.object({
  kind: z.literal('foreground'),
  exitCode: z.literal(0),
  signal: z.null(),
  timedOut: z.literal(false),
  aborted: z.literal(false),
})
const shellArguments = z.object({ command: z.string(), workdir: z.string().optional() })

/**
 * Directory of one lookup: the Bash call's own `workdir`, resolved against the
 * Session workspace exactly as the Bash tool resolves it.
 * @param modelWorkdir - `workdir` the model supplied with the call, if any.
 * @param sessionCwd - the Session workspace root, when known.
 * @returns the absolute directory, or undefined when neither is known.
 */
function lookupWorkdir(modelWorkdir: string | undefined, sessionCwd: string | undefined): string | undefined {
  if (modelWorkdir === undefined) return sessionCwd
  if (sessionCwd === undefined || isAbsolute(modelWorkdir)) return modelWorkdir
  return `${sessionCwd}${sep}${modelWorkdir}`
}
const resolvedReference = z.object({ url: z.string().regex(/^https?:\/\/[^\s/]+\/[^\s/]+\/[^\s/]+\/pull\/[1-9]\d*\/?$/) })

/**
 * Observe completed foreground Bash calls while tools and shell services exist.
 * Queries use the same shell service, cwd, managed environment, and standing
 * sandbox policy. Failed lookups leave bindings unchanged and log a warning.
 * Cancellation leaves bindings unchanged; disposal aborts and awaits all queries.
 * Replay performs no lookup.
 * @param ctx - owning plugin context.
 * @param timeoutMs - shell deadline for one read-only lookup.
 * @param record - persists a confirmed URL without restoring dismissed bindings.
 */
export function observeReferences(ctx: Context, timeoutMs: number, record: (session: Session, url: string) => void): void {
  ctx.inject(['tools', 'shell', 'shellEnv'], (scope) => {
    const lifetime = new AbortController()
    const tasks = new Set<Promise<void>>()
    scope.effect(() => async () => {
      lifetime.abort()
      await Promise.allSettled(tasks)
    }, 'forge-session: stop reference lookups')
    scope.on('tools/result', (exec, result) => {
      const task = resolve(exec, result).catch((error: unknown) => {
        if (lifetime.signal.aborted || exec.signal.aborted) return
        scope.logger.warn(`forge-session: PR reference lookup failed; use a full PR URL to bind it: ${error instanceof Error ? error.message : String(error)}`)
      })
      tasks.add(task)
      void task.then(() => tasks.delete(task))
    })

    async function resolve(exec: Readonly<ToolExecution>, result: Readonly<ToolExecutionResult>): Promise<void> {
      if (exec.name !== 'bash' || exec.agent === undefined || exec.parent !== undefined || result.isError) return
      const argumentsResult = shellArguments.safeParse(exec.arguments)
      const shell = completedShell.safeParse(result.value)
      if (!argumentsResult.success || !shell.success) return
      const printed = result.content.flatMap(block => block.type === 'text' ? [block.text] : []).join('\n')
      if (ownChangeRequestUrls(printed).length > 0) return
      const lookups = ghReferences(argumentsResult.data.command).flatMap(reference => reference.lookup === null ? [] : [reference.lookup])
      const agent = exec.agent
      const signal = AbortSignal.any([lifetime.signal, exec.signal])
      const sandboxPolicy = scope.get('sandboxPolicy')?.resolve({ session: agent.session })
      const workdir = lookupWorkdir(argumentsResult.data.workdir, sandboxPolicy?.workspaceRoot ?? agent.session.header.cwd)
      for (const command of lookups) {
        signal.throwIfAborted()
        const spec = scope.shell.resolve({
          command,
          ...workdir === undefined ? {} : { workdir },
          timeoutMs,
          signal,
          qilinEnv: scope.shellEnv.collect(exec),
          sandboxPolicy,
        })
        const output = await scope.shell.run(spec)
        signal.throwIfAborted()
        if (output.exitCode !== 0 || output.signal !== null || output.timedOut || output.aborted || output.stdout.truncated) {
          throw new Error('gh did not return a complete successful reference lookup')
        }
        const parsed = resolvedReference.parse(JSON.parse(output.stdout.text))
        record(agent.session, parsed.url)
      }
    }
  })
}
