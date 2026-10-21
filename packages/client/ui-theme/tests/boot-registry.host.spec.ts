/** Host boot registry: skin canvas colors resolved for the pre-plugin index render. */
import { describe, expect, it } from 'vitest'
import { PLATFORM_BOOT_COLORS, ThemeBootRegistry } from '../src/index.ts'

describe('ThemeBootRegistry', () => {
  it('falls back to the platform canvas for an empty or unregistered selection', () => {
    const boot = new ThemeBootRegistry()
    expect(boot.resolve('')).toEqual(PLATFORM_BOOT_COLORS)
    expect(boot.resolve('qilin')).toEqual(PLATFORM_BOOT_COLORS)
  })

  it('registers and resolves one skin, and disposal keeps a later registration', () => {
    const boot = new ThemeBootRegistry()
    const dispose = boot.register('qilin', { light: '#f8f5ee', dark: '#0d0b09' })
    expect(boot.resolve('qilin')).toEqual({ light: '#f8f5ee', dark: '#0d0b09' })
    const replacement = boot.register('qilin', { light: '#fff', dark: '#000' })
    dispose()
    expect(boot.resolve('qilin')).toEqual({ light: '#fff', dark: '#000' })
    replacement()
    expect(boot.resolve('qilin')).toEqual(PLATFORM_BOOT_COLORS)
  })

  it('rejects the empty skin id', () => {
    expect(() => new ThemeBootRegistry().register('', { light: '#fff', dark: '#000' }))
      .toThrow('platform palette')
  })

  it('copies the colors it stores, so caller mutation cannot reach the registry', () => {
    const boot = new ThemeBootRegistry()
    const colors = { light: '#f8f5ee', dark: '#0d0b09' }
    boot.register('qilin', colors)
    colors.light = '#000000'
    expect(boot.resolve('qilin').light).toBe('#f8f5ee')
  })
})
