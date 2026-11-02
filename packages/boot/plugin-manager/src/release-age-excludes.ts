/**
 * Keep pnpm's release-age exclusion list effective for every profile operation.
 *
 * pnpm 11 matches `minimumReleaseAgeExclude` entries by bare package name: a
 * `name@version` entry never exempts anything, so a profile that recorded one
 * fails its lockfile supply-chain check as soon as that version leaves the
 * release-age window. This module rewrites the list before pnpm runs, folding
 * every versioned entry into its bare name and adding the packages this
 * operation selects.
 * @module @qilin-agent/plugin-manager/release-age-excludes
 */

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { isMap, isScalar, isSeq, parseDocument, Scalar, type Node } from 'yaml'
import { writeFileAtomic } from '@qilin-agent/atomic-write'
import { parseInstallSpec } from './install-spec.ts'

/** The workspace setting pnpm consults before a package may be installed. */
const RELEASE_AGE_EXCLUDE = 'minimumReleaseAgeExclude'

/** Commands whose positionals name the packages the operation selects. */
const SUBJECT_COMMANDS: Readonly<Record<string, 'add' | 'remove'>> = {
  add: 'add',
  install: 'add',
  i: 'add',
  remove: 'remove',
  rm: 'remove',
  uninstall: 'remove',
  un: 'remove',
  update: 'remove',
  up: 'remove',
  upgrade: 'remove',
}

/**
 * The bare package name of one list entry: pnpm ignores anything after '@' once the name starts.
 * @param entry - a package spec such as `left-pad@1.3.0` or `@scope/pkg@2`.
 * @returns the name without its version or alias suffix.
 */
export function barePackageName(entry: string): string {
  const versionAt = entry.indexOf('@', entry.startsWith('@') ? 1 : 0)
  return versionAt <= 0 ? entry : entry.slice(0, versionAt)
}

/**
 * Package names this pnpm invocation selects, from its command positionals.
 * Specs pnpm itself will reject contribute nothing; the run reports them.
 * @param args - pnpm arguments before path anchoring.
 * @returns bare package names in argument order, without duplicates.
 */
export function releaseAgeSubjects(args: readonly string[]): readonly string[] {
  const index = args.findIndex(argument => !argument.startsWith('-'))
  const command = index < 0 ? undefined : args[index]
  if (command === undefined || SUBJECT_COMMANDS[command] === undefined) return []
  const names: string[] = []
  for (const raw of args.slice(index + 1)) {
    if (raw.startsWith('-')) continue
    try {
      const parsed = parseInstallSpec(raw)
      if (parsed.kind === 'registry' && !names.includes(parsed.name)) names.push(parsed.name)
    } catch { /* an unusable spec is the run's own failure to report */ }
  }
  return names
}

/**
 * Fold every versioned release-age exclusion into its bare name and add this
 * operation's packages, preserving order, comments, and unrelated settings.
 * A profile without workspace settings is left alone: nothing consults the list there.
 * @param dir - profile directory holding `pnpm-workspace.yaml`.
 * @param subjects - bare package names the current operation selects.
 * @throws If the file is not a YAML mapping or the list is not a sequence of names; no rewrite happens.
 */
export async function normalizeReleaseAgeExcludes(dir: string, subjects: readonly string[]): Promise<void> {
  const filename = join(dir, 'pnpm-workspace.yaml')
  let text: string
  try { text = await readFile(filename, 'utf8') } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    return
  }
  const document = parseDocument(text)
  if (document.errors[0] !== undefined) throw document.errors[0]
  if (!isMap(document.contents)) throw new Error('pnpm-workspace.yaml must be a YAML mapping')
  const list = document.get(RELEASE_AGE_EXCLUDE, true)
  if (list === undefined) {
    if (subjects.length === 0) return
    document.set(RELEASE_AGE_EXCLUDE, document.createNode([...new Set(subjects)]))
    await writeFileAtomic(filename, String(document), { mode: 0o600 })
    return
  }
  if (!isSeq(list)) throw new Error(`${RELEASE_AGE_EXCLUDE} must be a YAML sequence`)
  const kept: Node[] = []
  const seen = new Set<string>()
  let changed = false
  for (const item of list.items) {
    if (!isScalar(item) || typeof item.value !== 'string' || item.value.trim() === '') {
      throw new Error(`${RELEASE_AGE_EXCLUDE} must contain package names`)
    }
    const bare = barePackageName(item.value.trim())
    if (seen.has(bare)) { changed = true; continue }
    seen.add(bare)
    if (bare !== item.value) { item.value = bare; changed = true }
    kept.push(item)
  }
  for (const subject of subjects) {
    if (seen.has(subject)) continue
    seen.add(subject)
    kept.push(new Scalar(subject))
    changed = true
  }
  if (!changed) return
  list.items = kept
  await writeFileAtomic(filename, String(document), { mode: 0o600 })
}
