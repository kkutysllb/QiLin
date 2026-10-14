/** Comment-preserving profile plugin enablement and configuration edits. */
import { readFile } from 'node:fs/promises'
import { isMap, isSeq, parseDocument, type Document, type YAMLMap, type YAMLSeq } from 'yaml'
import { loadOptionalPatches } from '@qilin-agent/app-boot'
import { writeFileAtomic } from '@qilin-agent/atomic-write'

/** Read a profile patch file as a YAML document, tolerating its absence and preserving `!!js` scalars as strings.
 * @param filename Current profile patch file.
 * @returns The parsed document and its top-level sequence items.
 */
async function readPatchDocument(filename: string): Promise<{ document: Document; items: YAMLSeq['items'] }> {
  let text: string
  try {
    text = await readFile(filename, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    text = '[]\n'
  }
  const document = parseDocument(text, {
    customTags: [{ tag: 'tag:yaml.org,2002:js', resolve: (value: string) => value }],
  })
  const error = document.errors[0]
  if (error !== undefined) throw error
  if (!isSeq(document.contents)) throw new Error('Profile patch must be a YAML sequence')
  loadOptionalPatches('qilin', filename)
  return { document, items: document.contents.items }
}

/** Find the last override a patch file declares for one entry.
 * @param document Parsed profile patch document.
 * @param items The document's top-level override entries.
 * @param id Unique composition entry id.
 * @param name Module name used to match name-qualified overrides.
 * @returns The override map, or undefined when the file declares none.
 */
function findOverride(document: Document, items: YAMLSeq['items'], id: string, name: string): YAMLMap | undefined {
  const found = items.findLast((item, index) => {
    if (!isMap(item) || document.getIn([index, 'id']) !== id || item.has('insert')) return false
    const expectedName = document.getIn([index, 'name'])
    return !expectedName || expectedName === name
  })
  return isMap(found) ? found : undefined
}

/** Replace the last matching override or append one after existing insertions.
 * @param filename Current profile patch file.
 * @param id Unique composition entry id.
 * @param name Module name used to match name-qualified overrides.
 * @param enabled Desired entry enablement.
 * @returns Whether the file changed.
 */
export async function writePluginEnabled(filename: string, id: string, name: string, enabled: boolean): Promise<boolean> {
  const { document, items } = await readPatchDocument(filename)
  const target = findOverride(document, items, id, name)
  if (isMap(target)) {
    const index = items.indexOf(target)
    if (document.getIn([index, 'disabled']) === !enabled) return false
    document.setIn([index, 'disabled'], !enabled)
  } else {
    document.add({ id, disabled: !enabled })
  }
  await writeFileAtomic(filename, String(document), { mode: 0o600 })
  return true
}

/** Replace one entry's configuration override, or append one after existing insertions.
 * A patch override replaces a row's declared config wholesale, so callers send the complete map.
 * @param filename Current profile patch file.
 * @param id Unique composition entry id.
 * @param name Module name used to match name-qualified overrides.
 * @param config The complete configuration map the entry should run with.
 * @returns Whether the file changed.
 */
export async function writePluginConfig(filename: string, id: string, name: string, config: Record<string, unknown>): Promise<boolean> {
  const { document, items } = await readPatchDocument(filename)
  const target = findOverride(document, items, id, name)
  if (isMap(target)) {
    const index = items.indexOf(target)
    const current = document.getIn([index, 'config']) as unknown
    if (JSON.stringify(current ?? {}) === JSON.stringify(config)) return false
    document.setIn([index, 'config'], config)
  } else {
    document.add({ id, name, config })
  }
  await writeFileAtomic(filename, String(document), { mode: 0o600 })
  return true
}
