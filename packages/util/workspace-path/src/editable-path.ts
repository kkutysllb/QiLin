/**
 * Which file paths the client opens as editable text, kept as one pure
 * classification beside the address grammar so the editor's address guard and
 * the preview's edit affordance read the same fact.
 * @module
 */

/**
 * Extensions opened as editable text, lower-case without the leading dot:
 * every language the editor maps to a grammar plus plain-text extensions
 * edited without one. Anything absent falls to the preview viewer.
 */
export const TEXT_FILE_EXTENSIONS: ReadonlySet<string> = new Set([
  // Plain text.
  'txt', 'text', 'log', 'csv', 'tsv', 'conf', 'cfg', 'ini', 'properties', 'env',
  'diff', 'patch', 'mk', 'cmake', 'bat', 'cmd',
  // Languages with an installed grammar or legacy mode.
  'js', 'mjs', 'cjs', 'jsx', 'ts', 'mts', 'cts', 'tsx',
  'json', 'jsonc', 'json5',
  'md', 'markdown', 'mdx',
  'py', 'pyi', 'pyw',
  'css', 'scss', 'sass', 'less',
  'html', 'htm',
  'rs', 'java', 'go', 'rb', 'lua', 'pl', 'pm', 'r', 'swift',
  'c', 'h', 'cpp', 'cc', 'cxx', 'hpp', 'hh', 'hxx',
  'sql',
  'xml', 'xsl', 'xslt', 'xsd', 'dtd', 'plist',
  'yaml', 'yml', 'toml',
  'sh', 'bash', 'zsh', 'fish', 'ksh', 'csh', 'ps1', 'psd1', 'psm1',
  // Framework files edited as plain text; no installed grammar.
  'vue', 'svelte', 'astro',
])

/**
 * The final suffix of a path, lower-case, matching the shared file-type
 * classifier's rule: a leading dot starts a suffix, and a missing or trailing
 * dot yields the empty string.
 * @param path - a slash- or backslash-separated path.
 * @returns the lower-case suffix, or the empty string.
 */
export function extensionOf(path: string): string {
  const name = path.slice(Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\')) + 1)
  const dot = name.lastIndexOf('.')
  return dot < 0 ? '' : name.slice(dot + 1).toLowerCase()
}

/**
 * Whether a file path is one the client opens as editable text: its extension
 * must be known.
 * @param path - the path the Host receives.
 * @returns whether the path takes the editor.
 */
export function acceptsPath(path: string): boolean {
  return TEXT_FILE_EXTENSIONS.has(extensionOf(path))
}

/**
 * Extensions whose reading surface is the rendered document preview,
 * lower-case without the leading dot: every one is also editable text, so the
 * preview viewer's edit affordance reaches the editor for it. The editor keeps
 * its ranked claim; open gestures read `previewedPath` to land the first open
 * on the preview instead of the code view.
 */
export const PREVIEW_FILE_EXTENSIONS: ReadonlySet<string> = new Set([
  'html', 'htm',
  'md', 'markdown', 'mdx',
])

/**
 * Whether a file path opens as a rendered preview first: its extension must be
 * one with a rendered viewer, so the code view is not the default reading
 * surface.
 * @param path - the path an open gesture names.
 * @returns whether the path's first open lands on the rendered preview.
 */
export function previewedPath(path: string): boolean {
  return PREVIEW_FILE_EXTENSIONS.has(extensionOf(path))
}
