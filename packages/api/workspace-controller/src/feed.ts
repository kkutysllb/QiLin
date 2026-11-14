/** Reconnect-safe Workspace baseline and increment producer. */

import type { Context } from '@qilin-agent/kylin'
import type { SessionId } from '@qilin-agent/session'
import { Deque } from '@qilin-agent/deque'
import type { DomainChanged } from '@qilin-agent/storage-domain'
import type { Workspace, WorkspaceRecord } from '@qilin-agent/workspace'
import {
  workspaceDomainState,
  workspaceRecord,
  WorkspaceId,
} from '@qilin-agent/workspace'
import { WorkspaceKinds } from './kinds.ts'
import type {
  WorkspaceBaseline,
  WorkspaceDirectoryKind,
  WorkspaceFollowFrame,
  WorkspaceView,
} from './types.ts'

/**
 * Project one authoritative Workspace entity into its Remote value.
 * @param workspace - authoritative registry entity.
 * @param kind - Git classification of the Workspace directory.
 * @returns detached Workspace projection for Remote consumers.
 */
export function workspaceView(workspace: Workspace, kind: WorkspaceDirectoryKind): WorkspaceView {
  return {
    workspaceId: workspace.id,
    path: workspace.path,
    kind,
    title: workspace.title,
    sessionIds: [...workspace.sessionIds],
    createdAt: workspace.createdAt,
    updatedAt: workspace.updatedAt,
  }
}

/**
 * Project one committed Workspace record into its Remote value. A changed row
 * comes from the committed payload rather than a registry re-read: the domain
 * event fires before the entity's in-memory mutation settles.
 * @param workspaceId - committed Workspace identity.
 * @param value - the committed durable record.
 * @param kind - Git classification of the Workspace directory.
 * @returns detached Workspace projection for Remote consumers.
 */
function changedWorkspaceView(
  workspaceId: string,
  value: unknown,
  kind: WorkspaceDirectoryKind,
): WorkspaceView {
  const record: WorkspaceRecord = workspaceRecord.parse(value)
  return {
    workspaceId: WorkspaceId(workspaceId),
    path: record.path,
    kind,
    title: record.title,
    sessionIds: [...record.sessionIds],
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  }
}

/**
 * One frame the domain change asks the feed to publish. A row frame names the
 * Workspace and reads it at publication; a set frame publishes the set current
 * at its turn.
 */
type PlannedFrame =
  | { readonly kind: 'upsert'; readonly workspaceId: string; readonly value?: unknown }
  | { readonly kind: 'remove'; readonly workspaceId: string }
  | { readonly kind: 'order' | 'archived' | 'pinned' }

/** Owns Workspace domain observation and all active follow generations. */
export class WorkspaceFeed {
  private readonly followers = new Set<WorkspaceFollower>()
  private knownIds: Set<string>
  private order: readonly WorkspaceId[]
  private archived: readonly SessionId[]
  private pinned: readonly SessionId[]
  /** Tail of the ordered publication chain (see {@link changed}). */
  private publication: Promise<void> = Promise.resolve()
  private readonly kinds: WorkspaceKinds

  /**
   * @param ctx - Host context containing the authoritative Workspace registry.
   * @param kinds - directory classification shared with the command echoes.
   */
  constructor(private readonly ctx: Context, kinds: WorkspaceKinds) {
    this.kinds = kinds
    const baseline = ctx.workspaceRegistry.list()
    this.knownIds = new Set(baseline.map(workspace => String(workspace.id)))
    this.order = baseline.map(workspace => workspace.id)
    this.archived = [...ctx.workspaceRegistry.archivedSessionIds]
    this.pinned = [...ctx.workspaceRegistry.pinnedSessionIds]
    ctx.on('domain/changed', (change: DomainChanged) => { this.changed(change) })
    ctx.effect(() => () => {
      for (const follower of this.followers) follower.close()
      this.followers.clear()
    }, 'workspace-controller.feed')
  }

  /**
   * Read the complete current projection, classifying every directory first so
   * a browser can group the projects it receives in one pass.
   * @param signal - optional cancellation for the directory classification.
   * @returns all active Workspaces, archived Session identities, and the pin set.
   */
  async baseline(signal?: AbortSignal): Promise<WorkspaceBaseline> {
    const workspaces = this.ctx.workspaceRegistry.list()
    await this.kinds.resolveAll(workspaces.map(workspace => workspace.path), signal)
    return {
      items: workspaces.map(workspace => workspaceView(workspace, this.kinds.kindOf(workspace.path) ?? 'directory')),
      archivedSessionIds: [...this.ctx.workspaceRegistry.archivedSessionIds],
      pinnedSessionIds: [...this.ctx.workspaceRegistry.pinnedSessionIds],
    }
  }

  /**
   * Open one generation beginning with a complete baseline.
   * @param signal - generation cancellation.
   * @returns baseline followed by ordered Workspace increments.
   */
  async *follow(signal: AbortSignal): AsyncIterable<WorkspaceFollowFrame> {
    signal.throwIfAborted()
    const follower = new WorkspaceFollower()
    this.followers.add(follower)
    try {
      yield { type: 'baseline', value: await this.baseline() }
      yield* follower.read(signal)
    } finally {
      this.followers.delete(follower)
      follower.close()
    }
  }

