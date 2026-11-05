// @vitest-environment node
/**
 * Every `var(--token)` reference a client stylesheet leaves without a fallback
 * must resolve. An unresolvable one makes its declaration compute to nothing:
 * the menu material went transparent because its fill and blur tokens were
 * renamed to names no sheet defined, and the same class of defect hides in any
 * ported sheet.
 *
 * Resolution sources, in order: theme sheets, component sheets, tokens client
 * programs inject at runtime, and named vendor sheets. The vendor list is
 * explicit so adding one is a decision; nothing else may silence the gate.
 */
import { expect, it } from 'vitest'
import {
  VENDOR_TOKENS,
  blankComments,
  componentTokens,
  programTokens,
  readClientSources,
  themeTokens,
  unresolvedReferences,
} from './token-resolution.ts'

it('resolves every un-fallbacked token reference in client source', () => {
  const defined = new Set([...themeTokens(), ...componentTokens(), ...programTokens()])
  const missing = unresolvedReferences(readClientSources(['.css', '.tsx']), defined, VENDOR_TOKENS)
  expect(missing.map(({ path, line, token }) => `${path}:${line} ${token}`)).toEqual([])
})

it('names only shipped viewer tokens as vendor-provided', () => {
  expect([...VENDOR_TOKENS]).toEqual(['--min-font-size'])
})

it('rejects a reference nothing defines, even beside a resolved sibling', () => {
  // Reverse verification: the gate must fail on a deliberately broken sheet.
  const files = [{
    path: 'packages/client/example/src/example.module.css',
    text: blankComments('.a { color: var(--qilin-alias-label-primary); background: var(--qilin-not-a-token); }'),
  }]
  expect(unresolvedReferences(files, themeTokens(), VENDOR_TOKENS)).toEqual([
    { path: 'packages/client/example/src/example.module.css', line: 1, token: '--qilin-not-a-token' },
  ])
})

it('keeps a reference that carries a fallback valid', () => {
  const files = [{
    path: 'packages/client/example/src/example.module.css',
    text: blankComments('.a { color: var(--qilin-not-a-token, currentColor); }'),
  }]
  expect(unresolvedReferences(files, themeTokens(), VENDOR_TOKENS)).toEqual([])
})
