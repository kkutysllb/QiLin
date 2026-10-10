// tests/packaged-source-mirror.spec.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const MIRRORED = ['main', 'host', 'preload', 'renderer']

/** Report every name and byte that differs between a shell source directory and its packaged copy. */
export function mirrorDrift(dir, root = ROOT) {
  const sources = readdirSync(join(root, dir)).sort()
  const packaged = readdirSync(join(root, 'package/app', dir)).sort()
  if (sources.join('\u0000') !== packaged.join('\u0000')) return [`${dir}: file list differs`]
  return sources
    .filter(name => readFileSync(join(root, dir, name), 'utf8') !== readFileSync(join(root, 'package/app', dir, name), 'utf8'))
    .map(name => `${dir}/${name}`)
}

// build-desktop.sh step 3 rebuilds package/app/** by copy, so the committed mirror
// is the last build's snapshot: drift misreports what a release packages.
test('打包快照与开发源码逐字一致', () => {
  assert.deepEqual(MIRRORED.flatMap(dir => mirrorDrift(dir)), [])
})

test('对账报出被改动与被删除的文件', () => {
  const root = mkdtempSync(join(tmpdir(), 'qilin-mirror-'))
  try {
    for (const at of ['main', 'package/app/main']) mkdirSync(join(root, at), { recursive: true })
    for (const name of ['a.mjs', 'b.mjs']) writeFileSync(join(root, 'main', name), 'same')
    for (const name of ['a.mjs', 'b.mjs']) writeFileSync(join(root, 'package/app/main', name), 'same')
    assert.deepEqual(mirrorDrift('main', root), [])
    writeFileSync(join(root, 'package/app/main/b.mjs'), 'changed')
    assert.deepEqual(mirrorDrift('main', root), ['main/b.mjs'])
    rmSync(join(root, 'package/app/main/b.mjs'))
    assert.deepEqual(mirrorDrift('main', root), ['main: file list differs'])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
