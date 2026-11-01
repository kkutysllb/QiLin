/** Release-age exclusions stay effective: pnpm 11 matches bare names only. */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { expect, it, onTestFinished } from 'vitest'
import { parse } from 'yaml'
import {
  barePackageName, normalizeReleaseAgeExcludes, releaseAgeSubjects,
} from '../src/release-age-excludes.ts'

function fixture(text?: string) {
  const dir = mkdtempSync(join(tmpdir(), 'release-age-excludes-'))
  onTestFinished(() => { rmSync(dir, { recursive: true, force: true }) })
  const filename = join(dir, 'pnpm-workspace.yaml')
  if (text !== undefined) writeFileSync(filename, text)
  return { dir, filename }
}

const WORKSPACE = `# profile release policy
minimumReleaseAge: 1440
minimumReleaseAgeExclude:
  - dsh-kylin-media@0.1.1
  - other-plugin@1.0.0
  - dsh-kylin-media@0.2.0
  - keeper
  - '@scope/tool@2.0.0'
  - dsh-kylin-media@0.3.0
nodeLinker: hoisted
allowBuilds:
  native: true
`

it('folds every versioned entry into one bare name and keeps the rest of the file intact', async () => {
  const { dir, filename } = fixture(WORKSPACE)
  await normalizeReleaseAgeExcludes(dir, [])
  const text = readFileSync(filename, 'utf8')
  expect(text).toContain('# profile release policy')
  expect(parse(text)).toEqual({
    minimumReleaseAge: 1440,
    minimumReleaseAgeExclude: ['dsh-kylin-media', 'other-plugin', 'keeper', '@scope/tool'],
    nodeLinker: 'hoisted',
    allowBuilds: { native: true },
  })
})

it('adds the operation package as a bare name after the existing entries', async () => {
  const { dir, filename } = fixture(WORKSPACE)
  await normalizeReleaseAgeExcludes(dir, ['dsh-kylin-media', 'fresh-plugin'])
  expect((parse(readFileSync(filename, 'utf8')) as { readonly minimumReleaseAgeExclude: readonly string[] })
    .minimumReleaseAgeExclude).toEqual(['dsh-kylin-media', 'other-plugin', 'keeper', '@scope/tool', 'fresh-plugin'])
})

it('writes the list for a profile that has workspace settings but no exclusions', async () => {
  const { dir, filename } = fixture('nodeLinker: hoisted\n')
  await normalizeReleaseAgeExcludes(dir, ['fresh-plugin'])
  expect(parse(readFileSync(filename, 'utf8'))).toEqual({
    nodeLinker: 'hoisted',
    minimumReleaseAgeExclude: ['fresh-plugin'],
  })
})

it('leaves a profile without workspace settings alone', async () => {
  const { dir, filename } = fixture()
  await normalizeReleaseAgeExcludes(dir, ['fresh-plugin'])
  expect(() => readFileSync(filename, 'utf8')).toThrow()
})

it('rewrites nothing when the list is already bare and complete', async () => {
  const original = 'minimumReleaseAgeExclude:\n  - keeper\n'
  const { dir, filename } = fixture(original)
  await normalizeReleaseAgeExcludes(dir, ['keeper'])
  expect(readFileSync(filename, 'utf8')).toBe(original)
})

it.each(['[', '[]\n', 'minimumReleaseAgeExclude: keeper\n', 'minimumReleaseAgeExclude: [3]\n'])(
  'rejects malformed workspace settings without rewriting them: %s',
  async (text) => {
    const { dir, filename } = fixture(text)
    await expect(normalizeReleaseAgeExcludes(dir, ['keeper'])).rejects.toThrow()
    expect(readFileSync(filename, 'utf8')).toBe(text)
  },
)

it('reports unreadable workspace settings', async () => {
  const { dir, filename } = fixture()
  mkdirSync(filename)
  await expect(normalizeReleaseAgeExcludes(dir, ['keeper'])).rejects.toThrow()
})

it.each([
  ['plugin', 'plugin'],
  ['plugin@1.2.3', 'plugin'],
  ['@scope/plugin', '@scope/plugin'],
  ['@scope/plugin@1.2.3', '@scope/plugin'],
  ['plugin@file:../plugin.tgz', 'plugin'],
])('reads the bare name of %s as %s', (entry, bare) => {
  expect(barePackageName(entry)).toBe(bare)
})

it('names the packages an install or removal selects', () => {
  expect(releaseAgeSubjects(['add', 'plugin@1.2.3', '--save-exact', '@scope/other@2.0.0']))
    .toEqual(['plugin', '@scope/other'])
  expect(releaseAgeSubjects(['remove', 'plugin', '--config.registry=https://r.example'])).toEqual(['plugin'])
  expect(releaseAgeSubjects(['update', 'plugin'])).toEqual(['plugin'])
  expect(releaseAgeSubjects(['install'])).toEqual([])
  expect(releaseAgeSubjects([])).toEqual([])
  expect(releaseAgeSubjects(['--frozen-lockfile'])).toEqual([])
  expect(releaseAgeSubjects(['add', '/absolute/path', 'plugin'])).toEqual(['plugin'])
  expect(releaseAgeSubjects(['add', 'not a name'])).toEqual([])
})
