/**
 * Read-only Office document reading: one DOCX, XLSX, or PPTX package in, a
 * structured summary out, with no converter process and no file written.
 * @module @qilin-agent/office-read
 */

import { readDocxPackage, type DocxContent } from './docx.ts'
import { readPptxPackage, type PptxContent } from './pptx.ts'
import { readXlsxPackage, type XlsxContent } from './xlsx.ts'
import { byName, readZip, type ZipLimits } from './zip.ts'
import { textOf } from './xml.ts'

export type { DocxContent, DocxParagraph } from './docx.ts'
export type { PptxContent, PptxSlide } from './pptx.ts'
export type { XlsxContent, XlsxSheet } from './xlsx.ts'

/** Package formats this reader understands. */
export type OfficeFormat = 'docx' | 'xlsx' | 'pptx'

/** Bounds one read applies; every field has a default a caller may narrow or widen. */
export interface OfficeReadLimits extends ZipLimits {
  /** Paragraphs a DOCX read returns. */
  readonly maxParagraphs: number
  /** Table rows a read returns per table. */
  readonly maxTableRows: number
  /** Rows a sheet returns. */
  readonly maxRows: number
  /** Cells a sheet returns. */
  readonly maxCells: number
  /** Sheets a workbook returns. */
  readonly maxSheets: number
  /** Slides a deck returns. */
  readonly maxSlides: number
}

/** Defaults chosen for a model-facing summary, not for publishing. */
export const DEFAULT_LIMITS: OfficeReadLimits = {
  maxEntries: 2_048,
  maxEntryBytes: 32 * 1_024 * 1_024,
  maxTotalBytes: 128 * 1_024 * 1_024,
  maxRatio: 200,
  maxParagraphs: 2_000,
  maxTableRows: 500,
  maxRows: 2_000,
  maxCells: 20_000,
  maxSheets: 64,
  maxSlides: 500,
}

/** Summary of one read document, discriminated by `format`. */
export type OfficeContent = DocxContent | XlsxContent | PptxContent

/** Codes a caller maps to its own message; never a raw parser error. */
export type OfficeReadErrorCode = 'not-a-package' | 'unsupported' | 'too-large' | 'corrupt'

/** Failure raised by {@link readOffice} with a stable code. */
export class OfficeReadError extends Error {
  /**
   * @param code - stable failure code.
   * @param message - operator-facing reason.
   */
  constructor(readonly code: OfficeReadErrorCode, message: string) {
    super(message)
    this.name = 'OfficeReadError'
  }
}

/** Format of a package from its entry names, or undefined when it is none of them. */
function detect(parts: ReadonlyMap<string, Uint8Array>): OfficeFormat | undefined {
  if (parts.has('word/document.xml')) return 'docx'
  if (parts.has('xl/workbook.xml')) return 'xlsx'
  if (parts.has('ppt/presentation.xml')) return 'pptx'
  return undefined
}

/** Map one archive failure onto the public code. */
function failureOf(reason: string): OfficeReadError {
  if (reason === 'too-many-entries' || reason === 'entry-too-large' || reason === 'ratio-exceeded') {
    return new OfficeReadError('too-large', `Office package exceeds a read limit: ${reason}`)
  }
  if (reason === 'invalid-entry-name') return new OfficeReadError('not-a-package', 'Office package contains an unsafe entry name')
  if (reason === 'unsupported-compression') return new OfficeReadError('unsupported', 'Office package uses an unsupported compression method')
  return new OfficeReadError('not-a-package', 'Bytes are not a readable Office package')
}

/**
 * Read one Office package.
 * @param bytes - complete document bytes.
 * @param options - format override and limit overrides.
 * @returns the format-appropriate summary.
 * @throws {OfficeReadError} when the bytes are not a package this reader supports.
 */
export function readOffice(
  bytes: Uint8Array,
  options: { readonly format?: OfficeFormat; readonly limits?: Partial<OfficeReadLimits> } = {},
): OfficeContent {
  const limits: OfficeReadLimits = { ...DEFAULT_LIMITS, ...options.limits }
  let entries
  try {
    entries = readZip(bytes, limits)
  } catch (error: unknown) {
    if (!(error instanceof Error)) throw error
    throw failureOf(error.message)
  }
  const parts = byName(entries)
  const format = options.format ?? detect(parts)
  if (format === undefined) throw new OfficeReadError('unsupported', 'Office package declares no DOCX, XLSX, or PPTX body')
  try {
    if (format === 'docx') return readDocxPackage(parts, textOf, limits.maxParagraphs, limits.maxTableRows)
    if (format === 'xlsx') return readXlsxPackage(parts, textOf, limits.maxRows, limits.maxCells, limits.maxSheets)
    return readPptxPackage(parts, textOf, limits.maxSlides, limits.maxTableRows)
  } catch (error: unknown) {
    if (error instanceof OfficeReadError) throw error
    if (error instanceof Error && error.message === 'corrupt') {
      throw new OfficeReadError('corrupt', `${format} package is missing the part its body needs`)
    }
    throw new OfficeReadError('corrupt', `${format} package could not be read: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/** Counts and names one read document exposes without its content. */
export interface OfficeMetadata {
  /** Detected or requested format. */
  readonly format: OfficeFormat
  /** Paragraphs the body holds. */
  readonly paragraphs: number
  /** Tables the body holds. */
  readonly tables: number
  /** One entry per worksheet: its name and the size of the cells it holds. */
  readonly sheets: readonly { readonly name: string; readonly rows: number; readonly columns: number }[]
  /** Slides the deck holds. */
  readonly slides: number
  /** Whether a read limit stopped the walk early. */
  readonly truncated: boolean
}

/**
 * Read one Office package and return its counts and names only.
 * The preview cache uses this identity so two documents that differ only in
 * styling produce the same key while differently sized ones do not.
 * @param bytes - complete document bytes.
 * @param options - format override and limit overrides.
 * @returns the format-appropriate metadata.
 * @throws {OfficeReadError} when the bytes are not a package this reader supports.
 */
export function readOfficeMetadata(
  bytes: Uint8Array,
  options: { readonly format?: OfficeFormat; readonly limits?: Partial<OfficeReadLimits> } = {},
): OfficeMetadata {
  const content = readOffice(bytes, options)
  if (content.format === 'docx') {
    return { format: 'docx', paragraphs: content.paragraphs.length, tables: content.tables.length, sheets: [], slides: 0, truncated: content.truncated }
  }
  if (content.format === 'xlsx') {
    return {
      format: 'xlsx',
      paragraphs: 0,
      tables: 0,
      sheets: content.sheets.map(sheet => ({
        name: sheet.name,
        rows: sheet.rows.length,
        columns: sheet.rows.reduce((widest, row) => Math.max(widest, row.length), 0),
      })),
      slides: 0,
      truncated: content.truncated,
    }
  }
  return { format: 'pptx', paragraphs: 0, tables: 0, sheets: [], slides: content.slides.length, truncated: content.truncated }
}
