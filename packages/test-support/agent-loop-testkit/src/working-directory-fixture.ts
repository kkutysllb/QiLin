import type { Context } from '@qilin-agent/kylin'
import type { Agent } from '@qilin-agent/agent'
import type { Session } from '@qilin-agent/session'

/**
 * Provide a minimal `workingDirectory` service for tests whose subject only
 * needs the Session's original directory: reads resolve to the header `cwd`
 * (or the fallback), and `ensure` returns it without durable changes,
 * recovery, or notice queuing. Tests of those behaviors mount the real
 * service instead.
 * @param ctx - test context that owns the provided service.
 * @param defaultDirectory - fallback for a Session without `cwd`.
 */
export function provideWorkingDirectoryFixture(ctx: Context, defaultDirectory = process.cwd()): void {
  const get = (session: Session): string => session.header.cwd ?? defaultDirectory
  ctx.provide('workingDirectory', {
    defaultDirectory,
    get,
    ensure: (agent: Agent): Promise<string> => Promise.resolve(get(agent.session)),
  })
}
