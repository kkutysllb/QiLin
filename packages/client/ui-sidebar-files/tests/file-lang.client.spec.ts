/** Every branch of the language map, one extension group at a time. */
import { describe, expect, it } from 'vitest'
import { langForPath } from '../src/client/file-lang.ts'

const MAPPED = [
  'a.js', 'a.mjs', 'a.cjs', 'a.jsx', 'a.ts', 'a.mts', 'a.cts', 'a.tsx',
  'a.json', 'a.jsonc', 'a.json5',
  'a.md', 'a.markdown', 'a.mdx',
  'a.py', 'a.pyi', 'a.pyw',
  'a.css', 'a.scss', 'a.sass', 'a.less',
  'a.html', 'a.htm',
  'a.rs', 'a.java',
  'a.c', 'a.h', 'a.cpp', 'a.cc', 'a.cxx', 'a.hpp', 'a.hh', 'a.hxx',
  'a.sql',
  'a.xml', 'a.xsl', 'a.xslt', 'a.xsd', 'a.dtd', 'a.plist',
  'a.yaml', 'a.yml',
  'a.sh', 'a.bash', 'a.zsh', 'a.fish', 'a.ksh', 'a.csh',
  'a.ps1', 'a.psd1', 'a.psm1',
  'a.toml', 'a.go', 'a.rb', 'a.pl', 'a.pm', 'a.lua', 'a.r', 'a.swift',
  'a.cmake', 'a.mk', 'a.ini', 'a.cfg', 'a.conf', 'a.properties', '.env', 'b.env',
  'a.diff', 'a.patch',
]

describe('langForPath', () => {
  it('maps every installed grammar and legacy mode', () => {
    for (const path of MAPPED) expect(langForPath(path), path).toBeDefined()
  })

  it('leaves unknown and extension-less paths as plain text', () => {
    expect(langForPath('a.vue')).toBeUndefined()
    expect(langForPath('Dockerfile')).toBeUndefined()
    expect(langForPath('a.txt')).toBeUndefined()
  })
})
