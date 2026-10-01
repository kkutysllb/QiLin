/**
 * The workspace file tree, as both tab types of this package draw it: the
 * `files` page full-pane, the `file` editor in its side pane.
 *
 * Everything the tree keeps lives in the package store, bucketed by tab; the
 * component only decides what to draw for each absolute path and what a click
 * means: a directory toggles, a file opens through the owner's `tabActions`
 * for a viewer to claim, and anything else is shown but refuses to open.
 * A right-click on a directory or file row opens this module's own menu at
 * the cursor: open (files), copy the workspace-relative path, copy the
 * absolute path.
 */
import { useRef, useState } from 'react'
import type { MouseEvent, ReactNode } from 'react'
import clsx from 'clsx'
import type { RemoteFailure } from '@qilin/api-remotes/client'
import type { TranslateNS } from '@qilin/client-locale/client'
import {
  FileTypeIcon, IconFolderClose16, IconFolderOpen16, IconLinkOutline14, Menu, classifyFileType, writeClipboard,
} from '@qilin/client-ui-primitives'
import type { WorkspaceDirectoryEntry } from '@qilin/api-workspace-files/types'
import { childPath } from './face.ts'
import type {} from './locales.ts'
import type { FilesTabState } from './store.ts'
import css from './FilesBody.module.css'

/** Natural, case-insensitive name order, so `file2` precedes `file10`. */
const byName = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

/**
 * Order one level's entries for display: directories first, then everything
 * else, each group by name. The endpoint's order is a listing fact; this is the
 * reader's.
 * @param entries - the listing as the endpoint returned it.
 * @returns a new array, directories first, then by name within each group.
 */
export function orderEntries(entries: readonly WorkspaceDirectoryEntry[]): WorkspaceDirectoryEntry[] {
  return [...entries].sort((left, right) => {
    const group = Number(right.type === 'directory') - Number(left.type === 'directory')
    return group !== 0 ? group : byName.compare(left.name, right.name)
  })
}

/**
 * Say why a directory could not be listed, in terms of the directory.
 * @param t - namespace-bound translate.
 * @param failure - the settled Remote failure.
 * @returns the line to show under the directory.
 */
export function failureLine(t: TranslateNS<'sidebarFiles'>, failure: RemoteFailure): string {
  switch (failure.code) {
    case 'workspace-file/not-found': return t('error.notFound')
    case 'workspace-file/outside-workspace': return t('error.outsideWorkspace')
    case 'workspace-file/not-directory': return t('error.notDirectory')
    // Carrier and unclassified host failures reach the reader as themselves:
    // this tree knows nothing useful to add to a transport-level message.
    default: return t('error.unavailable', { message: failure.message })
  }
}

/**
 * The text one row's menu copies.
 * @param root - the workspace root, the prefix relative paths drop.
 * @param path - the row's absolute path.
 * @param form - whether the copy keeps or drops the root prefix.
 * @returns `.` for the root itself, the suffix after the root's `/` when under
 * it, and the absolute path for a tree rooted somewhere neither covers.
 */
export function copyTextOf(root: string, path: string, form: 'relative' | 'absolute'): string {
  if (form === 'absolute') return path
  if (path === root) return '.'
  return path.startsWith(`${root}/`) ? path.slice(root.length + 1) : path
}

/** What every level shares: the tab's tree and its gestures. */
interface TreeContext {
  readonly state: FilesTabState
  readonly onToggle: (path: string) => void
  readonly onOpen: (path: string) => void
  readonly onMenu: (path: string, kind: 'directory' | 'file', x: number, y: number) => void
  readonly t: TranslateNS<'sidebarFiles'>
}

/**
 * The link glyph a row whose listed name is itself a symbolic link carries.
 * @param t - namespace-bound translate, for the glyph's tooltip.
 * @returns the icon wrapped in its tooltip span; drawn only for a symlinked name.
 */
function LinkMark({ t }: { t: TranslateNS<'sidebarFiles'> }): ReactNode {
  return (
    <span className={css.linkIcon} title={t('entry.symlink')} data-files-symlink>
      <IconLinkOutline14 aria-label={t('entry.symlink')} />
    </span>
  )
}

