/**
 * `sidebar_open`: the model-facing request to show a file or an http(s) page in
 * the Sidebar of its own Session.
 *
 * Delivery is a Host-to-browser push over a Remote stream (`watch`): a request
 * is consumed on send while a view for that Session is attached, and otherwise
 * waits in a bounded per-Session queue that a later attachment replays. A
 * request is never durable: replaying a historical open on every page load
 * would reopen a tab the user closed, which is why this is a stream and not a
 * Session event. The tool call and its result stay in the Session log like any
 * other tool, so what the model asked for is still reconstructable.
 */
import { randomUUID } from 'node:crypto'
import { basename } from 'node:path'
import type { Context } from '@qilin/kylin'
import z from '@qilin/schemastery'
import { defineTool } from '@qilin/tools'
import type {} from '@qilin/agent'
import type {} from '@qilin/fs'
import type { SessionId } from '@qilin/session'
import { Remote, TypertRemoteService } from '@qilin/typert-protocol'
import type { SidebarOpenRequest } from './types.ts'

export type * from './types.ts'

/** Stable Loader identity. */
export const name = 'sidebar-opens'

/** Services the tool verifies its target through. */
export const inject = ['tools', 'fs']

declare module '@qilin/kylin' {
  interface Context {
    /** Pending and live sidebar opens, one bounded queue per Session. */
    sidebarOpens: SidebarOpens
  }
}

/** Deployment limits for the pending queue. */
export interface Config {
  /** Open requests a Session may queue while no Sidebar view is attached. */
  readonly maxQueued: number
}

/** Schemastery validation for {@link Config}. */
export const Config: z<Config> = z.object({
  maxQueued: z.number().default(16),
})

/** One live watcher's inbox: pushed requests, and the wait a generator parks on. */
class Inbox {
  private readonly items: SidebarOpenRequest[] = []
  private wake: (() => void) | undefined
  private closed = false

  /**
   * @param request - the next request for the watcher.
   */
  push(request: SidebarOpenRequest): void {
    this.items.push(request)
    this.wake?.()
    this.wake = undefined
  }

  /** Stop delivering: the parked wait resolves empty and later pushes are dropped. */
  close(): void {
    this.closed = true
    this.wake?.()
    this.wake = undefined
  }

  /**
   * The next request, the moment one arrives.
   *
   * A parked wait is released by {@link close}, which a watcher's own abort
   * handler calls, so this adds no listener of its own: one per wait would
   * accumulate on the transport's signal for the whole life of the watch.
   * @returns the request, or undefined once the watcher is closed.
   */
  async next(): Promise<SidebarOpenRequest | undefined> {
    while (this.items.length === 0) {
      if (this.closed) return undefined
      await new Promise<void>((resolve) => {
        this.wake = resolve
      })
    }
    return this.items.shift()
  }
}

/**
 * Per-Session open queues with their attached watchers.
 *
 * One request has one destination: with a watcher attached it is pushed there
 * and forgotten, and with none it waits in the Session's queue until a view
 * attaches. The queue is bounded because a Session nobody is watching must not
 * accumulate requests without end.
 */
export class SidebarOpens extends TypertRemoteService {
  private readonly pending = new Map<SessionId, SidebarOpenRequest[]>()
  private readonly watchers = new Map<SessionId, Inbox>()

  /**
   * @param ctx - owning Host context.
   * @param maxQueued - requests one Session may queue while no view is attached.
   */
  constructor(ctx: Context, private readonly maxQueued: number) {
    super(ctx, 'sidebarOpens')
  }

  /**
   * Deliver one request to the Session's view, or queue it for the next one.
   * @param sessionId - the Session whose Sidebar the request targets.
   * @param request - the resolved request.
   * @returns whether an attached view consumed it now.
   */
  enqueue(sessionId: SessionId, request: SidebarOpenRequest): boolean {
    const watcher = this.watchers.get(sessionId)
    if (watcher !== undefined) {
      watcher.push(request)
      return true
    }
    const queue = this.pending.get(sessionId)
    if (queue === undefined) {
      this.pending.set(sessionId, [request])
      return false
    }
    queue.push(request)
    // The oldest request is the one a stalled viewer has already been told
    // about least often; drop it rather than grow without bound.
    if (queue.length > this.maxQueued) queue.shift()
    return false
  }

  /**
   * Watch one Session's opens: what queued while nothing was attached, then
   * every request as it arrives.
   * @param sessionId - the Session whose Sidebar is watching.
   * @param signal - physical Remote stream cancellation.
   * @returns the queued requests followed by the live ones.
   */
  @Remote({ mode: 'stream' })
  async *watch(sessionId: SessionId, signal: AbortSignal): AsyncIterable<SidebarOpenRequest> {
    const queued = this.pending.get(sessionId) ?? []
    this.pending.delete(sessionId)
    const inbox = new Inbox()
    // A second view for the same Session takes over: the newest watcher is the
    // one the user is looking at.
    this.watchers.get(sessionId)?.close()
    this.watchers.set(sessionId, inbox)
    const release = (): void => {
      if (this.watchers.get(sessionId) === inbox) this.watchers.delete(sessionId)
      inbox.close()
    }
    signal.addEventListener('abort', release, { once: true })
    try {
      for (const request of queued) {
        if (signal.aborted) return
        yield request
      }
      while (!signal.aborted) {
        const request = await inbox.next()
        if (request === undefined) return
        yield request
      }
    } finally {
      signal.removeEventListener('abort', release)
      release()
    }
  }

