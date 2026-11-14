/**
 * DOCX reader: body paragraphs with heading levels, and table text.
 * @module @qilin-agent/office-read/src/docx
 */

import { attributeElements, elements, textOf, textOfElements } from './xml.ts'
import { decodeXmlEntities } from './entities.ts'

/** One body paragraph. */
export interface DocxParagraph {
  /** Paragraph text with runs and tabs joined. */
  readonly text: string
  /** Heading level when the paragraph uses a built-in heading style. */
  readonly level?: number
}

/** DOCX content the reader exposes. */
export interface DocxContent {
  readonly format: 'docx'
  readonly paragraphs: readonly DocxParagraph[]
  /** Tables in document order, each row's cell texts. */
  readonly tables: readonly (readonly (readonly string[])[])[]
  /** Whether a limit stopped the walk before the document ended. */
  readonly truncated: boolean
}

/** Heading style name to its level, for `w:pStyle` values. */
const HEADING = /^heading\s*([1-9])$/iu

/**
 * Read a DOCX package's body.
 * @param part - `word/document.xml` text.
 * @param maxParagraphs - paragraph bound; the walk stops there.
 * @param maxTableRows - rows per table bound.
 * @returns the body content.
 */
export function readDocx(part: string, maxParagraphs: number, maxTableRows: number): DocxContent {
  const paragraphs: DocxParagraph[] = []
  const tables: string[][][] = []
  let truncated = false
  const body = elements(part, 'w:body')[0] ?? part
  const blockPattern = /<w:(p|tbl)(?:\s[^>]*)?>[\s\S]*?<\/w:\1>/gu
  for (const match of body.matchAll(blockPattern)) {
    const block = match[0]
    if (match[1] === 'p') {
      if (paragraphs.length >= maxParagraphs) { truncated = true; break }
      paragraphs.push(readParagraph(block))
      continue
    }
    tables.push(readTable(block, maxTableRows))
  }
  return { format: 'docx', paragraphs, tables, truncated }
}

/**
 * Read one paragraph element.
 * @param block - the element's outer text.
 * @returns the paragraph and its heading level.
 */
function readParagraph(block: string): DocxParagraph {
  const text = paragraphText(block)
  const style = attributeElements(block, 'w:pStyle')[0]?.['w:val']
  const level = style === undefined ? undefined : HEADING.exec(style)?.[1]
  return level === undefined ? { text } : { text, level: Number.parseInt(level, 10) }
}

/**
 * Join one paragraph's visible runs, including explicit line breaks and tabs.
 * @param block - the paragraph element's outer text.
 * @returns the paragraph text.
 */
function paragraphText(block: string): string {
  let text = ''
  const tokenPattern = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:tab(?:\s[^>]*)?\/>|<w:br(?:\s[^>]*)?\/>/gu
  for (const token of block.matchAll(tokenPattern)) {
    if (token[1] !== undefined) text += decodeXmlEntities(token[1])
    else if (token[0].startsWith('<w:tab')) text += '\t'
    else text += '\n'
  }
  return text
}

/**
 * Read one table element into rows of cell texts.
 * @param block - the table element's outer text.
 * @param maxRows - row bound.
 * @returns the table rows.
 */
function readTable(block: string, maxRows: number): string[][] {
  const rows: string[][] = []
  for (const row of elements(block, 'w:tr')) {
    if (rows.length >= maxRows) break
    rows.push(elements(row, 'w:tc').map(cell => textOfElements(cell, 'w:t')))
  }
  return rows
}

/**
 * Read `word/document.xml` from the package map.
 * @param parts - package entries by name.
 * @param readText - entry decoder.
 * @param maxParagraphs - paragraph bound.
 * @param maxTableRows - rows per table bound.
 * @returns the body content.
 */
export function readDocxPackage(
  parts: ReadonlyMap<string, Uint8Array>,
  readText: (bytes: Uint8Array) => string,
  maxParagraphs: number,
  maxTableRows: number,
): DocxContent {
  const body = parts.get('word/document.xml')
  if (body === undefined) throw new Error('corrupt')
  return readDocx(readText(body), maxParagraphs, maxTableRows)
}

export { textOf }
