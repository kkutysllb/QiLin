/**
 * The workspace file tree, as both tab types of this package draw it: the
 * `files` page full-pane, the `file` editor in its side pane.
 *
 * Everything the tree keeps lives in the package store, bucketed by tab; the
 * component only decides what to draw for each absolute path and what a click
 * means: a directory toggles, a file opens through the owner's `tabActions`
 * for a viewer to claim, and anything else is shown but refuses to open.
 *
 * A right-click opens this module's own menu at the cursor. On a row: open
 * (files), create inside (directories), rename, delete, and the two copies; on
 * the tree's own background: creating at the workspace root. A rename happens
 * in the row itself, which becomes a name box; creating and deleting ask
 * through the shared dialog, because naming an entry and removing one with
 * everything inside it both take an answer the row cannot give. Every gesture
 * ends in the store's mutation record, which the strip above the rows reports
 * and a dismissal clears.
 */
import { useRef, useState } from 'react'
import type { MouseEvent, ReactNode } from 'react'
import clsx from 'clsx'
import type { RemoteFailure } from '@qilin-agent/api-remotes/client'
import type { TranslateNS } from '@qilin-agent/client-locale/client'
import {
  Button, FileTypeIcon, IconCloseOutline16, IconFolderClose16, IconFolderOpen16, IconLinkOutline14, Input, Menu,
  Modal, classifyFileType, writeClipboard,
} from '@qilin-agent/client-ui-primitives'
import type { MenuEntry } from '@qilin-agent/client-ui-primitives'
import type { WorkspaceDirectoryEntry } from '@qilin-agent/api-workspace-files/types'
import { pathPartsOf } from '@qilin-agent/util-workspace-path'
import { joinEntryPath, mutationFailureLine, normalizedEntryName } from './file-mutations.ts'
import type { EntryKind } from './file-mutations.ts'
import type {} from './locales.ts'
import type { FilesTabState, TreeMutationState } from './store.ts'
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

