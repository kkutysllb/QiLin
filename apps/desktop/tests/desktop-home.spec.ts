/** The Desktop must not share a Web deployment's Harness home. */

import { describe, expect, it } from 'vitest'
import { adoptDesktopHome } from '../src/desktop-home.ts'

describe('desktop home adoption', () => {
  it('points the Harness at the application data directory when nothing names a home', () => {
    const environment: NodeJS.ProcessEnv = {}
    adoptDesktopHome('/Users/example/Library/Application Support/QiLin Desktop', environment)
    expect(environment.QILIN_HOME).toBe('/Users/example/Library/Application Support/QiLin Desktop')
    expect(environment.QILIN_HOME).not.toContain('.qilin')
  })

  it('keeps a home the environment already names', () => {
    const environment: NodeJS.ProcessEnv = { QILIN_HOME: '/tmp/shared-home' }
    adoptDesktopHome('/data/app', environment)
    expect(environment.QILIN_HOME).toBe('/tmp/shared-home')
  })

  it('treats an empty value as unset', () => {
    const environment: NodeJS.ProcessEnv = { QILIN_HOME: '' }
    adoptDesktopHome('/data/app', environment)
    expect(environment.QILIN_HOME).toBe('/data/app')
  })
})
