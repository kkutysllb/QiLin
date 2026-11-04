/** Native path, Session directory, and URL menu contributions, independent of their trigger components. */
import { IconCopyOutlineRegular, IconFolderOpenOutlineRegular, IconRightUpOutlineRegular } from '@qilin-agent/client-ui-primitives'
import type { PropsLocale, PropsRuntime } from '@qilin-agent/client-ui-slots'
import type { Context } from '@qilin-agent/kylin'
import type {} from '@qilin-agent/client-ui-context-menu/client'
import type { SessionId } from '@qilin-agent/session/types'
import { resolveWorkspacePath } from '@qilin-agent/util-workspace-path'
import type { OpenInAppController } from './controller.ts'
import type { OpenInAppPathController, OpenInAppPathFailure } from './open-path.ts'

/** Installed directory applications that reveal a path in the platform file manager. */
const FILE_MANAGER_APP_IDS = ['finder', 'explorer', 'filemanager'] as const

/**
 * Register native opening, original-path reveal, and URL actions.
 * @param ctx - declared plugin dependencies.
 * @param paths - existing native file path actions.
 * @param t - localized action labels and failure feedback.
 * @param directories - installed directory applications.
 */
export function registerContextMenus(
  ctx: Context,
  paths: OpenInAppPathController,
  t: PropsLocale<'open-in-app'>['t'],
  directories: OpenInAppController,
): void {
  const fileManager = (): string => t(directories.apps.getSnapshot()?.includes('finder') === true ? 'menu.finder' : 'menu.reveal')
  const fileManagerApp = (): string | undefined =>
    directories.apps.getSnapshot()?.find(id => (FILE_MANAGER_APP_IDS as readonly string[]).includes(id))
  const FAILURE_LABELS: Record<OpenInAppPathFailure, 'path.openError' | 'path.revealError'> = {
    openError: 'path.openError',
    revealError: 'path.revealError',
  }
  /** Run one path gesture; the menu reports its failure through the action's own label. */
  const open = async (path: string, action: 'open' | 'reveal', application?: string): Promise<void> => {
    const failure = await paths.openPath(path, action, application)
    if (failure !== null) throw new Error(t(FAILURE_LABELS[failure]))
  }
  const copy = async (text: string): Promise<void> => {
    await navigator.clipboard.writeText(text)
    ctx.contextMenus.notify(t('menu.copied'), true)
  }
  const sessionCwd = (sessionId: SessionId): string | undefined =>
    ctx.sessions.list.getSnapshot().byId[sessionId]?.cwd
  ctx.effect(() => ctx.contextMenus.register({
    id: 'open-in-app.session', target: 'session', order: 500,
    observe: () => [directories.apps, ctx.sessions.list, ctx.locale],
    resolve: ({ sessionId }) => {
      const directory = sessionCwd(sessionId)
      const manager = fileManagerApp()
      return [{
        id: 'reveal', icon: { key: 'open-in-app.reveal' }, label: fileManager(),
        disabled: directory === undefined || manager === undefined,
        failureLabel: t('path.revealError'),
        ...directory === undefined || manager === undefined ? {} : {
          run: async () => { await directories.launch(manager, directory) },
        },
      }]
    },
  }), 'open-in-app: Session directory menu')
  ctx.effect(() => ctx.contextMenus.register({
    id: 'open-in-app.directory', target: 'directory', order: 100,
    observe: () => [paths.desktop, ctx.sessions.list, ctx.locale],
    resolve: ({ sessionId, path }) => {
      const absolutePath = resolveWorkspacePath(sessionCwd(sessionId), path)
      const desktop = paths.desktop.getSnapshot() === true
      return [
        { id: 'reveal', icon: { key: 'open-in-app.reveal' }, label: fileManager(), disabled: !desktop,
          failureLabel: t('path.revealError'), ...desktop ? { run: () => open(absolutePath, 'reveal') } : {} },
        { id: 'copyPath', icon: { key: 'open-in-app.copy' }, label: t('menu.copyDirectoryPath'),
          failureLabel: t('menu.copyFailed'), run: () => copy(absolutePath) },
      ]
    },
  }), 'open-in-app: directory context menu')
  ctx.effect(() => ctx.contextMenus.register({
    id: 'open-in-app.file', target: 'file', order: 100,
    observe: () => [paths.desktop, ctx.sessions.list, ctx.locale],
    resolve: async ({ sessionId, path }, signal) => {
      await paths.load()
      const absolutePath = resolveWorkspacePath(sessionCwd(sessionId), path)
      const desktop = paths.desktop.getSnapshot() === true
      const applications = desktop ? await paths.applications(absolutePath, signal) : []
      signal.throwIfAborted()
      const application = applications?.find(app => app.default) ?? undefined
      return [
        { id: 'reveal', icon: { key: 'open-in-app.reveal' }, label: fileManager(), disabled: !desktop,
          failureLabel: t('path.revealError'), ...desktop ? { run: () => open(absolutePath, 'reveal') } : {} },
        { id: 'open', label: application === undefined ? t('menu.defaultApp') : t('menu.openInApp', { app: application.name }),
          icon: { key: 'open-in-app.application', ...application?.icon ? { src: application.icon } : {} },
          disabled: application === undefined,
          failureLabel: t('path.openError'),
          ...application === undefined ? {} : { run: () => open(absolutePath, 'open', application.id) } },
        { id: 'copyPath', icon: { key: 'open-in-app.copy' }, label: t('menu.copyPath'),
          failureLabel: t('menu.copyFailed'), run: () => copy(absolutePath) },
      ]
    },
  }), 'open-in-app: file context menu')
  ctx.effect(() => ctx.contextMenus.register({
    id: 'open-in-app.url', target: 'url', order: 100,
    resolve: ({ url }) => [
      { id: 'external', icon: { key: 'open-in-app.external' }, label: t('menu.external'),
        run: () => { window.open(url, '_blank', 'noopener,noreferrer') } },
      { id: 'copy', icon: { key: 'open-in-app.copy' }, label: t('menu.copyLink'),
        failureLabel: t('menu.copyFailed'), run: () => copy(url) },
    ],
  }), 'open-in-app: URL context menu')
}

/** @param props - icon metadata captured with the resolved action. @returns the application image or the native-open glyph. */
export function ContextMenuApplicationIcon({ icon }: Pick<PropsRuntime<'contextMenu.icon'>, 'icon'>) {
  return icon.src === undefined ? <IconRightUpOutlineRegular /> : <img src={icon.src} width={14} height={14} alt="" />
}

/** Icons for the actions this plugin contributes. */
export const CONTEXT_MENU_ICONS = {
  'open-in-app.reveal': IconFolderOpenOutlineRegular,
  'open-in-app.copy': IconCopyOutlineRegular,
  'open-in-app.external': IconRightUpOutlineRegular,
} as const
