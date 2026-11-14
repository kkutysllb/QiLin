/**
 * Small XML helpers over the strings an OOXML package stores: element text,
 * attribute lookup, and entity decoding.
 * @module @qilin-agent/office-read/src/xml
 */

import { decodeXmlEntities } from './entities.ts'

/** One decoded attribute map. */
export type Attributes = Readonly<Record<string, string>>

/**
 * Decode one document part as text.
 * @param bytes - part bytes.
 * @returns the decoded text.
 */
export function textOf(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes)
}

/**
 * Return every element with the given tag, in document order.
 * @param xml - part text.
 * @param tag - qualified tag as written, without angle brackets.
 * @returns each element's inner text.
 */
export function elements(xml: string, tag: string): string[] {
  const pattern = new RegExp('<' + tag + '(?:\\s[^>]*)?>([\\s\\S]*?)</' + tag + '>', 'gu')
  return [...xml.matchAll(pattern)].map(match => match[1] ?? '')
}

/**
 * Return the attributes of every self-closing or opening element with the tag.
 * @param xml - part text.
 * @param tag - qualified tag as written.
 * @returns one attribute map per element.
 */
export function attributeElements(xml: string, tag: string): Attributes[] {
  const pattern = new RegExp('<' + tag + '(\\s[^>]*?)?/?>', 'gu')
  return [...xml.matchAll(pattern)].map(match => attributesOf(match[1] ?? ''))
}

/**
 * Read the attributes written on one element.
 * @param raw - attribute text between the tag name and the closing angle bracket.
 * @returns the attribute values by name.
 */
export function attributesOf(raw: string): Attributes {
  const attributes: Record<string, string> = {}
  const pattern = /([A-Za-z_:][-A-Za-z0-9_:.]*)\s*=\s*"([^"]*)"/gu
  for (const match of raw.matchAll(pattern)) attributes[match[1] as string] = decodeXmlEntities(match[2] ?? '')
  return attributes
}

/**
 * Read the first attribute of one element, if the tag appears at all.
 * @param xml - part text.
 * @param tag - qualified tag.
 * @param name - attribute name.
 * @returns the attribute value, or undefined.
 */
export function attributeOf(xml: string, tag: string, name: string): string | undefined {
  const [first] = attributeElements(xml, tag)
  return first?.[name]
}

/**
 * Read the text content of every matching child element, joined in order.
 * @param xml - element inner text.
 * @param tag - qualified tag.
 * @returns the concatenated decoded text.
 */
export function textOfElements(xml: string, tag: string): string {
  return elements(xml, tag).map(decodeXmlEntities).join('')
}
