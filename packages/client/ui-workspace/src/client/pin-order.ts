/**
 * The account memberships a pin order write reconciles against, derived from
 * the same Host snapshots the browser orders by, so the UiWorkspace service
 * completes the write without the browser in the loop.
 */
import type { SessionListState } from '@qilin/api-session-controller/client'
import type { WorkspaceView } from '@qilin/api-workspace-controller/client'
import type { SessionId } from '@qilin/session/types'
import { FLAT_SESSION_ORDER_KEY } from './stores.ts'
import { owningGroupKey, sessionMemberIds, UNGROUPED_KEY } from './tree.ts'

/**
 * Every account's complete membership: each Workspace, Ungrouped, and the flat list.
 * @param workspaces - current Host Workspaces.
 * @param list - current Session list snapshot.
 * @returns membership per account key plus the summaries a reconciliation orders by.
 */
export function pinOrderSource(
  workspaces: readonly WorkspaceView[],
  list: SessionListState,
): { members: Readonly<Record<string, readonly SessionId[]>>; summaries: SessionListState['byId'] } {
  const accounted = new Set(workspaces.flatMap(workspace => workspace.sessionIds))
  return {
    members: Object.fromEntries([
      ...workspaces.map(workspace => [workspace.workspaceId, workspace.sessionIds] as const),
      [UNGROUPED_KEY, list.ids.filter(id => list.byId[id] !== undefined && !accounted.has(id))],
      [FLAT_SESSION_ORDER_KEY, sessionMemberIds(list)],
    ]),
    summaries: list.byId,
  }
}

/**
 * The accounts a pinned Session leads: its group (or Ungrouped) and the flat list.
 * @param workspaces - current Host Workspaces.
 * @param sessionId - the Session being pinned.
 * @returns the account keys a pin write fronts.
 */
export function pinOrderAccounts(workspaces: readonly WorkspaceView[], sessionId: SessionId): readonly string[] {
  return [owningGroupKey(workspaces, sessionId), FLAT_SESSION_ORDER_KEY]
}
