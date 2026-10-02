// @vitest-environment jsdom
/**
 * The terminal's URL scanner and activation rules: what a line turns into,
 * where each range points, which click opens it, and which targets never leave
 * the terminal.
 */
import { describe, expect, it } from 'vitest'
import {
  buildTerminalLinks, findTerminalUrlsInLine, shouldActivateTerminalLink, terminalUrlTarget,
} from '../src/client/terminal-links.ts'

describe('terminal links — scanning a line', () => {
  it('finds every URL in source order', () => {
    expect(findTerminalUrlsInLine('a https://one.test and http://two.test b')).toEqual([
      { start: 2, text: 'https://one.test' },
      { start: 23, text: 'http://two.test' },
    ])
  })

  it('keeps a URL out of the punctuation a shell wraps it in', () => {
    expect(findTerminalUrlsInLine('see "https://example.test/x", or <https://example.test/y>').map(m => m.text))
      .toEqual(['https://example.test/x', 'https://example.test/y'])
  })

  it('keeps the balanced parentheses a URL owns', () => {
    expect(findTerminalUrlsInLine('https://en.test/wiki/Python_(language)').map(m => m.text))
      .toEqual(['https://en.test/wiki/Python_(language)'])
  })

  it('drops the closing parenthesis a wrapper added', () => {
    expect(findTerminalUrlsInLine('(https://example.test/x)').map(m => m.text)).toEqual(['https://example.test/x'])
  })

  it('keeps a URL whose own parentheses are unbalanced', () => {
    expect(findTerminalUrlsInLine('(https://example.test/x(').map(m => m.text)).toEqual(['https://example.test/x('])
  })

  it('ignores a longer word that ends in the scheme', () => {
    expect(findTerminalUrlsInLine('nothttps://example.test')).toEqual([])
  })

  it('reports nothing for a line without a URL', () => {
    expect(findTerminalUrlsInLine('plain output')).toEqual([])
  })

  it('finds the same matches on a repeated scan', () => {
    expect(findTerminalUrlsInLine('https://one.test')).toEqual([{ start: 0, text: 'https://one.test' }])
    expect(findTerminalUrlsInLine('https://one.test')).toEqual([{ start: 0, text: 'https://one.test' }])
  })
})

describe('terminal links — ranges', () => {
  it('turns a match into the inclusive 1-based cell range xterm asks for', () => {
    expect(buildTerminalLinks('see https://example.test/docs now', 7)).toEqual([
      { range: { start: { x: 5, y: 7 }, end: { x: 29, y: 7 } }, text: 'https://example.test/docs' },
    ])
  })

  it('reports no range for a line without a URL', () => {
    expect(buildTerminalLinks('nothing here', 3)).toEqual([])
  })
})

describe('terminal links — activation', () => {
  it('opens only while the open modifier is held', () => {
    expect(shouldActivateTerminalLink(new MouseEvent('click'))).toBe(false)
    expect(shouldActivateTerminalLink(new MouseEvent('click', { ctrlKey: true }))).toBe(true)
    expect(shouldActivateTerminalLink(new MouseEvent('click', { metaKey: true }))).toBe(true)
  })

  it('normalizes an http(s) target', () => {
    expect(terminalUrlTarget('https://example.test/a')).toBe('https://example.test/a')
    expect(terminalUrlTarget('http://example.test')).toBe('http://example.test/')
  })

  it('refuses another scheme', () => {
    expect(terminalUrlTarget('file:///etc/hosts')).toBeUndefined()
    expect(terminalUrlTarget('mailto:someone@example.test')).toBeUndefined()
  })

  it('refuses text that is not a URL', () => {
    expect(terminalUrlTarget('https://')).toBeUndefined()
  })
})
