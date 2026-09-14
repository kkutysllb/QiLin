/**
 * The gate and naming decisions: which addresses the `file` type takes, and
 * what it names one. The veto is the whole claim policy — session-scope only,
 * known text and code extensions only — so every arm is asserted here.
 */
import { describe, expect, it } from 'vitest'
import { sessionFileAddress, TEXT_FILE_EXTENSIONS } from '@qilin/util-workspace-path'
import { canOpenFileAddress, fileTabTitle, sessionFileOf } from '../src/client/file-guard.ts'

const ADDRESS = sessionFileAddress('s-1', 'src/app/a.ts')

describe('the editable set against the editor', () => {
  it('carries every language the editor maps', () => {
    for (const extension of ['js', 'json', 'md', 'py', 'css', 'html', 'rs', 'java', 'cpp', 'sql', 'xml', 'yaml', 'sh', 'ps1', 'toml', 'go', 'rb']) {
      expect(TEXT_FILE_EXTENSIONS.has(extension), extension).toBe(true)
    }
  })
})

describe('canOpenFileAddress', () => {
  it('takes session addresses with an editable extension', () => {
    expect(canOpenFileAddress(ADDRESS)).toBe(true)
    expect(canOpenFileAddress(sessionFileAddress('s-1', 'src/readme.md'))).toBe(true)
  })

  it('refuses absolute addresses, unknown extensions, and non-file addresses', () => {
    expect(canOpenFileAddress('qilin-resource://file/absolute/home/ys/a.ts')).toBe(false)
    expect(canOpenFileAddress(sessionFileAddress('s-1', 'logo.png'))).toBe(false)
    expect(canOpenFileAddress(sessionFileAddress('s-1', 'Makefile'))).toBe(false)
    expect(canOpenFileAddress('sidebar://guide')).toBe(false)
  })
})

describe('fileTabTitle', () => {
  it('names the file by its decoded basename', () => {
    expect(fileTabTitle(ADDRESS)).toBe('a.ts')
    expect(fileTabTitle(sessionFileAddress('s-1', 'docs/my notes.md'))).toBe('my notes.md')
    expect(fileTabTitle(sessionFileAddress('s-1', 'C:/x/a.ts'))).toBe('a.ts')
  })

  it('decodes an unparseable address\'s last segment raw when malformed', () => {
    expect(fileTabTitle('qilin-resource://file/session/s-1/a%2zb.ts')).toBe('a%2zb.ts')
  })
})

describe('sessionFileOf', () => {
  it('hands the address\'s session and path to the endpoints', () => {
    expect(sessionFileOf(sessionFileAddress('s-9', '/abs/x.ts'))).toEqual({ sessionId: 's-9', path: '/abs/x.ts' })
  })

  it('throws for an address the gate never accepted', () => {
    expect(() => sessionFileOf('qilin-resource://file/absolute/home/a.ts')).toThrow('not a session file address')
  })
})
