/** Locks the v1 token scale and its measured contrast so a palette edit is deliberate. */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const styles = new URL('../src/styles/', import.meta.url)
const base = readFileSync(new URL('base.css', styles), 'utf8')
const platform = readFileSync(new URL('design-platform.css', styles), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//gu, '')

type Rgb = readonly [number, number, number]

/** Custom-property declarations of every block whose selector is one of `selectors`. */
function declarationsOf(css: string, selectors: readonly string[]): Map<string, string> {
  const wanted = new Set(selectors)
  const declarations = new Map<string, string>()
  for (const block of css.matchAll(/((?:(?!\{)[^{}])+)\{([^{}]*)\}/gu)) {
    const selector = block[1]!.trim()
    if (!wanted.has(selector)) continue
    for (const declaration of block[2]!.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/gu)) {
      declarations.set(declaration[1]!, declaration[2]!.trim())
    }
  }
  return declarations
}

function parseColor(value: string): Rgb {
  const triple = /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/u.exec(value)
  if (triple === null) throw new Error(`not a colour: ${value}`)
  return [Number(triple[1]), Number(triple[2]), Number(triple[3])]
}

function resolve(name: string, scope: Map<string, string>, seen = 0): string {
  const value = scope.get(name)
  if (value === undefined) throw new Error(`missing token ${name}`)
  if (seen > 12) throw new Error(`var cycle at ${name}`)
  const reference = /^var\((--[\w-]+)(?:,\s*(.*))?\)$/u.exec(value.trim())
  if (reference === null) return value
  const target = reference[1]!
  if (scope.has(target)) return resolve(target, scope, seen + 1)
  if (reference[2] !== undefined) return resolve(reference[2]!.trim(), scope, seen + 1)
  throw new Error(`missing token ${target}`)
}

function luminance([r, g, b]: Rgb): number {
  const channel = (value: number): number => {
    const v = value / 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

function contrast(foreground: Rgb, background: Rgb): number {
  const first = luminance(foreground)
  const second = luminance(background)
  const high = Math.max(first, second)
  const low = Math.min(first, second)
  return (high + 0.05) / (low + 0.05)
}

const light = declarationsOf(platform, ['body'])
const dark = declarationsOf(platform, ['body[data-ds-dark-theme]'])

function contrastOf(scope: Map<string, string>, token: string): number {
  return contrast(parseColor(resolve(token, scope)), parseColor(resolve('--qilin-alias-bg-base', scope)))
}

describe('v1 accent contrast', () => {
  it('keeps the light accent readable on the paper base', () => {
    expect(parseColor(resolve('--qilin-alias-accent', light))).toEqual([37, 99, 235])
    expect(contrastOf(light, '--qilin-alias-accent')).toBeGreaterThanOrEqual(4.5)
    expect(contrastOf(light, '--qilin-alias-accent-hover')).toBeGreaterThanOrEqual(4.5)
  })

  it('keeps the dark accent readable on the dark base', () => {
    expect(parseColor(resolve('--qilin-alias-accent', dark))).toEqual([124, 155, 255])
    expect(contrastOf(dark, '--qilin-alias-accent')).toBeGreaterThanOrEqual(4.5)
    expect(contrastOf(dark, '--qilin-alias-accent-hover')).toBeGreaterThanOrEqual(4.5)
  })

  it('routes the shared business state through the accent', () => {
    expect(light.get('--qilin-alias-state-business-primary')).toBe('var(--qilin-alias-accent)')
    expect(dark.get('--qilin-alias-state-business-primary')).toBe('var(--qilin-alias-accent)')
  })
})

describe('v1 scale', () => {
  it('declares the spacing, type, and radius scales', () => {
    for (const step of [1, 2, 3, 4, 5, 6, 7, 8]) expect(base).toContain(`--qilin-space-${step}:`)
    for (const token of ['xs', 'sm', 'base', 'md', 'lg', 'xl', '2xl']) expect(base).toContain(`--qilin-text-${token}:`)
    expect(base).toContain('--qilin-radius-md: 10px;')
    expect(base).toContain('--qilin-radius-panel: 20px;')
    expect(base).toContain('--qilin-radius-pill: 999px;')
  })

  it('declares all three density levels', () => {
    for (const level of ['compact', 'standard', 'comfortable']) {
      expect(base).toContain(`body[data-qilin-density='${level}'] {`)
    }
  })
})