/** One entry's row, and its children when it is an expanded directory. */
function Entry({ parent, entry, tree }: { parent: string; entry: WorkspaceDirectoryEntry; tree: TreeContext }): ReactNode {
  const path = childPath(parent, entry.name)
  const menu = (event: MouseEvent<HTMLButtonElement>): void => {
    event.preventDefault()
    tree.onMenu(path, entry.type === 'directory' ? 'directory' : 'file', event.clientX, event.clientY)
  }
  if (entry.type === 'directory') {
    const expanded = tree.state.expanded.includes(path)
    return (
      <li className={css.item} data-files-entry="directory" data-files-path={path}>
        <button
          type="button"
          className={css.row}
          aria-expanded={expanded}
          onClick={() => { tree.onToggle(path) }}
          onContextMenu={menu}
        >
          {expanded ? <IconFolderOpen16 className={css.icon} /> : <IconFolderClose16 className={css.icon} />}
          <span className={css.name}>{entry.name}</span>
          {entry.symlink === true && <LinkMark t={tree.t} />}
        </button>
        {expanded && <ul className={css.level}><Level path={path} tree={tree} /></ul>}
      </li>
    )
  }
  if (entry.type === 'file') {
    return (
      <li className={css.item} data-files-entry="file" data-files-path={path}>
        <button type="button" className={css.row} onClick={() => { tree.onOpen(path) }} onContextMenu={menu}>
          <FileTypeIcon kind={classifyFileType(entry.name)} size={16} className={css.fileIcon} />
          <span className={css.name}>{entry.name}</span>
          {entry.symlink === true && <LinkMark t={tree.t} />}
        </button>
      </li>
    )
  }
  return (
    <li className={css.item} data-files-entry="other" data-files-path={path}>
      <span className={clsx(css.row, css.other)} aria-disabled="true" title={tree.t('entry.other')}>
        <span className={css.name}>{entry.name}</span>
      </span>
    </li>
  )
}

/** One directory's rows: its state while listing, its entries once listed. */
function Level({ path, tree }: { path: string; tree: TreeContext }): ReactNode {
  const { state, t } = tree
  const level = state.levels[path]
  if (level === undefined || level.kind === 'loading') {
    return <li className={css.note} data-files-row="loading">{t('loading')}</li>
  }
  if (level.kind === 'failed') {
    return (
      <li className={css.note} data-files-row="failed" data-files-code={level.failure.code}>
        {failureLine(t, level.failure)}
      </li>
    )
  }
  const entries = orderEntries(level.level.entries)
  return (
    <>
      {entries.length === 0 && <li className={css.note} data-files-row="empty">{t('empty')}</li>}
      {entries.map(entry => <Entry key={entry.name} parent={path} entry={entry} tree={tree} />)}
      {level.level.truncated && <li className={css.note} data-files-row="truncated">{t('truncated')}</li>}
    </>
  )
}

/**
 * The tree itself: the root level, whatever the reader has opened under it,
 * and the one context menu its rows share.
 * @param props - the tab's tree state, its two gestures, and its copy.
 * @returns the root level's rows, with the row menu in a portal.
 */
export function FileTree(props: {
  readonly state: FilesTabState
  readonly onToggle: (path: string) => void
  readonly onOpen: (path: string) => void
  readonly t: TranslateNS<'sidebarFiles'>
}): ReactNode {
/** The row the open menu serves, and the cursor rect it opened at. */
  const [menu, setMenu] = useState<{ path: string; kind: 'directory' | 'file' } | null>(null)
  const rectRef = useRef<DOMRect | null>(null)
  const onMenu = (path: string, kind: 'directory' | 'file', x: number, y: number): void => {
    rectRef.current = new DOMRect(x, y, 0, 0)
    setMenu({ path, kind })
  }
  const tree: TreeContext = { state: props.state, onToggle: props.onToggle, onOpen: props.onOpen, onMenu, t: props.t }
  const close = (): void => { setMenu(null) }
  const t = props.t
  const items = menu?.kind === 'file'
    ? [
      { id: 'open', label: t('menu.open') },
      { id: 'relative', label: t('menu.copyRelative') },
      { id: 'absolute', label: t('menu.copyAbsolute') },
    ]
    : [
      { id: 'relative', label: t('menu.copyRelative') },
      { id: 'absolute', label: t('menu.copyAbsolute') },
    ]
  const select = (id: string): void => {
    const open = menu
    /* v8 ignore next -- the Menu fires onSelect only for a row of an open menu. */
    if (open === null) return
    close()
    if (id === 'open') props.onOpen(open.path)
    else if (id === 'relative' || id === 'absolute') void writeClipboard(copyTextOf(props.state.root, open.path, id))
  }
  return (
    <>
      <ul className={css.level}><Level path={props.state.root} tree={tree} /></ul>
      <Menu
        open={menu !== null}
        anchor={<span className={css.menuAnchor} data-files-menu-anchor hidden />}
        items={items}
        autoFocus
        portal
        onClose={close}
        onSelect={select}
        getAnchorRect={() => rectRef.current}
      />
    </>
  )
}
