/**
 * XLSX reader: workbook sheet order, shared strings, cell values and formulas.
 * @module @qilin-agent/office-read/src/xlsx
 */

import { attributeElements, attributesOf, elements, textOf, textOfElements } from './xml.ts'
import { relationships } from './relationships.ts'

/** One worksheet as the reader exposes it. */
export interface XlsxSheet {
  /** Sheet name as the workbook declares it. */
  readonly name: string
  /** Row-major cell texts, empty strings for absent cells. */
  readonly rows: readonly (readonly string[])[]
  /** Whether a limit stopped the sheet before its last cell. */
  readonly truncated: boolean
}

/** XLSX content the reader exposes. */
export interface XlsxContent {
  readonly format: 'xlsx'
  readonly sheets: readonly XlsxSheet[]
  /** Whether a limit stopped the workbook before its last sheet. */
  readonly truncated: boolean
}

/** Column letters to a zero-based column index. */
function columnIndex(reference: string): number {
  let index = 0
  for (const character of reference.replace(/[^A-Z]/gu, '')) index = index * 26 + (character.charCodeAt(0) - 64)
  return index - 1
}

/** Row number to a zero-based index. */
function rowIndex(reference: string): number {
  return Number.parseInt(reference.replace(/\D/gu, ''), 10) - 1
}

/**
 * Read the shared string table.
 * @param part - `xl/sharedStrings.xml` text, or undefined when the workbook has none.
 * @returns the shared strings.
 */
function sharedStrings(part: string | undefined): string[] {
  if (part === undefined) return []
  return elements(part, 'si').map(item => textOfElements(item, 't'))
}

/**
 * Read one worksheet.
 * @param name - sheet name.
 * @param part - worksheet part text.
 * @param shared - shared string table.
 * @param maxRows - row bound.
 * @param maxCells - cell bound for the sheet.
 * @returns the sheet.
 */
function readSheet(name: string, part: string, shared: readonly string[], maxRows: number, maxCells: number): XlsxSheet {
  const cells: { row: number; column: number; text: string }[] = []
  let truncated = false
  for (const match of part.matchAll(/<c(\s[^>]*?)?(?:\/>|>([\s\S]*?)<\/c>)/gu)) {
    if (cells.length >= maxCells) { truncated = true; break }
    const attributes = attributesOf(match[1] ?? '')
    const reference = attributes['r']
    if (reference === undefined) continue
    const body = match[2] ?? ''
    const type = attributes['t']
    const value = elements(body, 'v')[0]
    const inline = elements(body, 'is')[0]
    const formula = elements(body, 'f')[0]
    let text = ''
    if (type === 's' && value !== undefined) text = shared[Number.parseInt(value, 10)] ?? ''
    else if (type === 'inlineStr' && inline !== undefined) text = textOfElements(inline, 't')
    else if (value !== undefined) text = value
    if (formula !== undefined) text = text === '' ? '=' + formula : text
    cells.push({ row: rowIndex(reference), column: columnIndex(reference), text })
  }
  const height = Math.min(maxRows, cells.reduce((highest, cell) => Math.max(highest, cell.row + 1), 0))
  const width = cells.reduce((widest, cell) => Math.max(widest, cell.column + 1), 0)
  const rows: string[][] = Array.from({ length: height }, () => Array.from({ length: width }, () => ''))
  for (const cell of cells) {
    if (cell.row >= height) { truncated = true; continue }
    const row = rows[cell.row]
    if (row !== undefined) row[cell.column] = cell.text
  }
  return { name, rows, truncated }
}

/**
 * Read an XLSX package's worksheets.
 * @param parts - package entries by name.
 * @param readText - entry decoder.
 * @param maxRows - row bound per sheet.
 * @param maxCells - cell bound per sheet.
 * @param maxSheets - sheet bound.
 * @returns the workbook content.
 */
export function readXlsxPackage(
  parts: ReadonlyMap<string, Uint8Array>,
  readText: (bytes: Uint8Array) => string,
  maxRows: number,
  maxCells: number,
  maxSheets: number,
): XlsxContent {
  const workbook = parts.get('xl/workbook.xml')
  if (workbook === undefined) throw new Error('corrupt')
  const shared = sharedStrings(parts.get('xl/sharedStrings.xml') === undefined ? undefined : readText(parts.get('xl/sharedStrings.xml') as Uint8Array))
  const rels = relationships(parts.get('xl/_rels/workbook.xml.rels') === undefined ? undefined : readText(parts.get('xl/_rels/workbook.xml.rels') as Uint8Array), 'xl/')
  const sheets: XlsxSheet[] = []
  let truncated = false
  for (const sheet of attributeElements(readText(workbook), 'sheet')) {
    if (sheets.length >= maxSheets) { truncated = true; break }
    const name = sheet['name'] ?? `sheet${String(sheets.length + 1)}`
    const id = sheet['r:id']
    const target = id === undefined ? undefined : rels.get(id)
    const part = target === undefined ? undefined : parts.get(target)
    if (part === undefined) { sheets.push({ name, rows: [], truncated: true }); continue }
    sheets.push(readSheet(name, readText(part), shared, maxRows, maxCells))
  }
  return { format: 'xlsx', sheets, truncated }
}

export { textOf }
