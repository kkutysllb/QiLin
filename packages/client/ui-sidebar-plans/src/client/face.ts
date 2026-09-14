/**
 * The plan list's asynchronous half: scanning the workspace into the store.
 *
 * The component never awaits anything. It calls `refresh`, and this face runs
 * the pure {@link scanPlans} through the reader bound here and writes the
 * outcome through the store's own actions — the Slot-standard `inject` shape,
 * so the session id is resolved by the framework and the write set stays the
 * store's.
 *
 * One tab has one scan in force: asking again — the reload gesture, the poll —
 * retires the scan still in flight for it, whose settlement then writes
 * nothing. Cleanup rides the owner's `signal`: no scan starts for a record
 * that already ended, and when the record goes away its bucket and its
 * generation are forgotten together.
 */
import type { ClientRemote } from '@qilin/api-remotes/client'
import type { BoundActions } from '@qilin/client-store'
import type { TabId } from '@qilin/client-ui-dockkit'
import type { SessionId } from '@qilin/session/types'
import { scanPlans } from './plans.ts'
import type { PlanReader } from './plans.ts'
import type { createPlansStore } from './store.ts'

/**
 * The slice of the Client Remote face this package calls: the
 * `workspaceFiles` namespace's `list`, `read`, and `stat`, exactly as the
 * Host's generated client declares them.
 */
export type WorkspaceFilesPlanRemote = {
  readonly workspaceFiles: Pick<ClientRemote['workspaceFiles'], 'list' | 'read' | 'stat'>
}

/**
 * Bind the scan to one Remote face.
 *
 * The namespace's three methods already have the reader's signatures: the
 * session travels with every call because the endpoint resolves the workspace
 * root from it, and a Remote call does not reject.
 * @param remote - the Client Remote face carrying the `workspaceFiles` namespace.
 * @returns the reader the pure scan performs.
 */
export function createReader(remote: WorkspaceFilesPlanRemote): PlanReader {
  return remote.workspaceFiles
}

/** The panel's injected business face, as the body receives it. */
export interface PlansInjected {
  /**
   * Scan this tab's workspace and write the outcome into its bucket.
   * @param tabId - the tab being drawn.
   * @param root - absolute path of the workspace root.
   * @param signal - the tab record's lifetime.
   */
  readonly refresh: (tabId: TabId, root: string, signal: AbortSignal) => void
}

/**
 * Bind the panel's face to one reader.
 * @param reader - the reader the scan performs.
 * @returns the Slot `inject` factory: session and bound actions in, face out.
 */
export function plansFace(
  reader: PlanReader,
): (sessionId: SessionId, actions: BoundActions<ReturnType<typeof createPlansStore>>) => PlansInjected {
  return (sessionId, actions): PlansInjected => {
    /** Per tab: the scan generation a settlement must match; the latest request wins. */
    const generations = new Map<TabId, number>()
    return {
      refresh(tabId, root, signal) {
        if (signal.aborted) return
        if (!generations.has(tabId)) {
          signal.addEventListener('abort', () => {
            generations.delete(tabId)
            actions.forget(tabId)
          }, { once: true })
        }
        const generation = (generations.get(tabId) ?? 0) + 1
        generations.set(tabId, generation)
        actions.scanning(tabId)
        void scanPlans(sessionId, root, reader, signal).then((scan) => {
          // A newer scan of this tab was asked for since, or the record is gone
          // and its bookkeeping with it: nothing left for this one to write.
          if (generations.get(tabId) !== generation) return
          actions.settled(tabId, scan.rows, scan.failure)
        })
      },
    }
  }
}
