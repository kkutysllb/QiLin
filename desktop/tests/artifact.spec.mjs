// tests/artifact.spec.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { findLeaks } from '../scripts/check-source-leakage.mjs'
import { parseArtifactReport } from '../scripts/verify-artifact.mjs'

test('泄漏扫描命中 .ts 源码与 git 元数据', () => {
  const leaks = findLeaks([
    'app/resources/qilin/node_modules/x/lib.js',
    'app/resources/qilin/node_modules/x/src/foo.ts',
    'app/.git/HEAD',
  ])
  assert.deepEqual(leaks, [
    'app/resources/qilin/node_modules/x/src/foo.ts',
    'app/.git/HEAD',
  ])
})

test('泄漏扫描覆盖全部 TypeScript 源形式', () => {
  const leaks = findLeaks([
    'app/renderer/Chat.tsx',
    'app/loader.mts',
    'app/shim.cts',
    'app/types/api.d.ts',
    'app/lib.js',
    'app/style.css',
  ])
  assert.deepEqual(leaks, [
    'app/renderer/Chat.tsx',
    'app/loader.mts',
    'app/shim.cts',
    'app/types/api.d.ts',
  ])
})

test('清单校验：commit 形态与版本绑定', () => {
  const runtime = { qilinCommit: 'a'.repeat(40), qilinVersion: '3.2.0' }
  assert.throws(() => parseArtifactReport({ runtime: { ...runtime, qilinCommit: 'nope' } }), /40-char sha/)
  assert.throws(() => parseArtifactReport({ runtime, expected: { version: '3.1.3' } }), /version mismatch/)
  assert.deepEqual(parseArtifactReport({ runtime, expected: { version: '3.2.0' } }), { ok: true })
  assert.deepEqual(parseArtifactReport({ runtime }), { ok: true })
})
