import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  McpServerNameError,
  UserPatchFile,
  UserPatchFileError,
  describeEntry,
  entryIdOf,
  userPatchPath,
  type UserPatchEntry,
} from '../src/patch-file.ts'

const roots: string[] = []

function home(): string {
  const dir = mkdtempSync(join(tmpdir(), 'qilin-mcp-servers-'))
  roots.push(dir)
  return dir
}

/** One layer holding an unrelated patch, a hand-written dynamic server, and a comment. */
const HAND_WRITTEN = [
  '# machine-local preferences',
  '- id: web-search',
  '  disabled: true',
  '',
  '- insert:',
  '    - id: mcp-existing',
  "      name: '@qilin/mcp-client'",
  '      config:',
  '        transport: stdio',
  '        serverName: existing',
  '        command: !!js process.execPath',
  "        args: !!js '[process.env.FIXTURE]'",
  '        env:',
  '          TOKEN: sekret',
  '        failOnStartupError: true',
  '',
].join('\n')

function layer(content: string): { file: UserPatchFile; path: string } {
  const path = join(home(), 'cordis.patch.yml')
  writeFileSync(path, content)
  return { file: new UserPatchFile(path), path }
}

function text(path: string): string {
  return readFileSync(path, 'utf8')
}

async function entries(file: UserPatchFile): Promise<readonly UserPatchEntry[]> {
  return (await file.read()).entries
}