/** What every level shares: the tab's tree, its gestures, and the row being renamed. */
interface TreeContext {
  readonly state: FilesTabState
  readonly onToggle: (path: string) => void
  readonly onOpen: (path: string) => void
  readonly onMenu: (path: string, kind: EntryKind, x: number, y: number) => void
  /** Absolute path of the row currently being renamed, or `null` for none. */
  readonly naming: string | null
  /** Whether the last rename commit was refused as a name. */
  readonly namingInvalid: boolean
  readonly onNameCommit: (path: string, current: string, text: string) => void
  readonly onNameCancel: () => void
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

/**
 * One row's name while it is being renamed: an input holding the current name,
 * Enter committing and Escape abandoning. It owns the text, so a refused name
 * keeps what was typed, and it reports every commit up: the tree decides both
 * what a name may be and what the refusal means.
 */
function NameBox({ initial, invalid, label, onCommit, onCancel }: {
  readonly initial: string
  readonly invalid: boolean
  readonly label: string
  readonly onCommit: (text: string) => void
  readonly onCancel: () => void
}): ReactNode {
  const [text, setText] = useState(initial)
  return (
    <input
      type="text"
      className={css.nameInput}
      data-files-name-input
      aria-label={label}
      aria-invalid={invalid || undefined}
      value={text}
      autoFocus
      onFocus={(event) => { event.currentTarget.select() }}
      onChange={(event) => { setText(event.target.value) }}
      onClick={(event) => { event.stopPropagation() }}
      onKeyDown={(event) => {
        // An IME commits its own composition on Enter; the name follows later.
        if (event.nativeEvent.isComposing) return
        if (event.key === 'Enter') {
          event.preventDefault()
          onCommit(text)
        } else if (event.key === 'Escape') {
          event.preventDefault()
          onCancel()
        }
      }}
    />
  )
}

/** One entry's row, and its children when it is an expanded directory. */
function Entry({ parent, entry, tree }: { parent: string; entry: WorkspaceDirectoryEntry; tree: TreeContext }): ReactNode {
  const path = joinEntryPath(parent, entry.name)
  const kind: EntryKind = entry.type === 'directory' ? 'directory' : 'file'
  const menu = (event: MouseEvent<HTMLButtonElement>): void => {
    event.preventDefault()
    // The tree's own background menu must not follow a row's.
    event.stopPropagation()
    tree.onMenu(path, kind, event.clientX, event.clientY)
  }
  if (tree.naming === path) {
    return (
      <li className={css.item} data-files-entry={entry.type} data-files-path={path}>
        <NameBox
          initial={entry.name}
          invalid={tree.namingInvalid}
          label={tree.t('menu.rename')}
          onCommit={(text) => { tree.onNameCommit(path, entry.name, text) }}
          onCancel={tree.onNameCancel}
        />
      </li>
    )
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

/** One mutation's strip row, drawn above the tree's rows while it is worth saying. */
function MutationStrip({ mutation, t, onDismiss }: {
  readonly mutation: TreeMutationState
  readonly t: TranslateNS<'sidebarFiles'>
  readonly onDismiss: () => void
}): ReactNode {
  if (mutation.kind === 'idle') return null
  if (mutation.kind === 'running') {
    return <li className={css.note} data-files-row="mutation-running">{t('mutating')}</li>
  }
  return (
    <li className={css.mutation} data-files-row="mutation-failed" data-files-code={mutation.failure.code}>
      <span className={css.mutationText}>{mutationFailureLine(t, mutation.failure)}</span>
      <button
        type="button"
        className={css.mutationDismiss}
        aria-label={t('error.dismiss')}
        title={t('error.dismiss')}
        data-files-mutation-dismiss
        onClick={onDismiss}
      >
        <IconCloseOutline16 />
      </button>
    </li>
  )
}

/** What the open menu serves: one row, or the tree's own background (the root). */
type MenuTarget =
  | { readonly at: 'row'; readonly path: string; readonly kind: EntryKind }
  | { readonly at: 'root' }

/**
 * The tree itself: the root level, whatever the reader has opened under it, and
 * the one context menu its rows and its background share.
 * @param props - the tab's tree state, its gestures, its copy, and the row
 * mutations it dispatches.
 * @returns the root level's rows, with the menu and both dialogs in portals.
 */
export function FileTree(props: {
  readonly state: FilesTabState
  readonly onToggle: (path: string) => void
  readonly onOpen: (path: string) => void
  readonly onCreate: (directory: string, name: string, kind: EntryKind) => void
  readonly onRename: (path: string, name: string) => void
  readonly onDelete: (path: string, kind: EntryKind) => void
  readonly onDismissMutation: () => void
  readonly t: TranslateNS<'sidebarFiles'>
}): ReactNode {
  const [menu, setMenu] = useState<MenuTarget | null>(null)
  const rectRef = useRef<DOMRect | null>(null)
  /** The row being renamed, and whether its last commit was refused as a name. */
  const [naming, setNaming] = useState<string | null>(null)
  const [namingInvalid, setNamingInvalid] = useState(false)
  /** The dialog making one entry, and its text. */
  const [creating, setCreating] = useState<{ directory: string; kind: EntryKind } | null>(null)
  const [createDraft, setCreateDraft] = useState('')
  const [createInvalid, setCreateInvalid] = useState(false)
  /** The entry awaiting delete confirmation. */
  const [deleting, setDeleting] = useState<{ path: string; kind: EntryKind } | null>(null)
  const t = props.t
  const openMenu = (target: MenuTarget, x: number, y: number): void => {
    rectRef.current = new DOMRect(x, y, 0, 0)
    setMenu(target)
  }
  const startCreate = (directory: string, kind: EntryKind): void => {
    setCreateDraft('')
    setCreateInvalid(false)
    setCreating({ directory, kind })
  }
  const closeCreate = (): void => {
    setCreating(null)
    setCreateInvalid(false)
  }
  const commitCreate = (directory: string, kind: EntryKind): void => {
    const name = normalizedEntryName(createDraft)
    if (name === undefined) {
      setCreateInvalid(true)
      return
    }
    closeCreate()
    props.onCreate(directory, name, kind)
  }
  const commitRename = (path: string, current: string, text: string): void => {
    const name = normalizedEntryName(text)
    if (name === undefined) {
      setNamingInvalid(true)
      return
    }
    setNaming(null)
    setNamingInvalid(false)
    // Renaming to the name it already has is no change to ask the Host for.
    if (name !== current) props.onRename(path, name)
  }
  const cancelRename = (): void => {
    setNaming(null)
    setNamingInvalid(false)
  }
  const tree: TreeContext = {
    state: props.state,
    onToggle: props.onToggle,
    onOpen: props.onOpen,
    onMenu: (path, kind, x, y) => { openMenu({ at: 'row', path, kind }, x, y) },
    naming,
    namingInvalid,
    onNameCommit: commitRename,
    onNameCancel: cancelRename,
    t,
  }
  const items: readonly MenuEntry[] = menu === null
    ? []
    : menu.at === 'root'
      ? [
        { id: 'new-file', label: t('menu.newFile') },
        { id: 'new-folder', label: t('menu.newFolder') },
      ]
      : [
        ...(menu.kind === 'file' ? [{ id: 'open', label: t('menu.open') }] : [
          { id: 'new-file', label: t('menu.newFile') },
          { id: 'new-folder', label: t('menu.newFolder') },
        ]),
        { type: 'separator', id: 'mutations' },
        { id: 'rename', label: t('menu.rename') },
        { id: 'delete', label: t('menu.delete'), danger: true },
        { type: 'separator', id: 'copies' },
        { id: 'relative', label: t('menu.copyRelative') },
        { id: 'absolute', label: t('menu.copyAbsolute') },
      ]
  const select = (id: string): void => {
    const target = menu
    /* v8 ignore next -- the Menu fires onSelect only for a row of an open menu. */
    if (target === null) return
    setMenu(null)
    if (target.at === 'root') {
      startCreate(props.state.root, id === 'new-folder' ? 'directory' : 'file')
      return
    }
    if (id === 'open') {
      props.onOpen(target.path)
      return
    }
    if (id === 'new-file' || id === 'new-folder') {
      // The entry lands in that directory's own rows, so show them first.
      if (!props.state.expanded.includes(target.path)) props.onToggle(target.path)
      startCreate(target.path, id === 'new-folder' ? 'directory' : 'file')
      return
    }
    if (id === 'rename') {
      setNamingInvalid(false)
      setNaming(target.path)
      return
    }
    if (id === 'delete') {
      setDeleting({ path: target.path, kind: target.kind })
      return
    }
    if (id === 'relative') {
      void writeClipboard(copyTextOf(props.state.root, target.path, 'relative'))
      return
    }
    void writeClipboard(copyTextOf(props.state.root, target.path, 'absolute'))
  }
  return (
    <>
      <div
        className={css.treeRoot}
        data-files-tree
        // Only the tree's own background: a row opens its own menu and stops
        // the bubble there.
        onContextMenu={(event) => {
          event.preventDefault()
          openMenu({ at: 'root' }, event.clientX, event.clientY)
        }}
      >
        <ul className={css.level}>
          <MutationStrip mutation={props.state.mutation} t={t} onDismiss={props.onDismissMutation} />
          <Level path={props.state.root} tree={tree} />
        </ul>
      </div>
      <Menu
        open={menu !== null}
        anchor={<span className={css.menuAnchor} data-files-menu-anchor hidden />}
        items={items}
        autoFocus
        portal
        onClose={() => { setMenu(null) }}
        onSelect={select}
        getAnchorRect={() => rectRef.current}
      />
      {creating !== null && (
        <Modal
          open
          onClose={closeCreate}
          title={creating.kind === 'file' ? t('create.fileTitle') : t('create.directoryTitle')}
          description={t('create.inDirectory', { directory: creating.directory })}
          closeLabel={t('cancel')}
          footer={(
            <>
              <Button variant="outline" data-files-create-cancel onClick={closeCreate}>{t('cancel')}</Button>
              <Button
                variant="primary"
                data-files-create-confirm
                onClick={() => { commitCreate(creating.directory, creating.kind) }}
              >
                {t('create.confirm')}
              </Button>
            </>
          )}
        >
          <Input
            data-files-create-name
            aria-label={t('create.name')}
            aria-invalid={createInvalid || undefined}
            placeholder={t('create.placeholder')}
            value={createDraft}
            onChange={(event) => { setCreateDraft(event.target.value) }}
          />
          {createInvalid && <p className={css.nameError} data-files-create-invalid>{t('name.invalid')}</p>}
        </Modal>
      )}
      {deleting !== null && (
        <Modal
          open
          onClose={() => { setDeleting(null) }}
          title={t('delete.title', { name: pathPartsOf(deleting.path).name })}
          closeLabel={t('cancel')}
          footer={(
            <>
              <Button variant="outline" data-files-delete-cancel onClick={() => { setDeleting(null) }}>{t('cancel')}</Button>
              <Button
                variant="primary"
                data-files-delete-confirm
                onClick={() => {
                  const target = deleting
                  setDeleting(null)
                  props.onDelete(target.path, target.kind)
                }}
              >
                {t('delete.confirm')}
              </Button>
            </>
          )}
        >
          <p className={css.dialogBody}>
            {deleting.kind === 'directory' ? t('delete.directoryBody') : t('delete.fileBody')}
          </p>
        </Modal>
      )}
    </>
  )
}
