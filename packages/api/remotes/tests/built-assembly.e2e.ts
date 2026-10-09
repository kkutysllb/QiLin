import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * The built Client assembly mounts the namespaces product code reads over the
 * real generated clients. No dynamic tier can catch a dropped mount: the
 * whole-client test tier substitutes `remote.<ns>` proxies for the generated
 * clients, and a reader behind `import type` typechecks regardless. This
 * built-artifact test is the runtime half; `scripts/verify-remote-assembly` is
 * the source-level gate for the same invariant.
 */

const packageDir = fileURLToPath(new URL('..', import.meta.url))
const root = resolve(packageDir, '../../..')
const artifact = (path: string): string => join(root, path)
const artifactUrl = (path: string): string => pathToFileURL(artifact(path)).href

const requiredArtifacts = [
  'packages/typert/registry/lib/client.js',
  'packages/api/gateway/lib/client.js',
  'packages/api/remotes/lib/client.js',
].every(path => existsSync(artifact(path)))

describe.skipIf(!requiredArtifacts)('Built Client Remote assembly', () => {
  it('mounts the namespaces the product reads, sidebarOpens included', async () => {
    const urls = Object.fromEntries(Object.entries({
      registryClient: 'packages/typert/registry/lib/client.js',
      apiGatewayClient: 'packages/api/gateway/lib/client.js',
      remotesClient: 'packages/api/remotes/lib/client.js',
    }).map(([key, path]) => ([key, artifactUrl(path)])))
    const script = `
      import * as cordis from '@qilin-agent/kylin'

      const urls = ${JSON.stringify(urls)}
      const { Context } = cordis
      const handoffs = new Map()
      globalThis.window = {
        __ModuleLoader__: {
          load(handoff) { handoffs.set(handoff.id, handoff) },
        },
      }
      globalThis.location = { hostname: '127.0.0.1', origin: 'http://127.0.0.1:0', search: '' }
      await import(urls.registryClient)
      await import(urls.apiGatewayClient)
      await import(urls.remotesClient)

      const instantiate = id => {
        const handoff = handoffs.get(id)
        if (handoff === undefined) throw new Error('missing Client bundle handoff ' + id)
        return handoff.factory(specifier => {
          if (specifier === '@qilin-agent/kylin') return cordis
          throw new Error('unexpected Client external ' + specifier)
        })
      }

      // The namespace services mount without a live carrier: $mount installs
      // cordis services, and the carrier is touched only when a method runs.
      const client = new Context()
      client.provide('connection', {
        rpc: { open: () => undefined },
        start() { return { stop() {} } },
        generation: { getSnapshot: () => undefined },
        isLoopback: false,
        registerGenerationSource() { return () => {} },
      })
      for (const id of [
        '@qilin-agent/typert-registry',
        '@qilin-agent/api-gateway',
        '@qilin-agent/api-remotes',
      ]) {
        const plugin = instantiate(id)
        await client.plugin({ inject: plugin.inject, apply: plugin.apply })
      }

      const result = {
        sidebarOpensWatch: typeof client.remote.sidebarOpens?.watch,
        goalsCreate: typeof client.remote.goals?.create,
      }
      await client.fiber.dispose()
      console.log(JSON.stringify(result))
    `

    const result = await runPlainNode(script)
    expect(result.exitCode, `stderr:\n${result.stderr}`).toBe(0)
    const output = JSON.parse(result.stdout.trim().split('\n').at(-1) ?? '{}') as Record<string, string>
    expect(output).toEqual({
      sidebarOpensWatch: 'function',
      goalsCreate: 'function',
    })
  }, 60_000)
})

/** Execute one ESM script without tsx or a TypeScript loader. */
function runPlainNode(script: string): Promise<{
  readonly exitCode: number | null
  readonly stdout: string
  readonly stderr: string
}> {
  return new Promise((resolveRun) => {
    execFile(process.execPath, ['--input-type=module', '-e', script], {
      cwd: packageDir,
      encoding: 'utf8',
      timeout: 55_000,
    }, (error, stdout, stderr) => {
      resolveRun({
        exitCode: error === null ? 0 : typeof error.code === 'number' ? error.code : null,
        stdout,
        stderr,
      })
    })
  })
}
