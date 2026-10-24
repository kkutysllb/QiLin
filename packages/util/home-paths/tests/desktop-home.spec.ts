import { homedir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { defaultQilinDesktopHome, resolveQilinDesktopHome } from '../src/index.ts'

describe('resolveQilinDesktopHome', () => {
  it('resolves the ~/.ktoon default', () => {
    expect(defaultQilinDesktopHome()).toBe(join(homedir(), '.ktoon'))
    expect(resolveQilinDesktopHome(undefined, {})).toBe(defaultQilinDesktopHome())
  })

  it('reads the desktop env override and prefers the explicit configured path', () => {
    expect(resolveQilinDesktopHome(undefined, { QILIN_DESKTOP_HOME: '/tmp/desktop-home' })).toBe('/tmp/desktop-home')
    expect(resolveQilinDesktopHome('/tmp/explicit', { QILIN_DESKTOP_HOME: '/tmp/desktop-home' })).toBe('/tmp/explicit')
  })

  it('treats a blank override as unset', () => {
    expect(resolveQilinDesktopHome(undefined, { QILIN_DESKTOP_HOME: '   ' })).toBe(defaultQilinDesktopHome())
  })
})
