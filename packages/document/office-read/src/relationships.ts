/**
 * Relationship-part reading shared by the XLSX and PPTX readers: one relation
 * id maps to the package part it targets.
 * @module @qilin-agent/office-read/src/relationships
 */

import { attributeElements } from './xml.ts'

/**
 * Map a relationship id to the part it targets.
 * @param rels - the relationship part's text, or undefined when the package has none.
 * @param base - package-relative directory the targets resolve against.
 * @returns target part paths by relationship id.
 */
export function relationships(rels: string | undefined, base: string): ReadonlyMap<string, string> {
  if (rels === undefined) return new Map()
  const map = new Map<string, string>()
  for (const rel of attributeElements(rels, 'Relationship')) {
    const id = rel['Id']
    const target = rel['Target']
    if (id === undefined || target === undefined) continue
    map.set(id, target.startsWith('/') ? target.slice(1) : base + target.replace(/^\.\//u, ''))
  }
  return map
}
