// @vitest-environment jsdom
/**
 * The markdown preview's raw-HTML pass: what survives sanitization, what can
 * never reach the DOM, and how the wrapper and local media come out.
 */
import { describe, expect, it, vi } from 'vitest'
import { opensWithBlockTag, renderableMarkdownHtml, sanitizeMarkdownHtml } from '../src/client/markdown/sanitize-html.ts'

/** The preview's own resolver, standing in for the authenticated file route. */
const resolve = (destination: string): string | undefined =>
  destination.startsWith('local/') ? `/api/file?path=${encodeURIComponent(destination)}` : undefined

describe('markdown html — scanning the opening tag', () => {
  it('reports a block-level opening tag', () => {
    expect(opensWithBlockTag('<div align="center">')).toBe(true)
    expect(opensWithBlockTag('  <details>')).toBe(true)
    expect(opensWithBlockTag('<TABLE>')).toBe(true)
  })

  it('reports anything else as phrasing-level', () => {
    expect(opensWithBlockTag('<br/>')).toBe(false)
    expect(opensWithBlockTag('<sub>x</sub>')).toBe(false)
    expect(opensWithBlockTag('text <b>bold</b>')).toBe(false)
  })

  it('reports a comment and a closing tag as phrasing-level', () => {
    expect(opensWithBlockTag('<!-- note --><span>x</span>')).toBe(false)
    expect(opensWithBlockTag('</div>')).toBe(false)
  })
})

describe('markdown html — what may be rendered', () => {
  it('accepts a complete block-level run', () => {
    expect(renderableMarkdownHtml('<div class="note">text</div>')).toBe(true)
    expect(renderableMarkdownHtml('<details><summary>a</summary>b</details>')).toBe(true)
  })

  it('refuses an inline run whose closing tag the parse hands over separately', () => {
    expect(renderableMarkdownHtml('<sub>')).toBe(false)
    expect(renderableMarkdownHtml('<br/>')).toBe(false)
  })

  it('refuses a block opening that closes in another run', () => {
    expect(renderableMarkdownHtml('<div class="note">')).toBe(false)
    expect(renderableMarkdownHtml('<details>')).toBe(false)
  })
})

describe('markdown html — sanitization', () => {
  it('refuses active content and its event handlers', () => {
    const html = sanitizeMarkdownHtml(
      '<img src="x" onerror="alert(1)"><script>alert(2)</script><iframe src="https://evil.test"></iframe>',
      resolve,
    )
    expect(html).not.toContain('onerror')
    expect(html).not.toContain('<script')
    expect(html).not.toContain('<iframe')
  })

  it('refuses form chrome and document-level elements', () => {
    const html = sanitizeMarkdownHtml(
      '<form action="/x"><input value="1"><button>go</button></form><base href="https://evil.test"><meta http-equiv="refresh" content="0">',
      resolve,
    )
    expect(html).not.toContain('<form')
    expect(html).not.toContain('<input')
    expect(html).not.toContain('<button')
    expect(html).not.toContain('<base')
    expect(html).not.toContain('<meta')
  })

  it('refuses an inline event handler on an element it keeps', () => {
    const html = sanitizeMarkdownHtml('<p onclick="alert(1)">text</p>', resolve)
    expect(html).toBe('<p>text</p>')
  })

  it('keeps inert markup', () => {
    const html = sanitizeMarkdownHtml('<div class="note"><b>bold</b> and <em>italic</em></div>', resolve)
    expect(html).toBe('<div class="note"><b>bold</b> and <em>italic</em></div>')
  })

  it('reports an empty run when nothing survives', () => {
    expect(sanitizeMarkdownHtml('<script>alert(1)</script>', resolve)).toBe('')
  })
})

describe('markdown html — hardening', () => {
  it('forces anchors to open in a new tab without an opener', () => {
    const html = sanitizeMarkdownHtml('<a href="https://example.test">link</a>', resolve)
    expect(html).toContain('target="_blank"')
    expect(html).toContain('rel="noopener noreferrer"')
  })

  it('rewrites a local media source through the resolver', () => {
    const html = sanitizeMarkdownHtml('<img src="local/pic.png">', resolve)
    expect(html).toContain('/api/file?path=local%2Fpic.png')
  })

  it('drops a source the resolver refuses', () => {
    const html = sanitizeMarkdownHtml('<img src="https://remote.test/pic.png" alt="pic">', resolve)
    expect(html).not.toContain('src=')
    expect(html).toContain('alt="pic"')
  })

  it('leaves an image without a source alone', () => {
    const html = sanitizeMarkdownHtml('<img alt="bare">', resolve)
    expect(html).toBe('<img alt="bare">')
  })

  it('asks the resolver for every image source', () => {
    const resolver = vi.fn(resolve)
    sanitizeMarkdownHtml('<img src="local/a.png"><img src="local/b.png">', resolver)
    expect(resolver.mock.calls.map(call => call[0])).toEqual(['local/a.png', 'local/b.png'])
  })
})
