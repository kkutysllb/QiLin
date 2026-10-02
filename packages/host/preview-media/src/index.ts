/**
 * Host half of the preview media route: one prefix webServer route serving
 * session-workspace files for the browser's inline previews. The route
 * answers `GET`/`HEAD /sidebar/media?sessionId=<id>&path=<p>` with the
 * file's bytes; a request carrying a `Range` header is answered `206` from a
 * windowed read (so the built-in video viewer can seek), and `?download=1`
 * switches the disposition so the browser saves the file.
 *
 * Security has one home, here. Every request asks the composition's
 * `connection` service for a rejection first (`requestRejection`): its
 * Host/Origin fence defeats DNS rebinding and its browser authentication
 * (the login-token cookie) gates every caller before any byte is reachable.
 * The path then resolves through the abstract filesystem service against the
 * session's live workspace root (the deployment sandbox root as fallback),
 * matching the read contract the workspace-files remote established: reads
 * may name absolute paths outside the workspace, because a preview the user
 * just asked for is not a sandbox escape.
 *
 * Whole-file responses are bounded by `mediaLimitBytes` (default 20 MiB) so
 * a giant file never buffers into host memory; a ranged request reads only
 * its window and is therefore exempt from that cap.
 *
 * The exact route `PUT /sidebar/media/upload` receives one dragged upload
 * from the files tab. Writes are the inverse of the read contract: the
 * resolved target must stay inside the session workspace (403 otherwise),
 * and the publication runs under an explicit `workspace-write` policy at that
 * root so a sandboxing backend fences it too. The request body is bounded by
 * `mediaLimitBytes` before any byte reaches the filesystem.
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@qilin/kylin'
import type {} from '@qilin/host-webserver'
import type {} from '@qilin/fs'
import type {} from '@qilin/sandbox-policy'
import type {} from '@qilin/session'
import z from '@qilin/schemastery'
import type { SessionId } from '@qilin/session/types'
import { parseRange } from './range.ts'

/** Route path the browser media URL builder points at (prefix match). */
export const PREVIEW_MEDIA_PATH = '/sidebar/media'

/** Cordis row selecting the media limit. */
export interface Config {
  /** Ceiling in bytes for one whole-file (non-ranged) response. */
  mediaLimitBytes?: number
}

/** Content types served by the route, by lowercase extension. */
const MEDIA_TYPES: Readonly<Record<string, string>> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.ico': 'image/x-icon',
  '.avif': 'image/avif',
  '.pdf': 'application/pdf',
  '.html': 'text/html',
  '.htm': 'text/html',
  // Video/audio: claimed by the built-in video viewer, served with Range
  // support. The list mirrors the viewer's registered extensions.
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.webm': 'video/webm',
  '.ogv': 'video/ogg',
  '.ogg': 'audio/ogg',
  '.mov': 'video/quicktime',
  '.qt': 'video/quicktime',
  '.mkv': 'video/x-matroska',
  '.avi': 'video/x-msvideo',
  '.wmv': 'video/x-ms-wmv',
  '.flv': 'video/x-flv',
  '.m2ts': 'video/mp2t',
  '.mpeg': 'video/mpeg',
  '.mpg': 'video/mpeg',
  '.3gp': 'video/3gpp',
  '.3g2': 'video/3gpp2',
}

/** The binary-safe fallback for extensions the table does not name. */
const FALLBACK_TYPE = 'application/octet-stream'

/** Content type for one path: the table's entry for its extension, or the fallback. */
function mediaTypeOf(path: string): string {
  const dot = path.lastIndexOf('.')
  const ext = dot === -1 ? '' : path.slice(dot).toLowerCase()
  return MEDIA_TYPES[ext] ?? FALLBACK_TYPE
}

/** One route failure: the HTTP status and the plain-text line to send. */
class MediaError extends Error {
  constructor(readonly status: number, message: string) {
    super(message)
  }
}

/** Trust surface consumed here; the browser-side connection package owns the full type. */
interface PreviewMediaConnection {
  requestRejection(request: { readonly headers: IncomingMessage['headers'] }): 401 | 403 | undefined
}

/** The composition's connection service (typed locally: its package is browser-side). */
function connectionOf(ctx: Context): PreviewMediaConnection {
  return Reflect.get(ctx, 'connection') as PreviewMediaConnection
}

/** Send the failure line and end the response. */
function writeError(res: ServerResponse, error: unknown): void {
  const status = error instanceof MediaError ? error.status : 500
  const line = error instanceof Error ? error.message : String(error)
  if (!res.headersSent) res.writeHead(status, { 'content-type': 'text/plain; charset=utf-8' })
  res.end(status === 500 ? 'internal error' : line)
}

/** Headers shared by every media response (206 and 200 alike). */
function mediaHeaders(type: string): Record<string, string> {
  return {
    'content-type': type,
    'accept-ranges': 'bytes',
    'cache-control': 'no-cache',
  }
}

/** The basename of a path, for the download disposition. */
function basenameOf(path: string): string {
  const slash = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
  return slash === -1 ? path : path.slice(slash + 1)
}

export const inject = ['webServer', 'connection', 'sessions', 'sandboxPolicy', 'fs']

/**
 * Register the preview media route over the composition's filesystem.
 * @param ctx - host context carrying the web server, connection fence,
 * session registry, sandbox policy, and filesystem service.
 * @param config - validated Cordis row (the media limit with its default applied).
 */
