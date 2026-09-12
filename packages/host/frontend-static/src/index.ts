/**
 * @qilin/host-frontend-static — SPA dist server over the webserver fallback
 * seat: serves the built frontend directory with explicit index entry points
 * and public documents. A readable index renders at every configured index
 * path; missing paths return 404, traversal outside the dist root is 403,
 * unknown extensions ship as octet-stream, and non-GET/HEAD is 405. Every
 * index response first passes Connection's browser authorization — the account
 * session gate included — then the webserver's index render (structured
 * injection rows, then raw taps). A public document is the composition's
 * pre-session surface (landing page, sign-in page) and ships as its own bytes
 * without that authorization. Non-index assets stay public. The dist location
 * is workspace knowledge of the composing application, so `distIndex` is
 * typically supplied through a `!!js` expression, never hardcoded by a
 * deployment.
 * @module @qilin/host-frontend-static
 */

import type { ServerResponse } from 'node:http'
import { readFile } from 'node:fs/promises'
import { dirname, extname, join, normalize, resolve, sep } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type {} from '@qilin/client-connection'
import type {} from '@qilin/host-webserver'

/** Stable Cordis plugin name. */
export const name = 'frontend-static'

/** Services required before the authenticated fallback seat can be claimed. */
export const inject = ['webServer', 'connection']

/** One public document served at a fixed request path, before index authorization. */
export interface StaticDocument {
  /** Absolute request pathname, no trailing slash. */
  path: string
  /** File name inside the dist root. */
  file: string
}

/** Plugin config: the dist anchor, its index entry paths, and its public documents. */
export interface Config {
  /** Absolute path of index.html inside the dist root. */
  distIndex: string
  /**
   * Request paths that serve the index document. Each one passes Connection's
   * index authorization before its bytes are read. An omitted or empty list
   * follows the transport's entry path plus `/index.html`, so the path a
   * deployment hands a browser is always one this server answers.
   */
  indexPaths?: string[]
  /**
   * Public documents served without index authorization: the landing page and
   * the sign-in page of an assembly whose entry path is the application.
   * @default []
   */
  documents?: StaticDocument[]
}

export const Config: z<Config> = z.object({
  distIndex: z.string().required(),
  // Both fields resolve their default in `apply`, where the transport's entry
  // path is readable: a schema default would freeze the index at a path this
  // deployment does not serve.
  indexPaths: z.array(String),
  documents: z.array(z.object({
    path: z.string().required(),
    file: z.string().required(),
  })),
})

const HTML_MIME = 'text/html; charset=utf-8'

const MIME: Record<string, string> = {
  '.html': HTML_MIME,
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.map': 'application/json',
  '.webmanifest': 'application/manifest+json',
  // The packed VFS image. Served as its own bytes, never as a Content-Encoding:
  // the worker inflates the body itself, and a transport-level encoding would
  // leave it inflating an already-decoded archive.
  '.gz': 'application/gzip',
}

const STATIC_MISS_CODES: ReadonlySet<string | undefined> = new Set([
  'ENOENT',
  'EISDIR',
  'ENOTDIR',
])

/** Resolved dist layout and authorization for one static request. */
export interface StaticDistPlan {
  /** Absolute dist root directory. */
  distRoot: string
  /** Request paths serving the gated index document. */
  indexPaths: ReadonlySet<string>
  /** Request pathname to dist file name for the public documents. */
  documents: ReadonlyMap<string, string>
  /** Authenticates an index response before its bytes are read; answers the browser when it refuses. */
  authorizeIndex: () => boolean
  /** Renders the index.html body for one authorized index request. */
  renderIndex: () => Promise<string>
}

/**
 * Anchor every relative URL in one served page at the site root. The dist is
 * built with a relative base so the same files mount under any static
 * directory; the served form answers deep paths, where relative asset URLs
 * would otherwise resolve under the request directory.
 * @param html - the raw page body.
 * @returns the body with a `<base href="/">` inserted after its opening head tag.
 */
export function withSiteBase(html: string): string {
  return html.replace(/<head(?:\s[^>]*)?>/i, open => `${open}<base href="/">`)
}

/**
 * Serve one GET/HEAD static request from the dist root.
 * @param pathname - decoded URL pathname of the request.
 * @param res - the node:http response to write.
 * @param plan - resolved dist layout and the index authorization to apply.
 */
