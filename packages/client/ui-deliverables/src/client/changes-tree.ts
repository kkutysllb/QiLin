/**
 * The directory-tree projection of a flat changed-path list, shared by every
 * lens that lists changes: a flat list becomes nesting whose directory rows
 * carry a recursive file count and can be folded, with single-child chains
 * compressed so `src/client/office/x.ts` does not cost four rows of ceremony
 * when each level holds one directory.
 */

/** One changed file: its path plus the caller's own row payload. */
export interface ChangesTreeInput<T> {
  /** Path relative to the repository or Session root, `/`-separated. */
  readonly path: string
  readonly item: T
}

/** A file row. */
export interface ChangesTreeFile<T> {
  readonly kind: 'file'
  /** Full path: what a row action opens. */
  readonly path: string
  /** The label to show: the basename. */
  readonly name: string
  /** Nesting level, 0 at the top. */
  readonly depth: number
  readonly item: T
}

/** A directory row. */
export interface ChangesTreeDir<T> {
  readonly kind: 'dir'
  /** Full directory path. */
  readonly path: string
  /** The label to show: a compressed single-child chain reads as `a/b/c`. */
  readonly name: string
  /** Nesting level, 0 at the top. */
  readonly depth: number
  /** Files underneath, recursively. */
  readonly count: number
  readonly children: readonly ChangesTreeNode<T>[]
}

/** One row of a built tree. */
export type ChangesTreeNode<T> = ChangesTreeDir<T> | ChangesTreeFile<T>

/** A file row before its nesting level is known. */
interface FileDraft<T> {
  path: string
  name: string
  item: T
}

/** A directory while the tree is still being assembled. */
interface DirDraft<T> {
  path: string
  name: string
  dirs: Map<string, DirDraft<T>>
  files: FileDraft<T>[]
}

/** Case-insensitive alphabetical order, with a stable tiebreak so two casings never swap between renders. */
function byName(left: { name: string }, right: { name: string }): number {
  const leftKey = left.name.toLowerCase()
  const rightKey = right.name.toLowerCase()
  if (leftKey !== rightKey) return leftKey < rightKey ? -1 : 1
  return left.name < right.name ? -1 : left.name > right.name ? 1 : 0
}

/** Files in a subtree. */
function countFiles<T>(nodes: readonly ChangesTreeNode<T>[]): number {
  let total = 0
  for (const node of nodes) total += node.kind === 'file' ? 1 : countFiles(node.children)
  return total
}

/**
 * Build the directory tree for a flat path list.
 *
 * Directories sort before files, each group alphabetically; a directory whose
 * only child is another directory merges into that child, so the compressed
 * row carries the whole chain as its label. Duplicate paths stay as they are:
 * the caller decides what a repeat means.
 * @param entries - the flat changed-file rows.
 * @returns the top-level rows.
 */
export function buildChangesTree<T>(entries: readonly ChangesTreeInput<T>[]): ChangesTreeNode<T>[] {
  const root: DirDraft<T> = { path: '', name: '', dirs: new Map(), files: [] }
  for (const entry of entries) {
    const cut = entry.path.lastIndexOf('/')
    const fileName = cut === -1 ? entry.path : entry.path.slice(cut + 1)
    const segments = cut === -1 ? [] : entry.path.slice(0, cut).split('/')
    let cursor = root
    let walked = ''
    for (const segment of segments) {
      if (segment === '') continue
      walked = walked === '' ? segment : `${walked}/${segment}`
      let next = cursor.dirs.get(segment)
      if (next === undefined) {
        next = { path: walked, name: segment, dirs: new Map(), files: [] }
        cursor.dirs.set(segment, next)
      }
      cursor = next
    }
    cursor.files.push({ path: entry.path, name: fileName, item: entry.item })
  }

  const finish = (draft: DirDraft<T>, depth: number): ChangesTreeNode<T>[] => {
    const dirs: ChangesTreeDir<T>[] = []
    for (const child of draft.dirs.values()) {
      let path = child.path
      let name = child.name
      let cursor = child
      // No files here and exactly one sub-directory: merge the chain downward.
      while (cursor.files.length === 0 && cursor.dirs.size === 1) {
        cursor.dirs.forEach((next) => {
          path = next.path
          name = `${name}/${next.name}`
          cursor = next
        })
      }
      const children = finish(cursor, depth + 1)
      dirs.push({ kind: 'dir', path, name, depth, count: countFiles(children), children })
    }
    dirs.sort(byName)
    const files = draft.files.map((file): ChangesTreeFile<T> => ({
      kind: 'file', path: file.path, name: file.name, depth, item: file.item,
    }))
    files.sort(byName)
    return [...dirs, ...files]
  }

  return finish(root, 0)
}

/**
 * Flatten a tree into the rows to draw, honouring folded directories.
 * @param nodes - the tree.
 * @param isCollapsed - whether one directory path is folded shut.
 * @returns rows in display order; a folded directory keeps its own row.
 */
export function flattenChangesTree<T>(
  nodes: readonly ChangesTreeNode<T>[],
  isCollapsed: (path: string) => boolean,
): ChangesTreeNode<T>[] {
  const rows: ChangesTreeNode<T>[] = []
  const walk = (list: readonly ChangesTreeNode<T>[]): void => {
    for (const node of list) {
      rows.push(node)
      if (node.kind === 'dir' && !isCollapsed(node.path)) walk(node.children)
    }
  }
  walk(nodes)
  return rows
}
