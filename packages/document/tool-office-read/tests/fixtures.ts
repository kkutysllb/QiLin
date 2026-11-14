/** Stored-entry ZIP writer used to build Office fixtures in memory. */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let index = 0; index < 256; index += 1) {
    let value = index
    for (let bit = 0; bit < 8; bit += 1) value = (value & 1) === 1 ? 0xEDB88320 ^ (value >>> 1) : value >>> 1
    table[index] = value >>> 0
  }
  return table
})()

/**
 * CRC-32 of one entry's bytes.
 * @param bytes - entry bytes.
 * @returns the checksum.
 */
function crc32(bytes: Uint8Array): number {
  let crc = 0xFFFFFFFF
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xFF]! ^ (crc >>> 8)
  return (crc ^ 0xFFFFFFFF) >>> 0
}

function u16(value: number): number[] { return [value & 0xFF, (value >>> 8) & 0xFF] }
function u32(value: number): number[] { return [value & 0xFF, (value >>> 8) & 0xFF, (value >>> 16) & 0xFF, (value >>> 24) & 0xFF] }

/**
 * Build one stored (uncompressed) ZIP archive.
 * @param entries - entry name to text content.
 * @returns the archive bytes.
 */
export function zip(entries: Readonly<Record<string, string>>): Uint8Array {
  const encoder = new TextEncoder()
  const local: number[] = []
  const central: number[] = []
  let offset = 0
  const names = Object.keys(entries)
  for (const name of names) {
    const nameBytes = [...encoder.encode(name)]
    const data = [...encoder.encode(String(entries[name]))]
    const crc = crc32(new Uint8Array(data))
    const header = [
      ...u32(0x04034b50), ...u16(20), ...u16(0), ...u16(0), ...u16(0), ...u16(0),
      ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(nameBytes.length), ...u16(0),
    ]
    local.push(...header, ...nameBytes, ...data)
    central.push(
      ...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0), ...u16(0), ...u16(0), ...u16(0),
      ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(nameBytes.length),
      ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(offset), ...nameBytes,
    )
    offset += header.length + nameBytes.length + data.length
  }
  const all = [
    ...local,
    ...central,
    ...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(names.length), ...u16(names.length),
    ...u32(central.length), ...u32(offset), ...u16(0),
  ]
  return new Uint8Array(all)
}

/** A DOCX with one heading, one paragraph, and one table. */
export function docxFixture(): Uint8Array {
  const body = [
    '<w:document><w:body>',
    '<w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t>Plan</w:t></w:r></w:p>',
    '<w:p><w:r><w:t>Body</w:t></w:r></w:p>',
    '<w:tbl><w:tr><w:tc><w:p><w:r><w:t>X</w:t></w:r></w:p></w:tc>',
    '<w:tc><w:p><w:r><w:t>Y</w:t></w:r></w:p></w:tc></w:tr></w:tbl>',
    '</w:body></w:document>',
  ].join('')
  return zip({ 'word/document.xml': body })
}

/** An XLSX with one sheet and two cells. */
export function xlsxFixture(): Uint8Array {
  return zip({
    'xl/workbook.xml': '<workbook><sheets>'
      + '<sheet name="Data" sheetId="1" r:id="rId1"/></sheets></workbook>',
    'xl/_rels/workbook.xml.rels': '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>',
    'xl/worksheets/sheet1.xml': '<worksheet><sheetData><row r="1">'
      + '<c r="A1" t="inlineStr"><is><t>Q1</t></is></c><c r="B1"><v>7</v></c>'
      + '</row></sheetData></worksheet>',
  })
}
