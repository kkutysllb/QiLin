/**
 * Gate and naming decisions for the `file` tab type, kept apart from the
 * definition so they stay pure and directly testable.
 *
 * The type claims session-scoped qilin-resource://file/ addresses whose path
 * carries a known text or code extension. Everything else — images, PDFs,
 * unknown extensions, absolute addresses — is left to the `text` fallback
 * viewer: the editor writes, and a write needs the authorizing Session a bare
 * absolute address does not carry. The editable-extension classification the
 * claim shares with the preview's edit affordance lives in
 * `@qilin/util-workspace-path`.
 * @module
 */
import { acceptsPath, parseFileAddress } from '@qilin/util-workspace-path'
import type { SessionId } from '@qilin/session/types'

/** The session and path one claimed address names, as the endpoints receive them. */
export interface SessionFile {
  /** The Session whose workspace resolves relative paths and authorizes writes. */
  readonly sessionId: SessionId
  /** The path handed to the Host, absolute or workspace-relative. */
  readonly path: string
}

/**
 * The type's `canOpen`: take only session-scoped addresses whose path is
 * editable. An absolute address is refused because saving it has no
 * authorizing Session, so the read-only `text` viewer keeps it.
 * @param address - a candidate resource address.
 * @returns whether the type opens the address.
 */
export function canOpenFileAddress(address: string): boolean {
  const parsed = parseFileAddress(address)
  return parsed?.scope === 'session' && acceptsPath(parsed.path)
}

/** The basename of an already-decoded path, on either separator. */
function basenameOfDecoded(path: string): string {
  return path.slice(Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\')) + 1)
}

/**
 * The tab title for one file address: the decoded basename, as the chip names
 * the open file. A malformed percent sequence shows raw rather than refusing
 * the address.
 * @param address - a file-shaped resource address.
 * @returns the decoded last path segment.
 */
export function fileTabTitle(address: string): string {
  const parsed = parseFileAddress(address)
  // `parseFileAddress` already decoded the segments of a known address; only
  // the fallback slice below still carries escapes.
  if (parsed !== undefined) return basenameOfDecoded(parsed.path)
  const raw = address.slice(address.lastIndexOf('/') + 1)
  try {
    return decodeURIComponent(raw)
  } catch {
    return raw
  }
}

/**
 * The session and path one claimed address names.
 *
 * The registry routes only addresses `canOpenFileAddress` accepted, so a
 * non-session address here is a programming error and throws.
 * @param address - a tab's qilin-resource://file/ address.
 * @returns the session and the path to hand the endpoints.
 */
export function sessionFileOf(address: string): SessionFile {
  const parsed = parseFileAddress(address)
  if (parsed?.scope !== 'session') {
    throw new Error(`ui-sidebar-files: not a session file address "${address}"`)
  }
  // The address is a string boundary: its id segment is the Session id it names.
  return { sessionId: parsed.sessionId as SessionId, path: parsed.path }
}
