/** The Desktop must not share a Web deployment's Harness home. */

import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { resolveQilinDesktopHome } from '@qilin-agent/home-paths'
import { adoptDesktopHome } from '../src/desktop-home.ts'

describe('desktop home adoption', () => {
  it('names ~/.qilin-desktop when nothing overrides it', () => {
    const environment: NodeJS.ProcessEnv = {}
    adoptDesktopHome(environment)
    expect(environment.QILIN_HOME).toBe(resolveQilinDesktopHome(undefined, {}))
    expect(environment.QILIN_HOME).toContain('.qilin-desktop')
  })

  it('overrides a Web deployment home inherited from the shell', () => {
    const environment: NodeJS.ProcessEnv = { QILIN_HOME: '/Users/example/.qilin' }
    adoptDesktopHome(environment)
    expect(environment.QILIN_HOME).toBe(resolveQilinDesktopHome(undefined, {}))
    expect(environment.QILIN_HOME).not.toBe('/Users/example/.qilin')
  })

  it('honors the Desktop home override', () => {
    const environment: NodeJS.ProcessEnv = { QILIN_DESKTOP_HOME: '/srv/desktop-home' }
    adoptDesktopHome(environment)
    // The override is normalized to a platform-absolute path (a POSIX fixture
    // resolves to a drive-qualified path on Windows).
    expect(environment.QILIN_HOME).toBe(resolve('/srv/desktop-home'))
  })
})
