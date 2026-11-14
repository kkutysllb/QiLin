/**
 * Numeric and named XML entity decoding for document text.
 * @module @qilin-agent/office-read/src/entities
 */

const NAMED: Readonly<Record<string, string>> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'",
}

/**
 * Decode the XML entities OOXML documents carry in text runs.
 * @param value - raw attribute or text value.
 * @returns the decoded value; an unknown entity is kept verbatim.
 */
export function decodeXmlEntities(value: string): string {
  return value.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z]+);/gu, (whole, body: string) => {
    if (body.startsWith('#x')) {
      const code = Number.parseInt(body.slice(2), 16)
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole
    }
    if (body.startsWith('#')) {
      const code = Number.parseInt(body.slice(1), 10)
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole
    }
    return NAMED[body] ?? whole
  })
}
