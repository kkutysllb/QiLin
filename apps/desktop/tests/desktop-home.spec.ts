/** The Desktop must not share a Web deployment's Harness home. */

import { describe, expect, it } from 'vitest'
import { resolveQilinDesktopHome } from '@qilin-agent/home-paths'
import { adoptDesktopHome } from '../src/desktop-home.ts'

describe('desktop home adoption', () => {
  it('points the Harness at ~/.qilin-desktop when nothing names a home', () => {
    const environment: NodeJS.ProcessEnv = {}
    adoptDesktopHome(environment)
    expect(environment.QILIN_HOME).toBe(resolveQilinDesktopHome())
    expect(environment.QILIN_HOME).toContain('.qilin-desktop')
  })

  it('keeps a home the environment already names', () => {
    const environment: NodeJS.ProcessEnv = { QILIN_HOME: '/tmp/shared-home' }
    adoptDesktopHome(environment)
    expect(environment.QILIN_HOME).toBe('/tmp/shared-home')
  })

  it('treats an empty value as unset', () => {
    const environment: NodeJS.ProcessEnv = { QILIN_HOME: '' }
    adoptDesktopHome(environment)
    expect(environment.QILIN_HOME).toBe(resolveQilinDesktopHome())
  })

  it('honors the Desktop home override', () => {
    const environment: NodeJS.ProcessEnv = { QILIN_DESKTOP_HOME: '/srv/desktop-home' }
    adoptDesktopHome(environment)
    expect(environment.QILIN_HOME).toBe('/srv/desktop-home')
  })
})
