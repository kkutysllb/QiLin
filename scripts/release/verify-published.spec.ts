import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { tarballName } from './families.ts'
import {
  readPackedMembers,
  requiredRanges,
  verifyPublishedResolution,
  type PublishedMember,
  type PublishedSections,
  type RegistrySnapshot,
} from './verify-published.ts'

/** A registry that always answers with the given facts and nothing else. */
function fakeRegistry(
  versions: Readonly<Record<string, readonly string[]>>,
  sections: Readonly<Record<string, PublishedSections | undefined>>,
): RegistrySnapshot {
  return {
    async versions(name) {
      return versions[name]
    },
    async sections(name, version) {
      return sections[`${name}@${version}`]
    },
  }
}

describe('requiredRanges', () => {
  it('collects in-scope sections and drops external and optional-peer entries', () => {
    const ranges = requiredRanges({
      dependencies: { '@qilin-agent/brand': '3.1.7', debug: '^4.0.0' },
      optionalDependencies: { '@qilin-agent/libreoffice-kit-darwin-arm64': '~0.1.5' },
      peerDependencies: { '@qilin-agent/kylin': '~4.0.5', '@qilin-agent/scope': '3.1.7' },
      peerDependenciesMeta: { '@qilin-agent/scope': { optional: true } },
    })
    expect(ranges).toEqual([
      ['dependencies', '@qilin-agent/brand', '3.1.7'],
      ['optionalDependencies', '@qilin-agent/libreoffice-kit-darwin-arm64', '~0.1.5'],
      ['peerDependencies', '@qilin-agent/kylin', '~4.0.5'],
    ])
  })

  it('returns nothing for a package without @qilin-agent declarations', () => {
    expect(requiredRanges({ dependencies: { debug: '^4.0.0' } })).toEqual([])
  })
})

describe('verifyPublishedResolution', () => {
  it('rejects the 3.1.7 incident shape: a peer range the registry cannot satisfy', async () => {
    const report = await verifyPublishedResolution(
      [{ name: '@qilin-agent/subagent-codex', version: '3.1.7' }],
      fakeRegistry(
        { '@qilin-agent/kylin': ['4.0.3'] },
        {
          '@qilin-agent/subagent-codex@3.1.7': {
            peerDependencies: { '@qilin-agent/kylin': '~4.0.5' },
          },
        },
      ),
    )
    expect(report.checked).toBe(1)
    expect(report.missingMembers).toEqual([])
    expect(report.unresolved).toEqual([
      {
        consumer: '@qilin-agent/subagent-codex@3.1.7',
        section: 'peerDependencies',
        dependency: '@qilin-agent/kylin',
        range: '~4.0.5',
      },
    ])
  })

  it('reports a member whose own version the publish run never landed', async () => {
    const report = await verifyPublishedResolution(
      [{ name: '@qilin-agent/session', version: '3.1.7' }],
      fakeRegistry({}, {}),
    )
    expect(report.checked).toBe(0)
    expect(report.missingMembers).toEqual(['@qilin-agent/session@3.1.7'])
    expect(report.unresolved).toEqual([])
  })

  it('accepts a set whose dependency, optional, and peer ranges all resolve', async () => {
    const report = await verifyPublishedResolution(
      [{ name: '@qilin-agent/agent', version: '3.1.7' }],
      fakeRegistry(
        {
          '@qilin-agent/kylin': ['4.0.3', '4.0.5'],
          '@qilin-agent/session': ['3.1.7'],
          '@qilin-agent/libreoffice-kit-darwin-arm64': ['0.1.5'],
        },
        {
          '@qilin-agent/agent@3.1.7': {
            dependencies: { '@qilin-agent/session': '3.1.7' },
            optionalDependencies: { '@qilin-agent/libreoffice-kit-darwin-arm64': '~0.1.5' },
            peerDependencies: { '@qilin-agent/kylin': '~4.0.5' },
          },
        },
      ),
    )
    expect(report).toEqual({ checked: 1, missingMembers: [], unresolved: [] })
  })

  it('reports an unresolved optional dependency, because a skipped engine is a broken release', async () => {
    const report = await verifyPublishedResolution(
      [{ name: '@qilin-agent/sandbox-local', version: '3.1.7' }],
      fakeRegistry(
        { '@qilin-agent/kylin': ['4.0.5'] },
        {
          '@qilin-agent/sandbox-local@3.1.7': {
            optionalDependencies: { '@qilin-agent/landlock-entry': '~0.1.0' },
            peerDependencies: { '@qilin-agent/kylin': '~4.0.5' },
          },
        },
      ),
    )
    expect(report.unresolved).toEqual([
      {
        consumer: '@qilin-agent/sandbox-local@3.1.7',
        section: 'optionalDependencies',
        dependency: '@qilin-agent/landlock-entry',
        range: '~0.1.0',
      },
    ])
  })

  it('ignores an unresolvable external range, which npm resolves against its own registry', async () => {
    const report = await verifyPublishedResolution(
      [{ name: '@qilin-agent/session', version: '3.1.7' }],
      fakeRegistry(
        {},
        { '@qilin-agent/session@3.1.7': { dependencies: { debug: '^999.0.0' } } },
      ),
    )
    expect(report).toEqual({ checked: 1, missingMembers: [], unresolved: [] })
  })
})

describe('readPackedMembers', () => {
  const workspace = mkdtempSync(join(tmpdir(), 'verify-published-spec-'))
  const directory = join(workspace, 'dist', 'npm')

  /** Adapt a packed member to the release-family shape `tarballName` reads. */
  const packedTarballName = (member: PublishedMember): string =>
    tarballName({ ...member, directory: '', manifest: {} })

  afterAll(() => {
    rmSync(workspace, { recursive: true, force: true })
  })

  it('reads tarball identities in upload order and skips the order file itself', () => {
    mkdirSync(directory, { recursive: true })
    const members: readonly PublishedMember[] = [
      { name: '@qilin-agent/cosmokit', version: '1.8.6' },
      { name: '@qilin-agent/kylin', version: '4.0.5' },
    ]
    for (const member of members) {
      const staging = join(workspace, `${member.name.replaceAll('/', '-')}-staging`)
      mkdirSync(join(staging, 'package'), { recursive: true })
      writeFileSync(
        join(staging, 'package', 'package.json'),
        JSON.stringify({ name: member.name, version: member.version }),
      )
      const packed = join(directory, packedTarballName(member))
      const tar = spawnSync('tar', ['-czf', packed, '-C', staging, 'package'])
      if (tar.status !== 0) throw new Error(`tar failed: ${tar.stderr}`)
      rmSync(staging, { recursive: true, force: true })
    }
    writeFileSync(
      join(directory, 'publish-order.txt'),
      `${members.map(packedTarballName).join('\n')}\n`,
    )
    expect(readPackedMembers(directory)).toEqual(members)
  })
})
