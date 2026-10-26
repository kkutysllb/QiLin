/**
 * Doc-sync gate for the shipped agent presets: the preset directories, the
 * id→copy-key mapping in `@qilin-agent/agent-presets/display`, and every client
 * dictionary that renders that copy must name exactly the same set, and no
 * retired preset id may keep a copy key behind.
 */

import { globSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')

/** Preset ids the product no longer ships. */
const RETIRED_PRESET_IDS: readonly string[] = ['cordis', 'minimal']

const PRESETS_DIR = 'packages/preset/agent-presets/presets'

/** One `id: { name: 'key', description: 'key' }` row of the display map. */
const DISPLAY_ROW = /^ {2}([A-Za-z0-9-]+): \{ name: '([^']+)', description: '([^']+)' \},$/

/** One flat `<key>:` entry of a locale dictionary. */
const DICTIONARY_KEY = /^ {2}([A-Za-z][A-Za-z0-9]*):/
const DISPLAY_MODULE = 'packages/preset/agent-presets/src/display.ts'

/**
 * Files that state the shipped preset set outside the three sources above: CLI
 * reference prose, the guides, a lane fixture, and the skill body the preset
 * itself serves to a model. A retired id named as a preset here reaches a reader
 * or a model as a current contract.
 */
const PRESET_CONTRACT_FILES: readonly string[] = [
  'apps/cli/reference/README.md',
  'apps/cli/reference/README.zh.md',
  'apps/cli/tests/fixtures/github-webhook/cordis.yml',
  'apps/cli/tests/github-webhook-real.e2e.ts',
  'docs/user/guide/github-review.md',
  'docs/user/guide/github-review.zh.md',
  'packages/preset/agent-presets/presets/ptc/skills/editing-cordis-compositions/SKILL.md',
]

/** A line that talks about presets at all. */
const NAMES_PRESETS = /\bpresets?\b|agentPreset/u

/**
 * A retired preset id that names a preset, on a line that talks about presets:
 * next to the word, or as an `agentPreset` value. The id must not run into a
 * longer name, so `cordis.patch.yml` and `cordis-composition-reference` are
 * other things.
 */
const RETIRED_ID = String.raw`\b(?:cordis|minimal)\b(?![-.\w])`
/** How far apart a retired id and the word "preset" may stand on one line. */
const RETIRED_PRESET_GAP = String.raw`[^\n]{0,20}`
const RETIRED_PRESET_NAME = new RegExp([
  `${RETIRED_ID}${RETIRED_PRESET_GAP}\\bpresets?\\b`,
  `\\bpresets?\\b${RETIRED_PRESET_GAP}${RETIRED_ID}`,
  String.raw`\bagentPreset: *['"]?(?:cordis|minimal)\b`,
].join('|'), 'u')

/** Every retired preset id one line writes as code. */
const RETIRED_CODE_IDS = /`(?:cordis|minimal)`/gu

/**
 * Find retired preset ids one contract file still names as presets.
 * @param path - repository-relative path, for the message.
 * @param source - the file's text.
 * @returns one message per offending line.
 */
export function checkPresetContractProse(path: string, source: string): string[] {
  const failures: string[] = []
  for (const [index, line] of source.split('\n').entries()) {
    // A line that names the preset set lists it: two retired ids in one line is
    // an enumeration, whatever the surrounding sentence does.
    const enumerated = (line.match(RETIRED_CODE_IDS) ?? []).length > 1
    if (!enumerated && (!NAMES_PRESETS.test(line) || !RETIRED_PRESET_NAME.test(line))) continue
    failures.push(`${path}:${String(index + 1)} names a retired preset id where presets are documented; the deployment ships \`standard\` and \`ptc\``)
  }
  return failures
}

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

/**
 * Shipped preset ids from the `presets/<id>/preset.yml` paths of the scan.
 * `globSync` reports the platform separator, so Windows results arrive with
 * backslashes.
 * @param paths - matched preset metadata paths.
 * @returns preset directory names in the paths' order.
 */
export function shippedPresetIds(paths: readonly string[]): string[] {
  return paths.map((path) => {
    const normalized = path.replaceAll('\\', '/')
    return normalized.slice(PRESETS_DIR.length + 1, normalized.indexOf('/preset.yml'))
  })
}

const shippedIds = shippedPresetIds(globSync(`${PRESETS_DIR}/*/preset.yml`, { cwd: root })).sort()
const dictionaryKeys = Object.fromEntries(DICTIONARIES.map(file => [
  file,
  parseDictionaryKeys(readFileSync(resolve(root, file), 'utf8')),
]))
const failures = [
  ...checkPresetCopy({
    shippedIds,
    displayRows: parseDisplayRows(readFileSync(resolve(root, DISPLAY_MODULE), 'utf8')),
    dictionaryKeys,
  }),
  ...PRESET_CONTRACT_FILES.flatMap(file => checkPresetContractProse(file, readFileSync(resolve(root, file), 'utf8'))),
]

if (failures.length > 0) {
  console.error('verify-preset-copy: violations found:')
  for (const failure of failures) console.error(`  ${failure}`)
  process.exit(1)
}
console.log(`verify-preset-copy: ${shippedIds.length} shipped preset(s) (${shippedIds.join(', ') || 'none'}) match the display map and ${DICTIONARIES.length} dictionaries.`)
