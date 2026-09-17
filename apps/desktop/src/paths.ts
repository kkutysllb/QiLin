/** Filesystem ownership for the Electron-managed desktop installation. */

import { join } from 'node:path'
import { resolveQilinHome } from '@qilin/home-paths'

/** Stable desktop installation paths under the shared Harness home. */
export interface DesktopPaths {
  readonly profile: string
  readonly lock: string
}

/**
 * Resolve every Electron-owned path without changing the shared data roots.
 * @param qilinHome - Harness home shared with npm-installed qilin.
 * @returns immutable desktop path set.
 */
export function resolveDesktopPaths(qilinHome: string = resolveQilinHome()): DesktopPaths {
  return {
    profile: join(qilinHome, 'profiles', 'desktop'),
    lock: join(qilinHome, 'profiles', 'desktop', 'lock'),
  }
}
