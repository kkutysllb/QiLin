/**
 * The version family's boundary and the manifest rewrite: which manifests the
 * root version governs, and that a rewrite touches only the version field.
 */
import { describe, expect, it } from 'vitest'
import { inVersionFamily, withVersion } from './set-version.ts'

describe('inVersionFamily', () => {
  it('admits the root manifest and every @qilin package', () => {
    expect(inVersionFamily({})).toBe(true)
    expect(inVersionFamily({ name: '@qilin/cli' })).toBe(true)
    expect(inVersionFamily({ name: '@qilin/llm-pi-ai' })).toBe(true)
    expect(inVersionFamily({ name: '@qilin/experimental-auto-review' })).toBe(true)
  })

  it('refuses a manifest the root version does not govern', () => {
    expect(inVersionFamily({ name: 'dsh-animations' })).toBe(false)
    expect(inVersionFamily({ name: '@earendil-works/pi-ai' })).toBe(false)
  })
})

describe('withVersion', () => {
  it('rewrites only the version field', () => {
    const manifest = '{\n  "name": "@qilin/cli",\n  "version": "3.0.4",\n  "license": "MIT"\n}\n'
    expect(withVersion(manifest, '3.0.5')).toBe(
      '{\n  "name": "@qilin/cli",\n  "version": "3.0.5",\n  "license": "MIT"\n}\n',
    )
  })

  it('does not touch a nested dependency version that precedes the field', () => {
    const manifest = '{\n  "dependencies": { "x": { "version": "1.0.0" } },\n  "version": "3.0.4"\n}\n'
    expect(withVersion(manifest, '3.0.5')).toContain('"version": "1.0.0"')
  })

  it('fails loud on a manifest without a version field', () => {
    expect(() => withVersion('{\n  "name": "x"\n}\n', '3.0.5')).toThrow(/no "version" field/)
  })
})
