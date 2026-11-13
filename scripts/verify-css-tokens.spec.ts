import { describe, expect, it } from 'vitest'
import { auditMigratedPackages, findCssLiteralViolations, MIGRATED_CLIENT_PACKAGES } from './verify-css-tokens.ts'

function kinds(source: string): string[] {
  return findCssLiteralViolations(source, 'sample.module.css').map(item => `${item.kind}:${item.property}`)
}

describe('findCssLiteralViolations', () => {
  it('flags a raw colour, type size, spacing, and radius', () => {
    const source = [
      '.a {',
      '  color: #fff;',
      '  background: rgba(0, 0, 0, 0.2);',
      '  font-size: 12px;',
      '  padding: 8px 12px;',
      '  border-radius: 6px;',
      '}',
    ].join('\n')
    expect(kinds(source)).toEqual([
      'color:color',
      'color:background',
      'font-size:font-size',
      'spacing:padding',
      'radius:border-radius',
    ])
  })

  it('accepts tokens, keywords, zero lengths, and gradient stops', () => {
    const source = [
      '.a {',
      '  color: var(--qilin-alias-label-primary);',
      '  border-color: currentColor;',
      '  background: transparent;',
      '  font-size: var(--qilin-text-base);',
      '  padding: 0;',
      '  gap: calc(var(--qilin-space-1) * 2);',
      '  border-radius: var(--qilin-radius-md);',
      '  background-image: linear-gradient(rgba(0, 0, 0, 0.4), transparent);',
      '  --local-color: #fff;',
      '}',
    ].join('\n')
    expect(findCssLiteralViolations(source, 'sample.module.css')).toEqual([])
  })

  it('reports 1-based lines and ignores declarations outside a block', () => {
    const source = ['.a {', '  color: #000;', '}'].join('\n')
    expect(findCssLiteralViolations(source, 'f.css')[0]).toMatchObject({ line: 2, file: 'f.css' })
  })
})

describe('migrated package audit', () => {
  it('rejects a migrated package that does not exist', () => {
    expect(() => auditMigratedPackages(undefined, ['not-a-package'])).toThrow('does not exist')
  })

  it('keeps every tracked migrated package on the token scale', () => {
    expect(auditMigratedPackages(undefined, MIGRATED_CLIENT_PACKAGES)).toEqual([])
  })
})
