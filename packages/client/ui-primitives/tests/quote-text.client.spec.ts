/**
 * Explicit blockquote recognition: which spans are quotes, what excerpt they
 * decode to, how a named source survives the round trip, and how a selection
 * serializes back into message text.
 */
import { describe, expect, it } from 'vitest'
import {
  QUOTE_WIRE_SCHEME, messageQuoteRanges, quoteBlockTextOf, quoteInsertionOf, quoteTextOf, quotedExcerptOf,
} from '../src/quote-text.ts'

const spans = (text: string): string[] =>
  messageQuoteRanges(text).map(range => text.slice(range.start, range.end))

describe('messageQuoteRanges', () => {
  it('returns each consecutive marked run as one span, without its trailing line break', () => {
    const text = '前情\n> 第一行\n> 第二行\n\n收尾'
    expect(spans(text)).toEqual(['> 第一行\n> 第二行'])
  })

  it('ignores inline greater-than signs and does not run past a blank line', () => {
    expect(spans('a > b 不是引用')).toEqual([])
    expect(spans('> 一\n\n> 二')).toEqual(['> 一', '> 二'])
  })

  it('accepts up to three leading spaces and skips blank quote runs', () => {
    expect(spans('   > 缩进引用')).toEqual(['   > 缩进引用'])
    expect(spans('>   ')).toEqual([])
  })
})

describe('quoteTextOf', () => {
  it('removes one marker per line and normalizes CRLF', () => {
    expect(quoteTextOf('> a\r\n>  b\r\n>\tc')).toBe('a\n b\nc')
  })

  it('leaves text without a marker untouched', () => {
    expect(quoteTextOf('plain')).toBe('plain')
  })
})

describe('quotedExcerptOf', () => {
  it('returns the whole decoded block when no source line is present', () => {
    expect(quotedExcerptOf('第一行\n第二行')).toEqual({ text: '第一行\n第二行', source: undefined })
  })

  it('consumes the source marker line and reports the named key', () => {
    expect(quotedExcerptOf('[quoted](qilin-quote:42)\n被引用的字')).toEqual({ text: '被引用的字', source: '42' })
  })

  it('treats a marker line without an excerpt as an empty quote', () => {
    expect(quotedExcerptOf('[quoted](qilin-quote:7)')).toEqual({ text: '', source: '7' })
  })

  it('keeps a same-looking line literal when the label or scheme differs', () => {
    expect(quotedExcerptOf('[other](qilin-quote:7)').source).toBe('7')
    expect(quotedExcerptOf('[quoted](https://example.test)').source).toBeUndefined()
  })
})

describe('quoteBlockTextOf', () => {
  it('serializes one excerpt to blockquote lines and back', () => {
    const block = quoteBlockTextOf('第一行\n第二行')
    expect(block).toBe('> 第一行\n> 第二行')
    expect(quotedExcerptOf(quoteTextOf(block))).toEqual({ text: '第一行\n第二行', source: undefined })
  })

  it('prefixes the source marker line when the caller names one', () => {
    const block = quoteBlockTextOf('一句话', 'seq-9')
    expect(block).toBe(`> [quoted](${QUOTE_WIRE_SCHEME}seq-9)\n> 一句话`)
    expect(quotedExcerptOf(quoteTextOf(block))).toEqual({ text: '一句话', source: 'seq-9' })
  })

  it('serializes one selected fragment into insertion text and back', () => {
    const insertion = quoteInsertionOf({ text: '第一行\n第二行' })
    expect(insertion).toBe(quoteBlockTextOf('第一行\n第二行'))
    expect(quotedExcerptOf(quoteTextOf(insertion))).toEqual({ text: '第一行\n第二行', source: undefined })
  })

  it('carries the quoted message key a jump later resolves', () => {
    const insertion = quoteInsertionOf({ text: '一句话', source: 'seq-12' })
    expect(insertion).toBe(`> [quoted](${QUOTE_WIRE_SCHEME}seq-12)\n> 一句话`)
    expect(quotedExcerptOf(quoteTextOf(insertion))).toEqual({ text: '一句话', source: 'seq-12' })
  })

  it('round-trips a multi-line selection through the range scanner', () => {
    const block = quoteBlockTextOf('a > b\nc', 'k1')
    expect(spans(`先说\n${block}\n`)).toEqual([block])
  })
})
