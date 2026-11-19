/** Filesystem ownership for the Electron-managed desktop installation. */

import { join } from 'node:path'
import { resolveQilinHome } from '@qilin-agent/home-paths'

/** Stable desktop installation paths under the shared Harness home. */
export interface DesktopPaths {
  readonly profile: string
  readonly lock: string
}

/**
 * Resolve every Electron-owned path without changing the shared data roots.
 * @param profile - Profile the Host boots; a product names its own profile.
 * @param dshHome - Harness home shared with npm-installed qilin.
 * @returns immutable desktop path set.
 */
export function resolveDesktopPaths(profile = 'desktop', dshHome: string = resolveQilinHome()): DesktopPaths {
  return {
    profile: join(dshHome, 'profiles', profile),
    lock: join(dshHome, 'profiles', profile, 'lock'),
  }
}
