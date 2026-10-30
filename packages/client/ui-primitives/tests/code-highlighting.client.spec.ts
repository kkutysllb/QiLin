// @vitest-environment jsdom
import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import {
  CODE_HIGHLIGHT_EXTENSIONS, languageForPath, useCodeHighlighter, type CodeHighlighter,
} from '../src/code-highlighting.ts'

describe('code-highlighting re-exports', () => {
  it('selects a grammar from a filename', () => {
    expect(languageForPath('src/main.ts')).toBe('typescript')
    expect(languageForPath('deploy.ps1')).toBe('powershell')
    expect(languageForPath('README')).toBeUndefined()
  })

  it('exposes every recognized suffix exactly once', () => {
    expect(CODE_HIGHLIGHT_EXTENSIONS).toContain('ts')
    expect(new Set(CODE_HIGHLIGHT_EXTENSIONS).size).toBe(CODE_HIGHLIGHT_EXTENSIONS.length)
  })
})

describe('useCodeHighlighter', () => {
  it('highlights a supported fragment into per-line runs', () => {
    const { result } = renderHook(() => useCodeHighlighter('typescript'))
    const highlight: CodeHighlighter = result.current
    const lines = highlight('const answer: number = 42\nreturn answer')
    expect(lines).toBeDefined()
    expect(lines).toHaveLength(2)
    expect(lines?.[0]?.map(span => span.text).join('')).toBe('const answer: number = 42')
    expect(lines?.[0]?.[0]?.style).toHaveProperty('color')
  })

  it('returns undefined for an unknown language so the caller renders plain text', () => {
    const { result } = renderHook(() => useCodeHighlighter('unknown-language'))
    expect(result.current('plain')).toBeUndefined()
  })

  it('keeps one stable function per language and replaces it on a language change', () => {
    const { result, rerender } = renderHook(({ language }: { language: string }) => useCodeHighlighter(language), {
      initialProps: { language: 'typescript' },
    })
    const first = result.current
    rerender({ language: 'typescript' })
    expect(result.current).toBe(first)
    rerender({ language: 'json' })
    expect(result.current).not.toBe(first)
  })
})
