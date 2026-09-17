/** Reading install specs and classifying pnpm failures: pure, table-driven. */

import { describe, expect, it } from 'vitest'
import { classifyInstallFailure, InvalidInstallSpecError, parseInstallSpec } from '@qilin/plugin-manager'

describe('parseInstallSpec', () => {
  it('reads registry names with an optional range, scoped or not', () => {
    expect(parseInstallSpec(' qilin-better-sidebar ')).toEqual({ kind: 'registry', spec: 'qilin-better-sidebar', name: 'qilin-better-sidebar' })
    expect(parseInstallSpec('@acme/qilin-tool@^1.2')).toEqual({ kind: 'registry', spec: '@acme/qilin-tool@^1.2', name: '@acme/qilin-tool', range: '^1.2' })
    expect(parseInstallSpec('pkg@latest')).toEqual({ kind: 'registry', spec: 'pkg@latest', name: 'pkg', range: 'latest' })
  })

  it('reads absolute paths, with or without a file: or link: prefix, and tarballs on disk', () => {
    expect(parseInstallSpec('/plugins/qilin-x')).toEqual({ kind: 'path', spec: '/plugins/qilin-x', path: '/plugins/qilin-x' })
    expect(parseInstallSpec('file:/plugins/qilin-x')).toEqual({ kind: 'path', spec: 'file:/plugins/qilin-x', path: '/plugins/qilin-x' })
    expect(parseInstallSpec('link:/plugins/qilin-x')).toEqual({ kind: 'path', spec: 'link:/plugins/qilin-x', path: '/plugins/qilin-x' })
    expect(parseInstallSpec('/packs/qilin-x-1.0.0.tgz')).toEqual({ kind: 'tarball', spec: '/packs/qilin-x-1.0.0.tgz', path: '/packs/qilin-x-1.0.0.tgz' })
  })

  it('reads git hosts and tarball URLs', () => {
    for (const spec of ['github:someone/qilin-plugin', 'gitlab:a/b#main', 'git+ssh://git@github.com/a/b.git', 'git://host/a/b', 'git@github.com:a/b.git', 'https://github.com/a/b', 'https://github.com/a/b.git#v1']) {
      expect(parseInstallSpec(spec)).toEqual({ kind: 'git', spec })
    }
    expect(parseInstallSpec('https://cdn.example.com/x/y/z/qilin-x-1.0.0.tgz')).toEqual({ kind: 'tarball', spec: 'https://cdn.example.com/x/y/z/qilin-x-1.0.0.tgz' })
  })

  it('refuses what neither the registry nor pnpm would take, naming why', () => {
    const refusal = (spec: string): string => {
      try {
        parseInstallSpec(spec)
      } catch (error) {
        expect(error).toBeInstanceOf(InvalidInstallSpecError)
        const failure = error as InvalidInstallSpecError
        expect(failure.spec).toBe(spec.trim())
        expect(failure.message).toBe(`plugin-manager: ${failure.reason}: ${spec.trim()}`)
        return failure.reason
      }
      throw new Error(`${spec} was accepted`)
    }
    expect(refusal('   ')).toBe('the package spec must not be empty')
    expect(refusal('./qilin-x')).toBe('a local path must be absolute')
    expect(refusal('../qilin-x')).toBe('a local path must be absolute')
    expect(refusal('file:./qilin-x')).toBe('a local path must be absolute')
    expect(refusal('https://example.com/not-a-package')).toBe('a URL must point at a git repository or a tarball')
    expect(refusal('Qilin-Upper')).toBe('not a package name the registry accepts')
    expect(refusal('.hidden')).toBe('not a package name the registry accepts')
    expect(refusal('has space')).toBe('not a package name the registry accepts')
    expect(refusal('a'.repeat(215))).toBe('not a package name the registry accepts')
    expect(refusal('pkg@')).toBe('a version after @ must not be empty')
  })
})

describe('classifyInstallFailure', () => {
  it('names the run\'s end before reading its output, then the most specific code in the output', () => {
    expect(classifyInstallFailure({ log: 'ENOSPC', timedOut: true })).toBe('timeout')
    expect(classifyInstallFailure({ log: '', cause: Object.assign(new Error('spawn pnpm ENOENT'), { code: 'ENOENT' }) })).toBe('pnpm-missing')
    expect(classifyInstallFailure({ log: 'ERR_PNPM_IGNORED_BUILDS  Ignored build scripts: node-pty' })).toBe('build-blocked')
    expect(classifyInstallFailure({ log: 'npm error code E404\nnpm error 404 Not Found - GET https://registry/x' })).toBe('not-found')
    expect(classifyInstallFailure({ log: 'ERR_PNPM_NO_MATCHING_VERSION  No matching version found for x@9' })).toBe('no-matching-version')
    expect(classifyInstallFailure({ log: 'npm error code ETARGET' })).toBe('no-matching-version')
    expect(classifyInstallFailure({ log: 'ENOSPC: no space left on device, write' })).toBe('disk-full')
    expect(classifyInstallFailure({ log: 'EACCES: permission denied, mkdir' })).toBe('permission')
    expect(classifyInstallFailure({ log: 'ERR_PNPM_TARBALL_INTEGRITY  Got sha512-...' })).toBe('integrity')
    expect(classifyInstallFailure({ log: 'ERR_PNPM_META_FETCH_FAIL  GET https://registry/x: request to https://registry/x failed, reason: getaddrinfo ENOTFOUND registry' })).toBe('network')
    expect(classifyInstallFailure({ log: 'ECONNRESET' })).toBe('network')
    expect(classifyInstallFailure({ log: 'ERR_PNPM_FETCH_502  GET https://registry/x: Bad Gateway' })).toBe('network')
    expect(classifyInstallFailure({ log: 'fatal: unable to access https://github.com/a/b/: Could not resolve host' })).toBe('network')
    expect(classifyInstallFailure({ log: 'exited with 1', cause: new Error('no code') })).toBe('unknown')
    expect(classifyInstallFailure({ log: '' })).toBe('unknown')
  })
})
