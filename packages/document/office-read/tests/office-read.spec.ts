import { describe, expect, it } from 'vitest'
import { DEFAULT_LIMITS, OfficeReadError, readOffice } from '../src/index.ts'
import { docxPackage, notAZip, pptxPackage, unsafePackage, xlsxPackage } from './fixtures.ts'

describe('DOCX reading', () => {
  it('returns heading levels, joined run text, and table cells', () => {
    const content = readOffice(docxPackage())

    expect(content.format).toBe('docx')
    if (content.format !== 'docx') return
    expect(content.paragraphs).toEqual([
      { text: 'Title & more', level: 1 },
      { text: 'Body text\tend' },
    ])
    expect(content.tables).toEqual([[['A1', 'B1'], ['A2', 'B2']]])
    expect(content.truncated).toBe(false)
  })

  it('stops at the paragraph bound and reports the truncation', () => {
    const content = readOffice(docxPackage(), { limits: { maxParagraphs: 1 } })

    expect(content.format).toBe('docx')
    if (content.format !== 'docx') return
    expect(content.paragraphs).toHaveLength(1)
    expect(content.truncated).toBe(true)
  })
})

describe('XLSX reading', () => {
  it('follows the workbook sheet order and resolves shared, inline, and formula cells', () => {
    const content = readOffice(xlsxPackage())

    expect(content.format).toBe('xlsx')
    if (content.format !== 'xlsx') return
    expect(content.sheets.map(sheet => sheet.name)).toEqual(['First', 'Second'])
    expect(content.sheets[0]?.rows).toEqual([['Hello', '42', '43']])
    expect(content.sheets[1]?.rows).toEqual([['Inline']])
  })

  it('stops at the cell bound and reports the truncation', () => {
    const content = readOffice(xlsxPackage(), { limits: { maxCells: 1 } })

    expect(content.format).toBe('xlsx')
    if (content.format !== 'xlsx') return
    expect(content.sheets[0]?.truncated).toBe(true)
  })
})

describe('PPTX reading', () => {
  it('returns the slide size, slide order, text runs, and tables', () => {
    const content = readOffice(pptxPackage())

    expect(content.format).toBe('pptx')
    if (content.format !== 'pptx') return
    expect([content.width, content.height]).toEqual([12_192_000, 6_858_000])
    expect(content.slides).toEqual([
      { index: 0, texts: ['Hello deck'], tables: [] },
      { index: 1, texts: ['H1', 'H2'], tables: [[['H1', 'H2']]] },
    ])
  })
})

describe('refusals', () => {
  it('refuses bytes that are not a package', () => {
    expect(() => readOffice(notAZip())).toThrow(OfficeReadError)
    expect(() => readOffice(notAZip())).toThrow(/not a readable Office package/u)
  })

  it('refuses an entry name that escapes the package root', () => {
    let failure: unknown
    try { readOffice(unsafePackage()) } catch (error: unknown) { failure = error }
    expect(failure).toBeInstanceOf(OfficeReadError)
    expect((failure as OfficeReadError).code).toBe('not-a-package')
  })

  it('refuses a package over the entry-count limit', () => {
    let failure: unknown
    try { readOffice(docxPackage(), { limits: { maxEntries: 0 } }) } catch (error: unknown) { failure = error }
    expect((failure as OfficeReadError).code).toBe('too-large')
  })

  it('refuses a package whose body part is missing', () => {
    expect(() => readOffice(docxPackage(), { format: 'pptx' })).toThrow(OfficeReadError)
  })

  it('keeps every default limit a positive integer', () => {
    for (const [name, value] of Object.entries(DEFAULT_LIMITS)) {
      expect(Number.isInteger(value), name).toBe(true)
      expect(value, name).toBeGreaterThan(0)
    }
  })
})
