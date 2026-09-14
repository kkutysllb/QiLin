/**
 * Whole-file reading for the editor: one paged walk over `workspaceFiles.read`
 * assembled into the exact disk text, bounded by the editor's own byte cap.
 *
 * A page's lines join by `\n` with no terminator after the last, and a final
 * `\n` on disk terminates the last line rather than starting an empty one, so
 * the page stream alone cannot say whether the file ends with a newline. The
 * complete file's byte size rides every page: an assembled text exactly one
 * UTF-8 byte short of it had that terminator, and it is restored so a save
 * round-trips the file byte for byte.
 * @module
 */
import type { RemoteFailure, RemoteResult } from '@qilin/api-remotes/client'
import type { SessionId } from '@qilin/session/types'
import type { WorkspaceFileText } from '@qilin/api-workspace-files/types'

/** Largest file the editor opens, in bytes; the Host's page cap bounds each read. */
export const MAX_EDIT_BYTES = 2 * 1024 * 1024

/** One page of lines, as the endpoint returns it. */
export type ReadWorkspaceFilePage = (
  sessionId: SessionId,
  path: string,
  offset: number,
  signal: AbortSignal,
) => Promise<RemoteResult<WorkspaceFileText>>

/** A whole file, or the failure that stopped the walk. */
export type WholeFileResult = RemoteResult<{ readonly text: string; readonly version: string }>

/**
 * Assemble whole text from a complete page walk.
 *
 * Pages join by `\n`; a file whose byte size is exactly one more than the
 * assembly's UTF-8 length ends with a newline on disk, and it is appended.
 * A size that matches neither is reported as-is rather than guessed at.
 * @param pages - the walk's pages, in order.
 * @returns the file's text as the disk holds it.
 */
export function reassemblePages(pages: readonly WorkspaceFileText[]): string {
  const text = pages.map(page => page.text).join('\n')
  const bytes = pages[pages.length - 1]?.bytes
  if (bytes === undefined) return text
  let encoded = 0
  for (const part of pages) encoded += new TextEncoder().encode(part.text).byteLength
  // The joins themselves: one separator byte per gap the page texts needed.
  const separators = Math.max(pages.length - 1, 0)
  return bytes === encoded + separators + 1 ? text + '\n' : text
}

/**
 * Bind the whole-file walk to one paged read.
 * @param readPage - the bound `workspaceFiles.read` call.
 * @returns the read the editor's face performs.
 */
export function createReadWhole(readPage: ReadWorkspaceFilePage): (
  sessionId: SessionId,
  path: string,
  signal: AbortSignal,
) => Promise<WholeFileResult> {
  return async (sessionId, path, signal) => {
    const pages: WorkspaceFileText[] = []
    let offset = 1
    for (;;) {
      const result = await readPage(sessionId, path, offset, signal)
      if (!result.ok) return result
      pages.push(result.value)
      // The first page carries the complete file's size: past the editor's
      // cap the walk stops here with the endpoint's own too-large code.
      if (result.value.bytes !== undefined && result.value.bytes > MAX_EDIT_BYTES) {
        // A client-side refusal, built like the carrier rebuilds one: a real
        // Error carrying the endpoint's own too-large code.
        const failure: RemoteFailure = Object.assign(
          new Error(`"${path}" exceeds the editor's ${String(MAX_EDIT_BYTES)} byte cap`),
          {
            name: 'RemoteError',
            isQILINRemoteError: true as const,
            code: 'workspace-file/too-large' as const,
            details: { path, limit: MAX_EDIT_BYTES },
          },
        )
        return { ok: false, error: failure }
      }
      if (result.value.eof) {
        return { ok: true, value: { text: reassemblePages(pages), version: result.value.version } }
      }
      offset += result.value.lines
    }
  }
}
