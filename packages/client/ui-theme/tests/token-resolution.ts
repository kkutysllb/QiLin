/**
 * Token-resolution scan shared by the ui-theme stylesheet contracts: which
 * `var(--token)` references a client stylesheet leaves without a fallback and
 * cannot resolve, and where the client programs define the tokens the palette
 * sheets do not own.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Repository root, the base every diagnostic path is relative to. */
const ROOT_DIR = fileURLToPath(new URL('../../../../', import.meta.url))

/** Directory the client packages live under. */
const CLIENT_DIR = fileURLToPath(new URL('../../', import.meta.url))

/** Desktop preload sources: the shell injects the Windows window-geometry tokens. */
const DESKTOP_DIR = fileURLToPath(new URL('../../../../apps/desktop/src/', import.meta.url))

/** Stylesheet directory ui-theme owns. */
export const THEME_STYLES_DIR = fileURLToPath(new URL('../src/styles/', import.meta.url))

/** One scanned source file and the token facts read from it. */
export interface ScannedFile {
  /** Repository-relative path, used in diagnostics. */
  path: string
  /** File text with block comments blanked, so commented-out tokens never count. */
  text: string
}

/**
 * Answer tokens no Client sheet defines, but a shipped viewer stylesheet does:
 * pdf.js paints the text layer and sets these from its own `pdf_viewer.css`.
 */
export const VENDOR_TOKENS: ReadonlySet<string> = new Set([
  '--min-font-size',
])

/**
 * Blank block comments while preserving offsets and line numbers.
 * @param text - file text.
 * @returns the same text with comment bodies replaced by spaces.
 */
export function blankComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, comment => comment.replace(/[^\n]/g, ' '))
}

function walk(directory: string, accept: (name: string) => boolean, found: string[] = []): string[] {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const full = join(directory, entry.name)
    if (entry.isDirectory()) {
      if (!['node_modules', 'lib', 'dist'].includes(entry.name)) walk(full, accept, found)
    } else if (accept(entry.name)) found.push(full)
  }
  return found
}

/**
 * Source roots the client token contracts range over: each client package's
 * `src`, plus the desktop preload sources, whose program injects the Windows
 * window-geometry tokens a client sheet reads.
 * @returns absolute directories to walk.
 */
function sourceRoots(): string[] {
  const roots: string[] = []
  for (const entry of readdirSync(CLIENT_DIR, { withFileTypes: true })) {
    if (entry.isDirectory()) roots.push(join(CLIENT_DIR, entry.name, 'src'))
  }
  roots.push(DESKTOP_DIR)
  return roots
}

/**
 * Enumerate the files the client token contracts range over.
 * @param extensions - file extensions to accept, such as `'.css'`.
 * @returns repository-relative paths of every matching source file.
 */
export function clientSourceFiles(extensions: readonly string[]): string[] {
  const accept = (name: string): boolean => extensions.some(extension => name.endsWith(extension))
  return sourceRoots()
    .flatMap(root => walk(root, accept))
    .map(file => relative(ROOT_DIR, file))
    .sort()
}

/**
 * Read scanned client sources from disk.
 * @param extensions - file extensions to accept.
 * @returns one entry per file, comments blanked.
 */
export function readClientSources(extensions: readonly string[]): ScannedFile[] {
  return clientSourceFiles(extensions).map(path => ({
    path,
    text: blankComments(readFileSync(join(ROOT_DIR, path), 'utf8')),
  }))
}

/**
 * Collect the custom properties a stylesheet declares.
 * @param text - comment-blanked stylesheet text.
 * @returns the declared token names.
 */
export function declaredTokens(text: string): string[] {
  return [...text.matchAll(/(--[a-zA-Z0-9_-]+)\s*:/g)].map(match => match[1] as string)
}

/**
 * Collect the tokens a client program injects: a `setProperty` call or an
 * object-literal key, which is how theme presenters, brand packs, and component
 * geometry hand values to stylesheets.
 * @param text - comment-blanked program text.
 * @returns the injected token names.
 */
export function injectedTokens(text: string): string[] {
  const quoted = [...text.matchAll(/['"](--[a-zA-Z0-9_-]+)['"]\s*:/g)].map(match => match[1] as string)
  const assigned = [...text.matchAll(/setProperty\(\s*['"](--[a-zA-Z0-9_-]+)['"]/g)].map(match => match[1] as string)
  return [...quoted, ...assigned]
}

/** One token reference a stylesheet leaves without a fallback. */
export interface TokenReference {
  /** Repository-relative stylesheet path. */
  path: string
  /** 1-based line of the reference. */
  line: number
  /** The referenced custom property. */
  token: string
}

/**
 * Report every `var(--token)` reference with no fallback whose token nothing
 * defines. A reference with a fallback keeps its declaration valid, so it is
 * not a defect; the check is about declarations that compute to nothing.
 * @param files - stylesheets to scan, comments already blanked.
 * @param defined - tokens the theme sheets and client programs provide.
 * @param vendor - tokens a shipped third-party stylesheet provides.
 * @returns unresolved references in source order.
 */
export function unresolvedReferences(
  files: readonly ScannedFile[],
  defined: ReadonlySet<string>,
  vendor: ReadonlySet<string>,
): TokenReference[] {
  const missing: TokenReference[] = []
  for (const file of files) {
    for (const match of file.text.matchAll(/var\(\s*(--[a-zA-Z0-9_-]+)\s*(,)?/g)) {
      const token = match[1] as string
      if (match[2] === ',') continue
      if (defined.has(token) || vendor.has(token)) continue
      const line = file.text.slice(0, match.index).split('\n').length
      missing.push({ path: file.path, line, token })
    }
  }
  return missing
}

/**
 * Read the tokens the theme sheets declare.
 * @returns token names from every sheet the palette owns.
 */
export function themeTokens(): Set<string> {
  const defined = new Set<string>()
  for (const name of readdirSync(THEME_STYLES_DIR).filter(entry => entry.endsWith('.css'))) {
    for (const token of declaredTokens(blankComments(readFileSync(join(THEME_STYLES_DIR, name), 'utf8')))) {
      defined.add(token)
    }
  }
  return defined
}

/**
 * Read the tokens client stylesheets declare outside the theme, such as a
 * component-local surface or geometry token another component in the same
 * package reads.
 * @returns token names from every non-theme client stylesheet.
 */
export function componentTokens(): Set<string> {
  const defined = new Set<string>()
  for (const file of readClientSources(['.css'])) {
    for (const token of declaredTokens(file.text)) defined.add(token)
  }
  return defined
}

/**
 * Read the tokens client programs inject at runtime.
 * @returns injected token names.
 */
export function programTokens(): Set<string> {
  const defined = new Set<string>()
  for (const file of readClientSources(['.ts', '.tsx'])) {
    for (const token of injectedTokens(file.text)) defined.add(token)
  }
  return defined
}
