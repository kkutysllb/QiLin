/** Tool-owned path resolution supplied by the existing toolview registration. */
import type { Context } from '@qilin-agent/kylin'
import type { SessionId } from '@qilin-agent/session/types'
import type {} from '@qilin-agent/api-session-controller/client'
import { resolveWorkspacePath } from '@qilin-agent/util-workspace-path'

/** File paths are resolved when a gesture begins, not when the Slot is mounted. */
export interface ToolFileInjected {
  /**
   * Resolve a recorded argument against the live Session directory.
   * @param path - Path as the call recorded it.
   * @returns Host path.
   */
  resolveFilePath: (path: string) => string
}

/**
 * Bind a toolview's path reader to its originating Session.
 * @param ctx - Tool plugin context.
 * @returns The inject callback of an existing Slot registration.
 */
export function toolFileInject(ctx: Context): (sessionId: SessionId) => ToolFileInjected {
  return sessionId => ({
    resolveFilePath: (path) => {
      const cwd = ctx.sessions.list.getSnapshot().byId[sessionId]?.cwd
      const current = ctx.sessions.binding(sessionId)?.session.projections.faceOf('workingDirectory').getSnapshot() as string | null | undefined
      return resolveWorkspacePath(current ?? cwd, path)
    },
  })
}