export function apply(ctx: Context, config: Config): void {
  const mediaLimitBytes = config.mediaLimitBytes ?? 20 * 1024 * 1024
  const connection = connectionOf(ctx)

  /** The composition's rejection for one request, or undefined when admitted. */
  const rejectionOf = (req: IncomingMessage): number | undefined => connection.requestRejection(req)

  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: PREVIEW_MEDIA_PATH,
    handler: async (req, res) => {
      const rejection = rejectionOf(req)
      if (rejection !== undefined) {
        res.statusCode = rejection
        res.end()
        return
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.writeHead(405, { allow: 'GET, HEAD' })
        res.end()
        return
      }
      try {
        const url = new URL(req.url ?? '/', 'http://qilin.internal')
        const sessionId = url.searchParams.get('sessionId')
        const path = url.searchParams.get('path')
        if (sessionId === null || path === null || path === '') {
          throw new MediaError(400, 'sessionId and path are required')
        }
        const live = ctx.sessions.get(sessionId as SessionId)
        if (live === undefined) throw new MediaError(404, `no session "${sessionId}"`)
        const root = live.header.cwd ?? ctx.sandboxPolicy.workspaceRoot
        const target = await ctx.fs.resolve(path, { cwd: root })
        const info = await ctx.fs.stat(target)
        if (info === undefined) throw new MediaError(404, `no entry at "${path}"`)
        if (info.type !== 'file') throw new MediaError(400, `"${path}" is a ${info.type}`)
        const type = mediaTypeOf(path)

        // A ranged request reads only its window and bypasses the whole-file
        // cap; without a reported size no range can be validated, so such
        // backends always take the buffered path.
        const range = info.size === undefined ? null : parseRange(req.headers.range, info.size)
        if (range !== null && 'unsatisfiable' in range) {
          const size = info.size ?? 0
          res.writeHead(416, { ...mediaHeaders(type), 'content-range': `bytes */${size}` })
          res.end()
          return
        }
        if (range !== null) {
          const { start, end } = range
          const body = await ctx.fs.readByteRange(target, { offset: start, length: end - start + 1 })
          res.writeHead(206, {
            ...mediaHeaders(type),
            'content-range': `bytes ${start}-${end}/${info.size}`,
            'content-length': String(body.byteLength),
          })
          res.end(req.method === 'HEAD' ? undefined : body)
          return
        }
        if (info.size !== undefined && info.size > mediaLimitBytes) {
          throw new MediaError(400, `"${path}" exceeds the preview media limit`)
        }
        const body = await ctx.fs.readBytes(target, undefined, mediaLimitBytes)
        const headers: Record<string, string> = {
          ...mediaHeaders(type),
          'content-length': String(body.byteLength),
        }
        if (url.searchParams.get('download') === '1') {
          headers['content-disposition'] = `attachment; filename*=UTF-8''${encodeURIComponent(basenameOf(path))}`
        }
        res.writeHead(200, headers)
        res.end(req.method === 'HEAD' ? undefined : body)
      } catch (error) {
        writeError(res, error)
      }
    },
  }), `preview-media: GET/HEAD ${PREVIEW_MEDIA_PATH}`)

  /** Buffer one request body up to a byte ceiling; the caller names its limit. */
  const readBody = async (req: IncomingMessage, limit: number): Promise<Buffer> => {
    const chunks: Buffer[] = []
    let total = 0
    for await (const chunk of req) {
      const piece = chunk as Buffer
      total += piece.byteLength
      if (total > limit) throw new MediaError(400, 'upload exceeds the media limit')
      chunks.push(piece)
    }
    return Buffer.concat(chunks)
  }

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: `${PREVIEW_MEDIA_PATH}/upload`,
    handler: async (req, res) => {
      const rejection = rejectionOf(req)
      if (rejection !== undefined) {
        res.statusCode = rejection
        res.end()
        return
      }
      if (req.method !== 'PUT') {
        res.writeHead(405, { allow: 'PUT' })
        res.end()
        return
      }
      try {
        const url = new URL(req.url ?? '/', 'http://qilin.internal')
        const sessionId = url.searchParams.get('sessionId')
        const path = url.searchParams.get('path')
        if (sessionId === null || path === null || path === '') {
          throw new MediaError(400, 'sessionId and path are required')
        }
        const live = ctx.sessions.get(sessionId as SessionId)
        if (live === undefined) throw new MediaError(404, `no session "${sessionId}"`)
        const root = live.header.cwd ?? ctx.sandboxPolicy.workspaceRoot
        const target = await ctx.fs.resolve(path, { cwd: root })
        // Uploads publish inside the session workspace only: the resolved
        // target must stay under the root, and the write runs under an
        // explicit workspace-write policy at that root so a sandboxing backend
        // fences the publication.
        if (!ctx.fs.contains(await ctx.fs.resolve(root), target)) {
          throw new MediaError(403, `"${path}" is outside the workspace`)
        }
        const body = await readBody(req, mediaLimitBytes)
        const outcome = await ctx.fs.writeBytes(target, body, undefined, undefined, { mode: 'workspace-write', workspaceRoot: root })
        res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' })
        res.end(JSON.stringify({ ok: true, path, version: outcome.version }))
      } catch (error) {
        writeError(res, error)
      }
    },
  }), `preview-media: PUT ${PREVIEW_MEDIA_PATH}/upload`)
}

/** Cordis row Config schema: the media limit is a positive byte count. */
export const Config: z<Config> = z.object({
  mediaLimitBytes: z.number().step(1).min(1).max(2_147_483_647).default(20 * 1024 * 1024),
})
