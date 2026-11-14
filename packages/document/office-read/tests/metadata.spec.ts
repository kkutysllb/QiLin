import { describe, expect, it } from 'vitest'
import { readOfficeMetadata } from '../src/index.ts'
import { docxPackage, pptxPackage, xlsxPackage } from './fixtures.ts'

describe('metadata', () => {
  it('counts DOCX paragraphs and tables without their text', () => {
    expect(readOfficeMetadata(docxPackage())).toEqual({
      format: 'docx', paragraphs: 2, tables: 1, sheets: [], slides: 0, truncated: false,
    })
  })

  it('names each worksheet with its cell extent', () => {
    expect(readOfficeMetadata(xlsxPackage())).toEqual({
      format: 'xlsx',
      paragraphs: 0,
      tables: 0,
      sheets: [{ name: 'First', rows: 1, columns: 3 }, { name: 'Second', rows: 1, columns: 1 }],
      slides: 0,
      truncated: false,
    })
  })

  it('counts deck slides', () => {
    expect(readOfficeMetadata(pptxPackage())).toMatchObject({ format: 'pptx', slides: 2 })
  })

  it('keeps a limit-triggered truncation visible in the metadata', () => {
    expect(readOfficeMetadata(docxPackage(), { limits: { maxParagraphs: 1 } })).toMatchObject({ paragraphs: 1, truncated: true })
  })
})
