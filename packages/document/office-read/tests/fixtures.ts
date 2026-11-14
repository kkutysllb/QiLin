/**
 * Tiny Office packages built in memory: a ZIP writer with CRC-32, and the few
 * OOXML parts each fixture needs.
 */

/** Accumulated bytes from the writer. */
class Bytes {
  private readonly chunks: Uint8Array[] = []
  push(chunk: Uint8Array): void { this.chunks.push(chunk) }
  toUint8Array(): Uint8Array {
    const total = this.chunks.reduce((size, chunk) => size + chunk.length, 0)
    const out = new Uint8Array(total)
    let at = 0
    for (const chunk of this.chunks) { out.set(chunk, at); at += chunk.length }
    return out
  }
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let index = 0; index < 256; index += 1) {
    let value = index
    for (let bit = 0; bit < 8; bit += 1) value = (value & 1) === 1 ? 0xEDB88320 ^ (value >>> 1) : value >>> 1
    table[index] = value >>> 0
  }
  return table
})()

/** CRC-32 of one entry's bytes. */
function crc32(bytes: Uint8Array): number {
  let crc = 0xFFFFFFFF
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xFF]! ^ (crc >>> 8)
  return (crc ^ 0xFFFFFFFF) >>> 0
}

function u16(value: number): Uint8Array { return new Uint8Array([value & 0xFF, (value >>> 8) & 0xFF]) }
function u32(value: number): Uint8Array {
  return new Uint8Array([value & 0xFF, (value >>> 8) & 0xFF, (value >>> 16) & 0xFF, (value >>> 24) & 0xFF])
}

/** Join byte runs in order. */
function concat(parts: readonly Uint8Array[]): Uint8Array {
  const bytes = new Bytes()
  for (const part of parts) bytes.push(part)
  return bytes.toUint8Array()
}

/**
 * Build one stored (uncompressed) ZIP archive.
 * @param entries - entry name to text content.
 * @returns the archive bytes.
 */
export function zip(entries: Readonly<Record<string, string>>): Uint8Array {
  const encoder = new TextEncoder()
  const local = new Bytes()
  const central = new Bytes()
  let offset = 0
  const names = Object.keys(entries)
  for (const name of names) {
    const nameBytes = encoder.encode(name)
    const data = encoder.encode(String(entries[name]))
    const crc = crc32(data)
    const header = concat([
      u32(0x04034b50), u16(20), u16(0), u16(0), u16(0), u16(0),
      u32(crc), u32(data.length), u32(data.length),
      u16(nameBytes.length), u16(0),
    ])
    local.push(header); local.push(nameBytes); local.push(data)
    central.push(concat([
      u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0),
      u32(crc), u32(data.length), u32(data.length),
      u16(nameBytes.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset),
    ]))
    central.push(nameBytes)
    offset += header.length + nameBytes.length + data.length
  }
  const directory = central.toUint8Array()
  return concat([
    local.toUint8Array(),
    directory,
    concat([
      u32(0x06054b50), u16(0), u16(0), u16(names.length), u16(names.length),
      u32(directory.length), u32(offset), u16(0),
    ]),
  ])
}

/** A minimal DOCX with a heading, a paragraph, and one table. */
export function docxPackage(): Uint8Array {
  return zip({
    'word/document.xml': `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>
<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Title &amp; more</w:t></w:r></w:p>
<w:p><w:r><w:t>Body </w:t></w:r><w:r><w:t>text</w:t></w:r><w:r><w:tab/></w:r><w:r><w:t>end</w:t></w:r></w:p>
<w:tbl><w:tr><w:tc><w:p><w:r><w:t>A1</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>B1</w:t></w:r></w:p></w:tc></w:tr>
<w:tr><w:tc><w:p><w:r><w:t>A2</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>B2</w:t></w:r></w:p></w:tc></w:tr></w:tbl>
</w:body></w:document>`,
  })
}

/** A minimal XLSX with a shared string, a number, a formula, and two sheets. */
export function xlsxPackage(): Uint8Array {
  return zip({
    'xl/workbook.xml': '<workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="First" sheetId="1" r:id="rId1"/><sheet name="Second" sheetId="2" r:id="rId2"/></sheets></workbook>',
    'xl/_rels/workbook.xml.rels': '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="worksheets/sheet2.xml"/></Relationships>',
    'xl/sharedStrings.xml': '<sst><si><t>Hello</t></si></sst>',
    'xl/worksheets/sheet1.xml': '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1"><v>42</v></c><c r="C1"><f>SUM(B1,1)</f><v>43</v></c></row></sheetData></worksheet>',
    'xl/worksheets/sheet2.xml': '<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Inline</t></is></c></row></sheetData></worksheet>',
  })
}

/** A minimal PPTX with a size, one text slide, and one table slide. */
export function pptxPackage(): Uint8Array {
  return zip({
    'ppt/presentation.xml': '<p:presentation xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="p"><p:sldSz cx="12192000" cy="6858000"/><p:sldIdLst><p:sldId id="256" r:id="rId1"/><p:sldId id="257" r:id="rId2"/></p:sldIdLst></p:presentation>',
    'ppt/_rels/presentation.xml.rels': '<Relationships><Relationship Id="rId1" Target="slides/slide1.xml"/><Relationship Id="rId2" Target="slides/slide2.xml"/></Relationships>',
    'ppt/slides/slide1.xml': '<p:sld><a:t>Hello deck</a:t></p:sld>',
    'ppt/slides/slide2.xml': '<p:sld><a:tbl><a:tr><a:tc><a:t>H1</a:t></a:tc><a:tc><a:t>H2</a:t></a:tc></a:tr></a:tbl></p:sld>',
  })
}

/** A ZIP whose entry escapes its root. */
export function unsafePackage(): Uint8Array {
  return zip({ '../escape.txt': 'x', 'word/document.xml': '<w:document/>' })
}

/** Bytes that are not a ZIP at all. */
export function notAZip(): Uint8Array {
  return new TextEncoder().encode('not an office package')
}