  private changed(change: DomainChanged): void {
    if (change.domain !== 'workspace') return
    const plan = this.plan(change)
    if (plan === undefined) return
    // Classifying a new directory is asynchronous, so publication is chained:
    // every follower still sees the frames in the order the domain committed
    // them, and each frame publishes the state current at its turn.
    this.publication = this.publication
      .then(async () => { await this.publishPlanned(plan) })
      .catch((error: unknown) => {
        this.ctx.logger.warn(`workspace-controller: managed Workspace update was dropped: ${String(error)}`)
      })
  }

  /**
   * Validate one domain change and record the frames it publishes. Synchronous:
   * an inconsistent registry reference must fail the domain write here rather
   * than inside the publication chain.
   * @param change - committed domain change.
   * @returns the frame plan, or undefined for an irrelevant change.
   */
  private plan(change: DomainChanged): readonly PlannedFrame[] | undefined {
    if (change.table === '') {
      if (change.operation !== 'put') return undefined
      const state = workspaceDomainState.parse(change.value)
      const nextOrder = [...state.workspaceIds]
      const orderChanged = !sameStrings(this.order.map(String), nextOrder.map(String))
      const frames: PlannedFrame[] = []
      for (const id of state.workspaceIds) {
        if (this.knownIds.has(id)) continue
        if (this.ctx.workspaceRegistry.get(id) === undefined) {
          throw new Error(`committed Workspace registry references missing Workspace "${id}"`)
        }
        this.knownIds.add(id)
        frames.push({ kind: 'upsert', workspaceId: id })
      }
      this.order = nextOrder
      if (orderChanged) frames.push({ kind: 'order' })
      const nextArchived = [...state.archivedSessionIds]
      if (!sameStrings(this.archived.map(String), nextArchived.map(String))) {
        this.archived = nextArchived
        frames.push({ kind: 'archived' })
      }
      const nextPinned = [...state.pinnedSessionIds]
      if (!sameStrings(this.pinned.map(String), nextPinned.map(String))) {
        this.pinned = nextPinned
        frames.push({ kind: 'pinned' })
      }
      return frames.length === 0 ? undefined : frames
    }
    if (change.table !== 'workspaces') return undefined
    if (change.operation === 'deleted') {
      if (!this.knownIds.delete(change.key)) return undefined
      return [{ kind: 'remove', workspaceId: change.key }]
    }
    if (!this.knownIds.has(change.key)) return undefined
    return [{ kind: 'upsert', workspaceId: change.key, value: change.value }]
  }

  /**
   * Publish one plan in order, reading each frame's state at its turn.
   * @param plan - frames recorded by {@link plan}.
   */
  private async publishPlanned(plan: readonly PlannedFrame[]): Promise<void> {
    for (const frame of plan) {
      switch (frame.kind) {
        case 'upsert': {
          // A Workspace removed while its directory was classified must not
          // reappear as a resurrected row.
          if (!this.knownIds.has(frame.workspaceId)) break
          const workspace = this.ctx.workspaceRegistry.get(WorkspaceId(frame.workspaceId))
          if (workspace === undefined) break
          const path = frame.value === undefined ? workspace.path : workspaceRecord.parse(frame.value).path
          const kind = await this.kinds.resolve(path)
          this.publish({
            type: 'upsert',
            workspace: frame.value === undefined
              ? workspaceView(workspace, kind)
              : changedWorkspaceView(frame.workspaceId, frame.value, kind),
          })
          break
        }
        case 'remove':
          this.publish({ type: 'remove', workspaceId: WorkspaceId(frame.workspaceId) })
          break
        case 'order':
          this.publish({ type: 'order', workspaceIds: [...this.order] })
          break
        case 'archived':
          this.publish({ type: 'archived', archivedSessionIds: [...this.archived] })
          break
        case 'pinned':
          this.publish({ type: 'pinned', pinnedSessionIds: [...this.pinned] })
          break
      }
    }
  }

  private publish(frame: Exclude<WorkspaceFollowFrame, { readonly type: 'baseline' }>): void {
    for (const follower of this.followers) follower.push(frame)
  }
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index])
}

class WorkspaceFollower {
  private readonly frames = new Deque<WorkspaceFollowFrame>()
  private waiting: (() => void) | undefined
  private closed = false

  push(frame: WorkspaceFollowFrame): void {
    /* v8 ignore next -- closed followers are removed before later publication can reach them. */
    if (this.closed) return
    this.frames.pushBack(frame)
    this.waiting?.()
  }

  close(): void {
    if (this.closed) return
    this.closed = true
    this.waiting?.()
  }

  async *read(signal: AbortSignal): AsyncIterable<WorkspaceFollowFrame> {
    while (!this.closed && !signal.aborted) {
      const frame = this.frames.popFront()
      if (frame !== undefined) {
        yield frame
        continue
      }
      await this.wait(signal)
    }
  }

  private wait(signal: AbortSignal): Promise<void> {
    return new Promise((resolve) => {
      const finish = (): void => {
        signal.removeEventListener('abort', finish)
        /* v8 ignore next -- one read owns the sole installed wait callback. */
        if (this.waiting === finish) this.waiting = undefined
        resolve()
      }
      this.waiting = finish
      signal.addEventListener('abort', finish, { once: true })
      /* v8 ignore next -- native signals and the private queue cannot change during this synchronous setup. */
      if (signal.aborted || this.closed || this.frames.size > 0) finish()
    })
  }
}
