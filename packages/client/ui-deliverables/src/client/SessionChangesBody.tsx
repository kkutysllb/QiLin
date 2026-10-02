/**
 * The Session changes page: every file the Session's recorded turns changed,
 * folded by path and grouped into a foldable directory tree. A row reopens the
 * latest turn that changed its file in the review tab, which owns the diff
 * rendering; this page owns only the list and its grouping.
 */
import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { FileTypeIcon, IconChevronDownOutline14, classifyFileType } from '@qilin/client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@qilin/client-ui-slots'
import type { ObservableSnapshot } from '@qilin/client-store'
import type { WorkspaceSessionChangedFile } from '@qilin/workspace-changes/types'
import { changesSessionUrl } from '../changes.ts'
import { buildChangesTree, flattenChangesTree, type ChangesTreeDir } from './changes-tree.ts'
import type { SessionChangesStore } from './session-changes.ts'
import type { NS } from './locales.ts'
import css from './SessionChanges.module.css'

/** The folded list, its reads, and the review tab a row opens. */
export type SessionChangesInjected = {
  readonly hooks: {
    readonly sessionChanges: ObservableSnapshot<ReturnType<SessionChangesStore['state']['getSnapshot']>>
  }
  readonly loadSessionChanges: SessionChangesStore['load']
  /** @param seq - the announcing event of the turn to review. @param turn - that turn. @param index - the file's index in its summary. */
  readonly openTurn: (seq: number, turn: number, index: number) => void
}

/** The page's composed props: the tab it draws, its injected face, and its copy. */
export type SessionChangesProps = PropsRuntime<'sidebar.right.pane.tab'> & InjectFace<SessionChangesInjected> & PropsLocale<typeof NS>

/** Line counts shown beside a file row. */
const COUNT = new Intl.NumberFormat('en-US')

/**
 * Draw the Session's folded changes as a directory tree.
 * @param props - the tab, its injected face, and the translated copy.
 * @returns the list, or the state that says why it is not showing.
 */
export function SessionChangesBody({ sessionId, useSessionChanges, loadSessionChanges, openTurn, t }: SessionChangesProps): ReactNode {
  const url = changesSessionUrl(sessionId)
  const state = useSessionChanges(value => value[url])
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set<string>())
  useEffect(() => {
    if (state === undefined) void loadSessionChanges(sessionId)
  }, [state, sessionId, loadSessionChanges])
  const files = state === undefined || state === 'loading' || state === 'missing' ? [] : state.files
  const tree = useMemo(() => buildChangesTree(files.map(file => ({ path: file.path, item: file }))), [files])
  const isCollapsed = (path: string): boolean => collapsed.has(path)
  const toggle = (path: string): void => {
    setCollapsed((previous) => {
      const next = new Set(previous)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }
  if (state === undefined || state === 'loading') {
    return <div className={css.page} data-session-changes="loading"><p className={css.notice} role="status">{t('session.loading')}</p></div>
  }
  if (state === 'missing') {
    return <div className={css.page} data-session-changes="missing"><p className={css.notice}>{t('session.missing')}</p></div>
  }
  if (state.files.length === 0) {
    return <div className={css.page} data-session-changes="empty"><p className={css.notice}>{t('session.empty')}</p></div>
  }
  return (
    <div className={css.page} data-session-changes="ready">
      <div className={css.bar}>
        <span className={css.count}>{t('session.count', { count: String(state.total) })}</span>
        <span className={css.added}>{t('changes.added', { count: COUNT.format(state.added) })}</span>
        <span className={css.deleted}>{t('changes.deleted', { count: COUNT.format(state.deleted) })}</span>
      </div>
      <div className={css.rows}>
        {flattenChangesTree(tree, isCollapsed).map((node) => {
          if (node.kind === 'dir') {
            const dir: ChangesTreeDir<WorkspaceSessionChangedFile> = node
            return (
              <button
                key={`dir:${dir.path}`}
                type="button"
                className={css.dirRow}
                style={dir.depth === 0 ? undefined : { paddingLeft: `${8 + dir.depth * 14}px` }}
                title={dir.path}
                aria-expanded={!isCollapsed(dir.path)}
                data-session-changes-dir={dir.path}
                onClick={() => { toggle(dir.path) }}
              >
                <IconChevronDownOutline14 size={12} className={isCollapsed(dir.path) ? css.chevronFolded : css.chevron} />
                <span className={css.dirName}>{dir.name}</span>
                <span className={css.dirCount}>{dir.count}</span>
              </button>
            )
          }
          const file = node.item
          return (
            <button
              key={`file:${file.path}`}
              type="button"
              className={css.fileRow}
              style={node.depth === 0 ? undefined : { paddingLeft: `${8 + node.depth * 14}px` }}
              title={file.display}
              data-session-changes-file={file.path}
              onClick={() => { openTurn(file.lastSeq, file.lastTurn, file.lastIndex) }}
            >
              <FileTypeIcon kind={classifyFileType(node.name)} size={14} className={css.fileIcon} />
              <span className={css.fileName}>{node.name}</span>
              <span className={css.trailing}>
                {file.turns > 1 && <span className={css.turns}>{t('session.turns', { count: String(file.turns) })}</span>}
                {file.binary === true
                  ? <span className={css.flag}>{t('changes.binary')}</span>
                  : file.oversized === true
                    ? <span className={css.flag}>{t('changes.oversized')}</span>
                    : (
                      <>
                        <span className={css.added}>{file.added > 0 ? t('changes.added', { count: COUNT.format(file.added) }) : ''}</span>
                        <span className={css.deleted}>{file.deleted > 0 ? t('changes.deleted', { count: COUNT.format(file.deleted) }) : ''}</span>
                      </>
                    )}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
