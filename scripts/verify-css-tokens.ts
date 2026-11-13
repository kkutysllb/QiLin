/**
 * Reject raw colour, spacing, type-size, and radius literals in migrated client
 * stylesheets. The v1 batch order marks a package as migrated; from then on it
 * must express those properties through `--qilin-*` tokens so the visual scale
 * stays one source of truth.
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

/** Repository root resolved from this script's location. */
export const DEFAULT_ROOT = resolve(import.meta.dirname, '..')

/**
 * Client packages that adopted the v1 token scale. The list only grows: a
 * package enters when its batch lands and never leaves.
 */
export const MIGRATED_CLIENT_PACKAGES: readonly string[] = [
  // V1 migrates ui-chat, ui-conversation, and ui-settings-general; the list is
  // still empty while V0 lands the gate itself.
]

/** One declaration that bypasses the token scale. */
export interface CssLiteralViolation {
  /** Repository-relative stylesheet path with `/` separators. */
  readonly file: string
  /** 1-based declaration line. */
  readonly line: number
  /** Lower-case CSS property. */
  readonly property: string
  /** Declared value. */
  readonly value: string
  /** Which scale the literal bypasses. */
  readonly kind: 'color' | 'font-size' | 'spacing' | 'radius'
}

const COLOR_PATTERN = /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|color|oklch|lab|lch)\(/iu
const LENGTH_PATTERN = /(?<![\w-])([0-9]*\.?[0-9]+)px(?![\w-])/u
const SPACING_PROPERTIES = new Set([
  'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
  'gap', 'row-gap', 'column-gap',
])
/** Gradients and masks legitimately mix stops; their colours still belong to a scale when the file migrates. */
const GRADIENT_PROPERTIES = new Set(['background-image', 'mask-image', 'border-image'])
const COLORLESS = /^(?:none|transparent|currentcolor|inherit|initial|unset|revert)$/iu

/**
 * Find every literal declaration in one stylesheet source.
 * @param source - complete stylesheet text.
 * @param file - repository-relative path reported with each violation.
 * @returns violations in source order.
 */
export function findCssLiteralViolations(source: string, file: string): CssLiteralViolation[] {
  const violations: CssLiteralViolation[] = []
  const lines = source.split('\n')
  let depth = 0
  for (const [index, raw] of lines.entries()) {
    const line = raw.replace(/\/\*.*?\*\//gu, '')
    if (line.includes('}')) depth = Math.max(0, depth - (line.match(/\}/gu)?.length ?? 0))
    if (depth === 0 && !line.includes(':')) {
      depth += (line.match(/\{/gu)?.length ?? 0) - (line.match(/\}/gu)?.length ?? 0)
      continue
    }
    const match = /^\s*(--[\w-]+|[a-z-]+)\s*:\s*(.+?);?\s*$/iu.exec(line)
    depth += (line.match(/\{/gu)?.length ?? 0) - (line.match(/\}/gu)?.length ?? 0)
    if (match === null) continue
    const property = (match[1] ?? '').toLowerCase()
    if (property === '' || property.startsWith('--')) continue
    const value = (match[2] ?? '').trim()
    if (COLORLESS.test(value)) continue
    if (COLOR_PATTERN.test(value) && !GRADIENT_PROPERTIES.has(property)) {
      violations.push({ file, line: index + 1, property, value, kind: 'color' })
      continue
    }
    if (property === 'font-size' && LENGTH_PATTERN.test(value)) {
      violations.push({ file, line: index + 1, property, value, kind: 'font-size' })
      continue
    }
    if (property === 'border-radius' && LENGTH_PATTERN.test(value)) {
      violations.push({ file, line: index + 1, property, value, kind: 'radius' })
      continue
    }
    if (SPACING_PROPERTIES.has(property)) {
      const literal = LENGTH_PATTERN.exec(value)
      if (literal !== null && Number(literal[1]) !== 0) {
        violations.push({ file, line: index + 1, property, value, kind: 'spacing' })
      }
    }
  }
  return violations
}

/** Every stylesheet under one package directory. */
function stylesheets(root: string, directory: string): string[] {
  const found: string[] = []
  if (!existsSync(directory)) return found
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry)
    const stat = statSync(path)
    if (stat.isDirectory()) {
      if (entry === 'node_modules' || entry === 'lib') continue
      found.push(...stylesheets(root, path))
      continue
    }
    if (entry.endsWith('.module.css') || entry.endsWith('.css')) found.push(path)
  }
  return found
}

/**
 * Scan every migrated package.
 * @param root - repository root.
 * @param packages - migrated client package directory names.
 * @returns violations across all migrated packages.
 */
export function auditMigratedPackages(
  root: string = DEFAULT_ROOT,
  packages: readonly string[] = MIGRATED_CLIENT_PACKAGES,
): CssLiteralViolation[] {
  const violations: CssLiteralViolation[] = []
  for (const name of packages) {
    const directory = join(root, 'packages', 'client', name)
    if (!existsSync(directory)) throw new Error(`verify-css-tokens: migrated package "${name}" does not exist`)
    for (const file of stylesheets(root, directory)) {
      const relativePath = relative(root, file).split('\\').join('/')
      violations.push(...findCssLiteralViolations(readFileSync(file, 'utf8'), relativePath))
    }
  }
  return violations
}

/**
 * Run the gate and report a human-readable summary.
 * @param root - repository root.
 * @param packages - migrated packages, defaulting to the tracked list.
 * @returns the summary line.
 */
export function runVerifyCssTokens(
  root: string = DEFAULT_ROOT,
  packages: readonly string[] = MIGRATED_CLIENT_PACKAGES,
): string {
  const violations = auditMigratedPackages(root, packages)
  if (violations.length === 0) {
    return `verify-css-tokens: ${packages.length} migrated package(s) clean`
  }
  const detail = violations
    .map(item => `  ${item.file}:${item.line} ${item.property}: ${item.value} (${item.kind})`)
    .join('\n')
  throw new Error(`verify-css-tokens: ${violations.length} raw literal(s) in migrated packages:\n${detail}`)
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === import.meta.filename) {
  try {
    console.log(runVerifyCssTokens())
  } catch (error: unknown) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
