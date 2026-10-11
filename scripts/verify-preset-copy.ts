/**
 * Doc-sync gate for the single shipped agent preset: the preset directories, the
 * id→copy-key mapping in `@qilin-agent/agent-presets/display`, and every client
 * dictionary that renders that copy must name exactly the same set, and no
 * retired preset id may keep a copy key behind.
 */

import { globSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')

/** Preset ids the product shipped before the single-preset convergence. */
const RETIRED_PRESET_IDS: readonly string[] = ['standard', 'cordis', 'minimal']

const PRESETS_DIR = 'packages/preset/agent-presets/presets'

/** One `id: { name: 'key', description: 'key' }` row of the display map. */
const DISPLAY_ROW = /^ {2}([A-Za-z0-9-]+): \{ name: '([^']+)', description: '([^']+)' \},$/

/** One flat `<key>:` entry of a locale dictionary. */
const DICTIONARY_KEY = /^ {2}([A-Za-z][A-Za-z0-9]*):/
const DISPLAY_MODULE = 'packages/preset/agent-presets/src/display.ts'

/** Every dictionary that renders shipped-preset copy. */
const DICTIONARIES: readonly string[] = [
  'packages/client/ui-agent-preset/src/client/locales.ts',
  'packages/client/ui-settings-plugin-inventory/src/client/locales.ts',
]

/** One id→copy-key row of the display map. */
export interface DisplayRow {
  /** Shipped preset id the row maps. */
  readonly id: string
  /** Dictionary key carrying its name. */
  readonly nameKey: string
  /** Dictionary key carrying its description. */
  readonly descriptionKey: string
}

/** The corpus one comparison reads. */
export interface PresetCopyCorpus {
  /** Preset directory names under {@link PRESETS_DIR}. */
  readonly shippedIds: readonly string[]
  /** Rows of the display map. */
  readonly displayRows: readonly DisplayRow[]
  /** Declared dictionary keys, keyed by repository-relative path. */
  readonly dictionaryKeys: Readonly<Record<string, readonly string[]>>
}

/**
 * Read the `id: { name: 'key', description: 'key' }` rows of the display map.
 * @param source - the display module's text.
 * @returns one row per mapped shipped preset id.
 */
export function parseDisplayRows(source: string): DisplayRow[] {
  const rows: DisplayRow[] = []
  for (const line of source.split('\n')) {
    const match = DISPLAY_ROW.exec(line)
    const id = match?.[1]
    const nameKey = match?.[2]
    const descriptionKey = match?.[3]
    if (id === undefined || nameKey === undefined || descriptionKey === undefined) continue
    rows.push({ id, nameKey, descriptionKey })
  }
  return rows
}

/**
 * Read the flat `<key>:` entries a locale dictionary declares.
 * @param source - the dictionary file's text.
 * @returns declared key names.
 */
export function parseDictionaryKeys(source: string): string[] {
  const keys: string[] = []
  for (const line of source.split('\n')) {
    const key = DICTIONARY_KEY.exec(line)?.[1]
    if (key !== undefined) keys.push(key)
  }
  return keys
}

/**
 * Map preset copy keys back to the preset id they name.
 * @param keys - dictionary key names.
 * @returns ids carried by `preset<Id>Name` and `preset<Id>Description` keys.
 */
export function copyKeyPresetIds(keys: readonly string[]): string[] {
  return keys
    .filter(key => isPresetCopyKey(key))
    .map((key) => {
      const stem = key.replace(/^preset/, '').replace(/(Name|Description)$/, '')
      return stem.charAt(0).toLowerCase() + stem.slice(1)
    })
}

/** Whether a dictionary key carries shipped-preset display copy. */
function isPresetCopyKey(key: string): boolean {
  return /^preset[A-Z].*(Name|Description)$/.test(key)
}

/**
 * Compare the shipped roster with the display map and every dictionary.
 * @param corpus - ids, mapping, and dictionary keys to compare.
 * @returns one message per violation; empty when all three agree exactly.
 */
export function checkPresetCopy(corpus: PresetCopyCorpus): string[] {
  const failures: string[] = []
  const shipped = new Set(corpus.shippedIds)
  const mapped = new Set(corpus.displayRows.map(row => row.id))
  for (const id of shipped) {
    if (!mapped.has(id)) failures.push(`shipped preset \`${id}\` has no copy mapping in ${DISPLAY_MODULE}`)
  }
  for (const row of corpus.displayRows) {
    if (RETIRED_PRESET_IDS.includes(row.id)) {
      failures.push(`${DISPLAY_MODULE} still maps the retired preset id \`${row.id}\``)
    } else if (!shipped.has(row.id)) {
      failures.push(`${DISPLAY_MODULE} maps \`${row.id}\`, which is not a shipped preset`)
    }
  }

  const expected = new Set(corpus.displayRows.flatMap(row => [row.nameKey, row.descriptionKey]))
  for (const [file, keys] of Object.entries(corpus.dictionaryKeys)) {
    const declared = new Set(keys)
    for (const key of expected) {
      if (!declared.has(key)) failures.push(`${file} is missing copy key \`${key}\``)
    }
    for (const key of keys) {
      if (isPresetCopyKey(key) && !expected.has(key)) {
        failures.push(`${file} carries preset copy key \`${key}\`, which no shipped preset maps`)
      }
    }
    for (const id of new Set(copyKeyPresetIds(keys))) {
      if (RETIRED_PRESET_IDS.includes(id)) {
        failures.push(`${file} carries copy for the retired preset id \`${id}\``)
      }
    }
  }
  return failures
}

const shippedIds = globSync(`${PRESETS_DIR}/*/preset.yml`, { cwd: root })
  .map(path => path.slice(PRESETS_DIR.length + 1, path.indexOf('/preset.yml')))
  .sort()
const dictionaryKeys = Object.fromEntries(DICTIONARIES.map(file => [
  file,
  parseDictionaryKeys(readFileSync(resolve(root, file), 'utf8')),
]))
const failures = checkPresetCopy({
  shippedIds,
  displayRows: parseDisplayRows(readFileSync(resolve(root, DISPLAY_MODULE), 'utf8')),
  dictionaryKeys,
})

if (failures.length > 0) {
  console.error('verify-preset-copy: violations found:')
  for (const failure of failures) console.error(`  ${failure}`)
  process.exit(1)
}
console.log(`verify-preset-copy: ${shippedIds.length} shipped preset(s) (${shippedIds.join(', ') || 'none'}) match the display map and ${DICTIONARIES.length} dictionaries.`)