afterEach(() => {
  for (const dir of roots.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('userPatchPath', () => {
  it('resolves the home-level layer under the configured QiLin home', () => {
    const previous = process.env.QILIN_HOME
    process.env.QILIN_HOME = home()
    try {
      expect(userPatchPath()).toBe(join(process.env.QILIN_HOME, 'cordis.patch.yml'))
    } finally {
      if (previous === undefined) delete process.env.QILIN_HOME
      else process.env.QILIN_HOME = previous
    }
  })
})

describe('entryIdOf', () => {
  it('names the Loader entry after the namespace it reserves', () => {
    expect(entryIdOf('context7')).toBe('mcp-context7')
  })
})

describe('UserPatchFile.read', () => {
  it('reads the entries one layer declares, with their config and enablement', async () => {
    const { file } = layer(HAND_WRITTEN)
    expect(await entries(file)).toEqual([
      {
        serverName: 'existing',
        entryId: 'mcp-existing',
        config: {
          transport: 'stdio',
          serverName: 'existing',
          command: 'process.execPath',
          args: '[process.env.FIXTURE]',
          env: { TOKEN: 'sekret' },
          failOnStartupError: true,
        },
        enabled: true,
      },
    ])
  })

  it('reads an absent layer as no entries', async () => {
    const file = new UserPatchFile(join(home(), 'cordis.patch.yml'))
    expect(await file.read()).toEqual({ entries: [] })
  })

  it('reads a layer holding only comments as no entries', async () => {
    const { file } = layer('# nothing configured yet\n')
    expect(await file.read()).toEqual({ entries: [] })
  })

  it('takes the namespace from the config, falling back to the entry id suffix', async () => {
    const { file } = layer([
      '- insert:',
      '    - id: mcp-from-id',
      "      name: '@qilin/mcp-client'",
      '      config:',
      '        transport: stdio',
      '        command: npx',
      '    - id: mcp-labelled',
      "      name: '@qilin/mcp-client'",
      '      config:',
      '        transport: stdio',
      '        serverName: renamed',
      '        command: npx',
      '',
    ].join('\n'))
    expect((await entries(file)).map(entry => entry.serverName)).toEqual(['from-id', 'renamed'])
  })

  it('reports a disabled entry and reads a non-map config as empty', async () => {
    const { file } = layer([
      '- insert:',
      '    - id: mcp-off',
      "      name: '@qilin/mcp-client'",
      '      disabled: true',
      '      config: 5',
      '',
    ].join('\n'))
    expect(await entries(file)).toEqual([
      { serverName: 'off', entryId: 'mcp-off', config: {}, enabled: false },
    ])
  })

  it('ignores rows another layer owns and rows that are not mappings', async () => {
    const { file } = layer([
      '- insert:',
      '    - not-a-row',
      '    - id: mcp-other',
      "      name: '@other/mcp'",
      "    - name: '@qilin/mcp-client'",
      '    - id: other-id',
      "      name: '@qilin/mcp-client'",
      '- id: plain-entry',
      '  disabled: true',
      '- insert: 5',
      '',
    ].join('\n'))
    expect(await entries(file)).toEqual([])
  })

  it('ignores a top-level item that is not a patch mapping', async () => {
    const { file } = layer([
      '- plain-scalar',
      '- insert:',
      '    - id: mcp-kept',
      "      name: '@qilin/mcp-client'",
      '      config:',
      '        transport: stdio',
      '        command: npx',
      '',
    ].join('\n'))
    expect((await entries(file)).map(entry => entry.serverName)).toEqual(['kept'])
    expect(await file.remove('kept')).toBe(true)
    expect(await entries(file)).toEqual([])
  })

  it('reports a layer that is not valid YAML', async () => {
    const { file } = layer('- insert:\n    - id: [\n')
    const read = await file.read()
    expect(read.entries).toEqual([])
    expect(read.error).toMatch(/is not valid YAML/u)
  })

  it('reports a layer that is not a patch list', async () => {
    const { file } = layer('insert: []\n')
    const read = await file.read()
    expect(read.entries).toEqual([])
    expect(read.error).toMatch(/is not a Loader patch list/u)
  })

  it('reports an unreadable layer instead of reporting it as absent', async () => {
    const file = new UserPatchFile(home())
    expect((await file.read()).error).toMatch(/failed to read/u)
  })
})

describe('describeEntry', () => {
  it('describes a stdio entry by its command line', () => {
    expect(describeEntry({
      serverName: 'existing',
      entryId: 'mcp-existing',
      config: { transport: 'stdio', command: 'npx', args: ['-y', 'server'] },
      enabled: true,
    })).toEqual({ transport: 'stdio', detail: 'npx -y server' })
  })

  it('falls back to the namespace for a command-less entry and to an empty URL for a non-string one', () => {
    expect(describeEntry({
      serverName: 'bare',
      entryId: 'mcp-bare',
      config: {},
      enabled: true,
    })).toEqual({ transport: 'stdio', detail: 'bare' })
    expect(describeEntry({
      serverName: 'remote',
      entryId: 'mcp-remote',
      config: { transport: 'streamable-http', url: 5 },
      enabled: true,
    })).toEqual({ transport: 'streamable-http', detail: '' })
  })

  it('drops argument entries that are not strings', () => {
    expect(describeEntry({
      serverName: 'mixed',
      entryId: 'mcp-mixed',
      config: { transport: 'stdio', command: 'npx', args: ['-y', 5] },
      enabled: true,
    })).toEqual({ transport: 'stdio', detail: 'npx -y' })
  })
})

describe('UserPatchFile.upsert', () => {
  it('appends a new entry inside an insert item', async () => {
    const { file, path } = layer(HAND_WRITTEN)
    await file.upsert({
      serverName: 'context7',
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@upstash/context7-mcp'],
      failOnStartupError: true,
    })
    expect(await entries(file)).toEqual(expect.arrayContaining([
      expect.objectContaining({
        serverName: 'context7',
        entryId: 'mcp-context7',
        config: {
          transport: 'stdio',
          serverName: 'context7',
          command: 'npx',
          args: ['-y', '@upstash/context7-mcp'],
          failOnStartupError: true,
        },
        enabled: true,
      }),
    ]))
    expect(text(path)).toContain('        serverName: context7\n')
  })

  it('leaves every node it does not address byte-identical', async () => {
    const { file, path } = layer(HAND_WRITTEN)
    await file.upsert({ serverName: 'added', transport: 'stdio', command: 'uvx' })
    const written = text(path)
    expect(written.startsWith('# machine-local preferences\n- id: web-search\n  disabled: true\n')).toBe(true)
    expect(written).toContain('        command: !!js process.execPath')
    expect(written).toContain("        args: !!js '[process.env.FIXTURE]'")
    expect(written).toContain('          TOKEN: sekret')
    expect(written.endsWith('\n')).toBe(true)
  })

  it('replaces managed keys in place and keeps keys it does not own', async () => {
    const { file, path } = layer(HAND_WRITTEN)
    await file.upsert({
      serverName: 'existing',
      transport: 'stdio',
      command: 'node',
      args: ['server.js'],
    })
    const [entry] = await entries(file)
    expect(entry?.config).toEqual({
      serverName: 'existing',
      transport: 'stdio',
      command: 'node',
      args: ['server.js'],
      env: { TOKEN: 'sekret' },
    })
    expect(text(path)).toContain('          TOKEN: sekret')
  })

  it('drops the keys the other transport owns when a server changes transport', async () => {
    const { file } = layer(HAND_WRITTEN)
    await file.upsert({ serverName: 'existing', transport: 'streamable-http', url: 'https://example.test/mcp' })
    const [entry] = await entries(file)
    expect(entry?.config).toEqual({
      serverName: 'existing',
      transport: 'streamable-http',
      url: 'https://example.test/mcp',
      env: { TOKEN: 'sekret' },
    })
  })

  it('replaces a config node that is not a mapping', async () => {
    const { file } = layer([
      '- insert:',
      '    - id: mcp-broken',
      "      name: '@qilin/mcp-client'",
      '      config: 5',
      '',
    ].join('\n'))
    await file.upsert({ serverName: 'broken', transport: 'stdio', command: 'npx' })
    const [entry] = await entries(file)
    expect(entry?.config).toEqual({ transport: 'stdio', serverName: 'broken', command: 'npx' })
  })

  it('writes an empty command for a stdio draft that names none', async () => {
    const { file } = layer(HAND_WRITTEN)
    await file.upsert({ serverName: 'bare', transport: 'stdio' })
    const entry = (await entries(file)).find(candidate => candidate.serverName === 'bare')
    expect(entry?.config).toEqual({ transport: 'stdio', serverName: 'bare', command: '' })
  })

  it('writes a stated tool-call timeout and the empty URL of a Streamable HTTP draft', async () => {
    const { file } = layer(HAND_WRITTEN)
    await file.upsert({ serverName: 'timed', transport: 'stdio', command: 'npx', toolCallTimeoutMs: 30000 })
    await file.upsert({ serverName: 'remote', transport: 'streamable-http' })
    const written = await entries(file)
    expect(written.find(entry => entry.serverName === 'timed')?.config).toEqual({
      transport: 'stdio',
      serverName: 'timed',
      command: 'npx',
      toolCallTimeoutMs: 30000,
    })
    expect(written.find(entry => entry.serverName === 'remote')?.config).toEqual({
      transport: 'streamable-http',
      serverName: 'remote',
      url: '',
    })
  })

  it('omits an empty argument list and an empty working directory', async () => {
    const { file } = layer(HAND_WRITTEN)
    await file.upsert({ serverName: 'bare', transport: 'stdio', command: 'npx', args: [], cwd: '' })
    const entry = (await entries(file)).find(candidate => candidate.serverName === 'bare')
    expect(entry?.config).toEqual({ transport: 'stdio', serverName: 'bare', command: 'npx' })
  })

  it('creates the layer when the QiLin home has none, owner-only and newline-terminated', async () => {
    const path = join(home(), 'cordis.patch.yml')
    const file = new UserPatchFile(path)
    await file.upsert({ serverName: 'first', transport: 'stdio', command: 'npx', cwd: '/tmp' })
    const written = text(path)
    expect(written.endsWith('\n')).toBe(true)
    expect(statSync(path).mode & 0o777).toBe(0o600)
    expect(await entries(file)).toEqual([
      {
        serverName: 'first',
        entryId: 'mcp-first',
        config: { transport: 'stdio', serverName: 'first', command: 'npx', cwd: '/tmp' },
        enabled: true,
      },
    ])
  })

  it('keeps the comments of a layer that holds no entries yet', async () => {
    const { file, path } = layer('# keep me\n')
    await file.upsert({ serverName: 'added', transport: 'stdio', command: 'npx' })
    expect(text(path).startsWith('# keep me\n')).toBe(true)
  })

  it('refuses a namespace the Loader would reject, without touching the layer', async () => {
    const { file, path } = layer(HAND_WRITTEN)
    await expect(file.upsert({ serverName: 'not valid', transport: 'stdio', command: 'npx' }))
      .rejects.toThrow(McpServerNameError)
    expect(text(path)).toBe(HAND_WRITTEN)
  })

  it('refuses a layer it must not overwrite', async () => {
    const { file, path } = layer('insert: []\n')
    await expect(file.upsert({ serverName: 'added', transport: 'stdio', command: 'npx' }))
      .rejects.toThrow(UserPatchFileError)
    expect(text(path)).toBe('insert: []\n')
  })

  it('lands two concurrent writes instead of losing one', async () => {
    const { file } = layer(HAND_WRITTEN)
    await Promise.all([
      file.upsert({ serverName: 'first', transport: 'stdio', command: 'npx' }),
      file.upsert({ serverName: 'second', transport: 'stdio', command: 'npx' }),
    ])
    expect((await entries(file)).map(entry => entry.serverName).sort()).toEqual(['existing', 'first', 'second'])
  })

  it('keeps the queue usable after a rejected write', async () => {
    const { file } = layer('insert: []\n')
    await expect(file.upsert({ serverName: 'bad name', transport: 'stdio', command: 'npx' }))
      .rejects.toThrow(McpServerNameError)
    await expect(file.upsert({ serverName: 'good', transport: 'stdio', command: 'npx' }))
      .rejects.toThrow(UserPatchFileError)
  })
})

describe('UserPatchFile.remove', () => {
  it('drops the entry and the insert item that held only it', async () => {
    const { file, path } = layer(HAND_WRITTEN)
    expect(await file.remove('existing')).toBe(true)
    expect(await entries(file)).toEqual([])
    expect(text(path)).toBe('# machine-local preferences\n- id: web-search\n  disabled: true\n')
  })

  it('keeps the insert item that still holds another entry', async () => {
    const { file, path } = layer(HAND_WRITTEN)
    await file.upsert({ serverName: 'added', transport: 'stdio', command: 'npx' })
    expect(await file.remove('existing')).toBe(true)
    expect((await entries(file)).map(entry => entry.serverName)).toEqual(['added'])
    expect(text(path)).toContain('        serverName: added')
  })

  it('keeps an insert item one of whose two entries survives', async () => {
    const { file, path } = layer([
      '- insert:',
      '    - id: mcp-one',
      "      name: '@qilin/mcp-client'",
      '      config:',
      '        transport: stdio',
      '        serverName: one',
      '        command: npx',
      '    - id: mcp-two',
      "      name: '@qilin/mcp-client'",
      '      config:',
      '        transport: stdio',
      '        serverName: two',
      '        command: npx',
      '',
    ].join('\n'))
    expect(await file.remove('one')).toBe(true)
    expect((await entries(file)).map(entry => entry.serverName)).toEqual(['two'])
    expect(text(path)).toContain('- insert:')
  })

  it('reports an unknown namespace without writing', async () => {
    const { file, path } = layer(HAND_WRITTEN)
    expect(await file.remove('absent')).toBe(false)
    expect(text(path)).toBe(HAND_WRITTEN)
  })
})

describe('UserPatchFile.setEnabled', () => {
  it('disables an entry through its own disabled key and enables it again', async () => {
    const { file, path } = layer(HAND_WRITTEN)
    await file.setEnabled('existing', false)
    expect(text(path)).toContain('      disabled: true\n')
    expect((await entries(file))[0]?.enabled).toBe(false)
    await file.setEnabled('existing', true)
    expect(text(path)).not.toContain('disabled: true\n      config:')
    expect((await entries(file))[0]?.enabled).toBe(true)
  })

  it('refuses a namespace the layer does not declare', async () => {
    const { file } = layer(HAND_WRITTEN)
    await expect(file.setEnabled('absent', false)).rejects.toThrow(/declares no MCP server named/u)
  })
})

describe('UserPatchFile.addBuiltin', () => {
  const definition = { id: 'fetch', name: 'fetch', command: 'uvx', args: ['mcp-server-fetch'] }

  it('adds a recommended server as an enabled stdio entry', async () => {
    const { file } = layer(HAND_WRITTEN)
    expect(await file.addBuiltin(definition)).toBe(true)
    expect((await entries(file)).find(entry => entry.serverName === 'fetch')).toEqual({
      serverName: 'fetch',
      entryId: 'mcp-fetch',
      config: {
        transport: 'stdio',
        serverName: 'fetch',
        command: 'uvx',
        args: ['mcp-server-fetch'],
      },
      enabled: true,
    })
  })

  it('leaves a server the user already configured exactly as it is', async () => {
    const { file, path } = layer(HAND_WRITTEN)
    await file.upsert({ serverName: 'fetch', transport: 'stdio', command: 'node', args: ['mine.js'] })
    const before = text(path)
    expect(await file.addBuiltin(definition)).toBe(false)
    expect(text(path)).toBe(before)
  })
})
