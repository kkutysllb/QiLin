import { describe, expect, it } from 'vitest'
import { acceptsPath, extensionOf, TEXT_FILE_EXTENSIONS } from '../src/editable-path.ts'

describe('extensionOf', () => {
  it('reads the lower-case suffix of either separator and of dot files', () => {
    expect(extensionOf('/work/app/a.TS')).toBe('ts')
    expect(extensionOf('C:\\work\\app\\a.PY')).toBe('py')
    expect(extensionOf('/work/app/.env')).toBe('env')
    expect(extensionOf('/work/app/Makefile')).toBe('')
    expect(extensionOf('/work/app/a.')).toBe('')
  })
})

describe('acceptsPath', () => {
  it('takes known text extensions and refuses the rest', () => {
    expect(acceptsPath('src/a.ts')).toBe(true)
    expect(acceptsPath('notes.md')).toBe(true)
    expect(acceptsPath('notes.txt')).toBe(true)
    expect(acceptsPath('logo.png')).toBe(false)
    expect(acceptsPath('paper.pdf')).toBe(false)
    expect(acceptsPath('bin/data')).toBe(false)
  })
})

describe('TEXT_FILE_EXTENSIONS', () => {
  it('holds lower-case extensions without the leading dot', () => {
    for (const extension of TEXT_FILE_EXTENSIONS) {
      expect(extension, extension).toBe(extension.toLowerCase())
      expect(extension.startsWith('.'), extension).toBe(false)
    }
  })
})
