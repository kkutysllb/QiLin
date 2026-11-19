/** The Desktop must not share a Web deployment's Harness home. */

import { describe, expect, it } from 'vitest'
import { resolveQilinDesktopHome } from '@qilin-agent/home-paths'
import { adoptDesktopHome } from '../src/desktop-home.ts'

describe('desktop home adoption', () => {
  it('names ~/.ktoon when nothing overrides it', () => {
    const environment: NodeJS.ProcessEnv = {}
    adoptDesktopHome(environment)
    expect(environment.QILIN_HOME).toBe(resolveQilinDesktopHome(undefined, {}))
    expect(environment.QILIN_HOME).toContain('.ktoon')
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
    expect(environment.QILIN_HOME).toBe('/srv/desktop-home')
  })
})
