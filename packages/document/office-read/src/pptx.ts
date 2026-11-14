/**
 * PPTX reader: slide size, slide order, and the text and tables on each slide.
 * @module @qilin-agent/office-read/src/pptx
 */

import { attributeElements, attributeOf, elements, textOf, textOfElements } from './xml.ts'
import { relationships } from './relationships.ts'
import { decodeXmlEntities } from './entities.ts'

/** One slide as the reader exposes it. */
export interface PptxSlide {
  /** Zero-based slide position in presentation order. */
  readonly index: number
  /** Text runs in reading order. */
  readonly texts: readonly string[]
  /** Tables on the slide, each row's cell texts. */
  readonly tables: readonly (readonly (readonly string[])[])[]
}

/** PPTX content the reader exposes. */
export interface PptxContent {
  readonly format: 'pptx'
  /** Slide width in EMU. */
  readonly width: number
  /** Slide height in EMU. */
  readonly height: number
  readonly slides: readonly PptxSlide[]
  /** Whether a limit stopped the deck before its last slide. */
  readonly truncated: boolean
}

/**
 * Read the text runs and tables of one slide.
 * @param index - slide position.
 * @param part - slide part text.
 * @param maxTableRows - row bound per table.
 * @returns the slide.
 */
function readSlide(index: number, part: string, maxTableRows: number): PptxSlide {
  const texts = elements(part, 'a:t').map(decodeXmlEntities)
  const tables: string[][][] = []
  for (const table of elements(part, 'a:tbl')) {
    const rows: string[][] = []
    for (const row of elements(table, 'a:tr')) {
      if (rows.length >= maxTableRows) break
      rows.push(elements(row, 'a:tc').map(cell => textOfElements(cell, 'a:t')))
    }
    tables.push(rows)
  }
  return { index, texts, tables }
}

/**
 * Read a PPTX package's slides.
 * @param parts - package entries by name.
 * @param readText - entry decoder.
 * @param maxSlides - slide bound.
 * @param maxTableRows - row bound per table.
 * @returns the deck content.
 */
export function readPptxPackage(
  parts: ReadonlyMap<string, Uint8Array>,
  readText: (bytes: Uint8Array) => string,
  maxSlides: number,
  maxTableRows: number,
): PptxContent {
  const presentation = parts.get('ppt/presentation.xml')
  if (presentation === undefined) throw new Error('corrupt')
  const deck = readText(presentation)
  const rels = relationships(parts.get('ppt/_rels/presentation.xml.rels') === undefined ? undefined : readText(parts.get('ppt/_rels/presentation.xml.rels') as Uint8Array), 'ppt/')
  const order = attributeElements(elements(deck, 'p:sldIdLst')[0] ?? '', 'p:sldId')
  const slides: PptxSlide[] = []
  let truncated = false
  for (const [index, slide] of order.entries()) {
    if (slides.length >= maxSlides) { truncated = true; break }
    const target = slide['r:id'] === undefined ? undefined : rels.get(slide['r:id'])
    const part = target === undefined ? undefined : parts.get(target)
    if (part === undefined) { slides.push({ index, texts: [], tables: [] }); truncated = true; continue }
    slides.push(readSlide(index, readText(part), maxTableRows))
  }
  return {
    format: 'pptx',
    width: Number(attributeOf(deck, 'p:sldSz', 'cx') ?? 0),
    height: Number(attributeOf(deck, 'p:sldSz', 'cy') ?? 0),
    slides,
    truncated,
  }
}

export { textOf }