export async function serveStatic(
  pathname: string, res: ServerResponse, plan: StaticDistPlan,
): Promise<void> {
  const target = resolve(normalize(join(plan.distRoot, pathname)))
  // Traversal rejection: the target must be distRoot itself (`/`) or stay under
  // it. `sep`, not '/': resolve() emits backslash paths on Windows, where a '/'
  // suffix would reject every legitimate subpath as traversal.
  if (target !== plan.distRoot && !target.startsWith(plan.distRoot + sep)) {
    res.writeHead(403)
    res.end()
    return
  }
  let body: string | Buffer
  let type: string
  try {
    const document = plan.documents.get(pathname)
    if (document !== undefined) {
      body = withSiteBase(await readFile(resolve(plan.distRoot, document), 'utf8'))
      type = HTML_MIME
    } else if (plan.indexPaths.has(pathname)) {
      if (!plan.authorizeIndex()) return
      body = await plan.renderIndex()
      type = HTML_MIME
    } else {
      body = await readFile(target)
      type = MIME[extname(target)] ?? 'application/octet-stream'
    }
  } catch (error) {
    // Only absent or non-file targets are 404; other filesystem failures reach
    // the webserver's request-failure handling.
    if (!STATIC_MISS_CODES.has((error as NodeJS.ErrnoException).code)) throw error
    res.writeHead(404)
    res.end()
    return
  }
  res.writeHead(200, { 'content-type': type })
  res.end(body)
}

/**
 * Assert one configured document cannot name anything but a file directly
 * inside the dist root. A malformed entry fails the load loudly rather than
 * silently serving a neighboring path.
 * @param document - the configured row.
 * @param indexPaths - the sibling index-path configuration, checked for collisions.
 * @throws Error when the row is not a bare request path and file name.
 */
function assertDocument(document: StaticDocument, indexPaths: ReadonlySet<string>): void {
  if (!document.path.startsWith('/')
    || (document.path !== '/' && document.path.endsWith('/'))
    || document.path.includes('//')) {
    throw new Error(`frontend-static: document path ${JSON.stringify(document.path)} must be an absolute pathname without a trailing slash`)
  }
  if (indexPaths.has(document.path)) {
    throw new Error(`frontend-static: ${JSON.stringify(document.path)} is both a document and an index path`)
  }
  if (document.file === '' || document.file.includes('/') || document.file.includes('\\') || document.file === '.' || document.file === '..') {
    throw new Error(`frontend-static: document file ${JSON.stringify(document.file)} must be a bare dist file name`)
  }
}

/**
 * Claim the webserver fallback seat and serve the dist.
 * @param ctx - plugin context carrying the webServer service.
 * @param config - validated {@link Config}.
 */
export function apply(ctx: Context, config: Config): void {
  const distRoot = dirname(config.distIndex)
  // The config schema materializes an omitted array as an empty one, so the
  // entry-path default is resolved here, where the transport is readable.
  const configuredIndexPaths = config.indexPaths ?? []
  const indexPaths = new Set(configuredIndexPaths.length > 0
    ? configuredIndexPaths
    : [ctx.connection.entryPath, '/index.html'])
  const documents = new Map<string, string>()
  for (const document of config.documents ?? []) {
    assertDocument(document, indexPaths)
    if (documents.has(document.path)) {
      throw new Error(`frontend-static: duplicate document path ${JSON.stringify(document.path)}`)
    }
    documents.set(document.path, document.file)
  }
  const renderIndex = async (): Promise<string> =>
    withSiteBase(ctx.webServer.renderIndex(await readFile(config.distIndex, 'utf8')))
  ctx.effect(() => ctx.webServer.registerFallback(async (req, res) => {
    // Non-GET/HEAD without a matching named route is 405 (fallback-only
    // semantics: named routes own their method handling).
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405)
      res.end()
      return
    }
    /* v8 ignore next -- node:http always sets url on server requests */
    const rawPath = new URL(req.url ?? '/', 'http://x').pathname
    await serveStatic(decodeURIComponent(rawPath), res, {
      distRoot,
      indexPaths,
      documents,
      authorizeIndex: () => ctx.connection.authorizeIndex(req, res),
      renderIndex,
    })
  }), 'frontend-static: fallback seat')
}
