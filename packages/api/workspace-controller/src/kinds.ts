/**
 * Cached classification of Workspace directories into Git repositories and
 * plain directories.
 * @module @qilin-agent/api-workspace-controller/src/kinds
 */

import { join } from 'node:path'
import { dirname } from 'node:path'
import type { Context } from '@qilin-agent/kylin'
// Type-only: the filesystem service's Context augmentation types `ctx.get('fs')`.
import type {} from '@qilin-agent/fs'
import type { WorkspaceDirectoryKind } from './types.ts'

/** Directory entry that marks a working tree, or a linked checkout and a submodule (a file). */
const GIT_ENTRY = '.git'

/**
 * Classify a Workspace directory without spawning Git: walk from the directory
 * toward the filesystem root and accept the first `.git` entry. A Workspace
 * opened inside a repository therefore counts as a repository even when the
 * checkout's `.git` lives above it, and a linked worktree or submodule counts
 * through its `.git` file. A directory with no `.git` up to the root — and
 * every directory on a Host without a filesystem service — is a plain
 * directory. Answers are cached per path; a failed read of one ancestor cannot
 * prove the checkout marker absent, so that path stays a plain directory.
 */
export class WorkspaceKinds {
  private readonly kinds = new Map<string, WorkspaceDirectoryKind>()
  private readonly inflight = new Map<string, Promise<WorkspaceDirectoryKind>>()

  /** @param ctx - Host context that may provide the filesystem service. */
  constructor(private readonly ctx: Context) {}

  /**
   * Classify one directory, from the cache or with one walk.
   * @param path - canonical Workspace directory.
   * @param signal - optional cancellation for the filesystem reads.
   * @returns the kind; `directory` without a filesystem service.
   */
  async resolve(path: string, signal?: AbortSignal): Promise<WorkspaceDirectoryKind> {
    const known = this.kinds.get(path)
    if (known !== undefined) return known
    const pending = this.inflight.get(path)
    if (pending !== undefined) return await pending
    const probe = this.walk(path, signal)
      .then((kind) => {
        this.kinds.set(path, kind)
        return kind
      })
      .finally(() => { this.inflight.delete(path) })
    this.inflight.set(path, probe)
    return await probe
  }

  /**
   * Classify every given directory, reusing earlier answers.
   * @param paths - canonical Workspace directories.
   * @param signal - optional cancellation for the filesystem reads.
   * @returns completion once every directory is classified.
   */
  async resolveAll(paths: readonly string[], signal?: AbortSignal): Promise<void> {
    await Promise.all(paths.map(async path => await this.resolve(path, signal)))
  }

  /**
   * Cached kind of one directory, without starting a walk.
   * @param path - canonical Workspace directory.
   * @returns the kind, or undefined before the directory is classified.
   */
  kindOf(path: string): WorkspaceDirectoryKind | undefined {
    return this.kinds.get(path)
  }

  private async walk(path: string, signal?: AbortSignal): Promise<WorkspaceDirectoryKind> {
    const fs = this.ctx.get('fs')
    if (fs === undefined) return 'directory'
    let current = path
    for (;;) {
      let marker: unknown
      try {
        marker = await fs.lstat(join(current, GIT_ENTRY), undefined, signal)
      } catch {
        // An unreadable ancestor cannot hold this walk's checkout marker, so it
        // keeps climbing instead of claiming either kind.
        marker = undefined
      }
      if (marker !== undefined) return 'repository'
      const parent = dirname(current)
      if (parent === current) return 'directory'
      current = parent
    }
  }
}