  /**
   * Drop every queue, for a Host that is going away.
   */
  dispose(): void {
    this.pending.clear()
    for (const inbox of this.watchers.values()) inbox.close()
    this.watchers.clear()
  }
}

/** The exact http(s) URL a request may open. */
function pageUrl(value: string): string | undefined {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return undefined
  }
  return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : undefined
}

/**
 * Register the `sidebar_open` tool and its delivery service.
 * @param ctx - Host context with the tool registry and the filesystem.
 * @param config - validated queue bound.
 */
export function apply(ctx: Context, config: Config): void {
  if (!Number.isSafeInteger(config.maxQueued) || config.maxQueued < 1) {
    throw new Error('sidebar-opens requires a positive integer maxQueued')
  }
  const opens = new SidebarOpens(ctx, config.maxQueued)
  ctx.effect(() => () => { opens.dispose() }, 'sidebar-opens: queues')
  ctx.tools.register(defineTool({
    name: 'sidebar_open',
    description: 'Open one file or one http(s) page in the Sidebar the user is viewing this Session in. '
      + 'Use it when the user asked to see something: a file you produced, a file worth reading beside the conversation, '
      + 'or a page you found. Pass exactly one of `path` (a file that already exists) or `url`. '
      + 'The file opens in the document preview and the page in the built-in browser; both appear beside the conversation '
      + 'rather than leaving the application.',
    parameters: {
      path: {
        type: 'string',
        description: 'Path of an existing regular file, relative to the Session working directory or absolute.',
      },
      url: {
        type: 'string',
        description: 'An http:// or https:// page to open in the built-in browser.',
      },
    },
    output: {
      schema: {
        type: 'object', additionalProperties: false,
        properties: {
          kind: { type: 'string', required: true, enum: ['file', 'url'] },
          target: { type: 'string', required: true },
          title: { type: 'string', required: true },
          delivered: { type: 'boolean', required: true },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: value.delivered
          ? `Opened ${value.target} in the sidebar.`
          : `Queued ${value.target} to open in the sidebar as soon as that Session's sidebar is shown.`,
      }],
    },
    async execute(args, exec) {
      if (exec.agent === undefined) throw new Error('sidebar_open requires an initiating agent')
      const hasPath = args.path !== undefined && args.path.trim().length > 0
      const hasUrl = args.url !== undefined && args.url.trim().length > 0
      if (hasPath === hasUrl) throw new Error('sidebar_open requires exactly one of path or url')
      const session = exec.agent.session
      const request = hasUrl
        ? urlRequest(args.url as string)
        : await fileRequest(ctx, exec.signal, session.header.cwd, args.path as string)
      // The host-minted identity stays internal: the model is told what it
      // asked for, not how the browser will dedupe it.
      return {
        kind: request.kind, target: request.target, title: request.title,
        delivered: opens.enqueue(session.id, request),
      }
    },
  }))
}

/**
 * One page request from the model's URL.
 * @param value - the URL as the model wrote it.
 * @returns the request to deliver.
 * @throws when the URL is malformed or is not http(s).
 */
function urlRequest(value: string): SidebarOpenRequest {
  const target = pageUrl(value)
  if (target === undefined) throw new Error('sidebar_open only opens http:// and https:// URLs; pass a path for a local file')
  return { id: randomUUID(), kind: 'url', target, title: new URL(target).host }
}

/**
 * One file request, verified through the Session filesystem before it is made
 * so the browser never opens a path that does not resolve.
 * @param ctx - Host context carrying the filesystem.
 * @param signal - tool cancellation.
 * @param cwd - the Session working directory relative paths resolve against.
 * @param value - the path as the model wrote it.
 * @returns the request to deliver.
 * @throws when the path does not name a regular file.
 */
async function fileRequest(
  ctx: Context,
  signal: AbortSignal,
  cwd: string | undefined,
  value: string,
): Promise<SidebarOpenRequest> {
  signal.throwIfAborted()
  const target = await ctx.fs.resolve(value, { ...cwd === undefined ? {} : { cwd }, signal })
  const info = await ctx.fs.stat(target, signal)
  if (info === undefined) throw new Error(`Cannot open ${value}: file not found. Check the path and retry.`)
  if (info.type !== 'file') throw new Error(`Cannot open ${value}: not a regular file`)
  signal.throwIfAborted()
  const path = ctx.fs.processPath(target)
  return { id: randomUUID(), kind: 'file', target: path, title: basename(path) }
}
