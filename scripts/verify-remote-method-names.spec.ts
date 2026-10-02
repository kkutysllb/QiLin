/**
 * The Remote method-name gate: the mechanism's reserved surface is read from
 * its own source, and every decorated Host declaration is checked against it.
 */
import { describe, expect, it } from 'vitest'
import {
  collectRemoteMethodNames,
  reservedRemoteMethodNames,
  scanRepository,
} from './verify-remote-method-names.ts'

/** The mechanism's two sources of reserved names, trimmed to their shapes. */
const MECHANISM = `
const REMOTE_NAMESPACE_FIELDS = new Set(['ctx', 'empty', 'methods', 'name', 'namespace'])
class RemoteNamespaceService extends Service {
  private readonly methods = new Map<string, RemoteMethodRecord>()
  static assertMethodAvailable(namespace: string, method: string): void {}
  constructor(ctx: Context, name: string) { super(ctx, name) }
  assertMethodAvailable(method: string): void {}
  get empty(): boolean { return true }
  has(kind: 'direct', method: string): boolean { return true }
  installDirect(): void {}
  installScoped(): void {}
  private install(): void {}
}
`

/** The declaration that stalled the workspaceFiles namespace at boot. */
const SHIPPED_DECLARATION = `class WorkspaceFiles {
  @Remote
  async remove(scope: Scope, path: string, recursive: boolean): Promise<void> {
    await this.ctx.fs.remove(path, { recursive })
  }
}`

describe('reserved surface', () => {
  it('reads the class members and the field set, not a copied list', () => {
    const reserved = reservedRemoteMethodNames(MECHANISM)
    expect(reserved.has('remove')).toBe(false)
    expect(reserved.has('install')).toBe(true)
    expect(reserved.has('installDirect')).toBe(true)
    expect(reserved.has('empty')).toBe(true)
    expect(reserved.has('methods')).toBe(true)
    expect(reserved.has('ctx')).toBe(true)
  })

  it('leaves the constructor out: it is not a name a method can shadow', () => {
    expect(reservedRemoteMethodNames(MECHANISM).has('constructor')).toBe(false)
  })
})

describe('declaration scan', () => {
  it('finds the plain and the configured decorator forms', () => {
    const found = collectRemoteMethodNames('host.ts', `
      class Controller {
        @Remote
        async list(): Promise<void> {}
        @Remote({ mode: 'stream' })
        async *follow(): AsyncIterable<string> {}
        @Remote
        get empty(): boolean { return true }
        private helper(): void {}
      }
    `)
    expect(found.map(method => method.name)).toEqual(['list', 'follow', 'empty'])
  })

  it('reports the declaration line', () => {
    const found = collectRemoteMethodNames('host.ts', 'class C {\n  @Remote\n  async list(): Promise<void> {}\n}')
    expect(found).toEqual([{ name: 'list', file: 'host.ts', line: 3 }])
  })

  it('reads the decorated member only, not a provider call of the same name', () => {
    const found = collectRemoteMethodNames('host.ts', SHIPPED_DECLARATION)
    expect(found).toEqual([{ name: 'remove', file: 'host.ts', line: 3 }])
  })
})

describe('shadowing check', () => {
  it('rejects the name that stalled the workspaceFiles namespace at boot', () => {
    const reserved = new Set(['remove', 'install'])
    const shadowing = collectRemoteMethodNames('host.ts', SHIPPED_DECLARATION)
      .filter(method => reserved.has(method.name))
    expect(shadowing).toEqual([{ name: 'remove', file: 'host.ts', line: 3 }])
  })

  it('admits the rename that replaced it', () => {
    const reserved = new Set(['remove', 'install'])
    const renamed = SHIPPED_DECLARATION.replace('async remove(', 'async delete(')
    expect(collectRemoteMethodNames('host.ts', renamed).filter(method => reserved.has(method.name))).toEqual([])
  })

  it('scans the shipped tree clean, over a corpus large enough to mean something', () => {
    const { violations, scanned } = scanRepository()
    expect(violations).toEqual([])
    expect(scanned).toBeGreaterThanOrEqual(50)
  })
})
