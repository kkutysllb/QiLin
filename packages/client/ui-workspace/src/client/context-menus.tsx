/** Structured Session and Workspace actions over the workspace owner's existing callbacks. */
import type { Context } from '@qilin-agent/kylin'
import type {} from '@qilin-agent/client-ui-context-menu/client'
import type {} from '@qilin-agent/client-locale/client'
import type { WorkspaceId } from '@qilin-agent/api-workspace-controller/client'
import type { ShortcutCommandId } from '@qilin-agent/client-shortcuts/client'
import type { SessionId } from '@qilin-agent/session/types'

/** The callbacks the browser already runs for its own row menus. */
export interface WorkspaceMenuActions {
  /** Pin a Session ahead of unpinned rows. */
  pin: (sessionId: SessionId) => void
  /** Drop one Session's pin. */
  unpin: (sessionId: SessionId) => void
  /** Open the browser-owned Session rename dialog. */
  requestSessionRename: (sessionId: SessionId, currentTitle: string) => void
  /** Fork a Session at its last completed turn. */
  fork: (sessionId: SessionId) => void
  /** Copy a Session's complete id and report the outcome. */
  copySessionId: (sessionId: SessionId) => void
  /** Archive a Session into the registry-global set. */
  archive: (sessionId: SessionId) => void
  /** Open the browser-owned Workspace rename or delete dialog. */
  requestWorkspaceAction: (workspaceId: WorkspaceId, currentTitle: string, action: 'rename' | 'delete') => void
}

/**
 * Register the built-in Session and Workspace actions on the shared menu.
 * @param ctx - workspace plugin context owning menus, membership, and locale.
 * @param actions - shared row callbacks; execution always uses the captured object.
 */
export function registerWorkspaceMenus(ctx: Context, actions: WorkspaceMenuActions): void {
  const t = ctx.locale.bind('workspace')
  const state = () => ctx.workspaces.list.getSnapshot()
  ctx.effect(() => ctx.contextMenus.register({
    id: 'workspace.session.pin', target: 'session', order: 100,
    observe: () => [ctx.workspaces.list, ctx.locale],
    resolve: ({ sessionId }) => {
      const pinned = state().pinnedSessionIds.includes(sessionId)
      return [{
        id: 'pin', label: t(pinned ? 'menu.unpinSession' : 'menu.pinSession'),
        icon: { key: pinned ? 'workspace.unpin' : 'workspace.pin' },
        run: () => { (pinned ? actions.unpin : actions.pin)(sessionId) },
      }]
    },
  }), 'ui-workspace: pin menu')
  ctx.effect(() => ctx.contextMenus.register({
    id: 'workspace.session.rename', target: 'session', order: 200,
    resolve: ({ sessionId, displayTitle }) => [{
      id: 'rename', label: t('rename'), icon: { key: 'workspace.rename' }, commandId: 'session.rename' as ShortcutCommandId,
      run: () => { actions.requestSessionRename(sessionId, displayTitle) },
    }],
  }), 'ui-workspace: rename menu')
  ctx.effect(() => ctx.contextMenus.register({
    id: 'workspace.session.fork', target: 'session', order: 300,
    resolve: ({ sessionId }) => [{
      id: 'fork', label: t('menu.fork'), icon: { key: 'workspace.fork' }, commandId: 'session.fork' as ShortcutCommandId,
      run: () => { actions.fork(sessionId) },
    }],
  }), 'ui-workspace: fork menu')
  ctx.effect(() => ctx.contextMenus.register({
    id: 'workspace.session.id', target: 'session', order: 450,
    resolve: ({ sessionId }) => [{
      id: 'copy', label: t('menu.sessionId'), icon: { key: 'workspace.copy' }, separatorBefore: true,
      run: () => { actions.copySessionId(sessionId) },
    }],
  }), 'ui-workspace: Session id menu')
  ctx.effect(() => ctx.contextMenus.register({
    id: 'workspace.session.archive', target: 'session', order: 600,
    resolve: ({ sessionId }) => [{
      id: 'archive', label: t('menu.archiveSession'), icon: { key: 'workspace.archive' },
      separatorBefore: true, afterContent: true, commandId: 'session.archive' as ShortcutCommandId,
      run: () => { actions.archive(sessionId) },
    }],
  }), 'ui-workspace: archive menu')
  ctx.effect(() => ctx.contextMenus.register({
    id: 'workspace.header.rename', target: 'workspace', order: 100,
    resolve: ({ workspaceId, displayTitle }) => [{
      id: 'rename', label: t('rename'), icon: { key: 'workspace.rename' },
      run: () => { actions.requestWorkspaceAction(workspaceId, displayTitle, 'rename') },
    }],
  }), 'ui-workspace: Workspace rename menu')
  ctx.effect(() => ctx.contextMenus.register({
    id: 'workspace.header.delete', target: 'workspace', order: 300,
    resolve: ({ workspaceId, displayTitle }) => [{
      id: 'delete', label: t('delete.workspace'), icon: { key: 'workspace.delete' }, danger: true, separatorBefore: true,
      run: () => { actions.requestWorkspaceAction(workspaceId, displayTitle, 'delete') },
    }],
  }), 'ui-workspace: Workspace delete menu')
}
