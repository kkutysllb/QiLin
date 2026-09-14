/** Default-browser startup over a real Loader tree and listening Web server. */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@qilin/kylin'
import Include from '@qilin/kylin-plugin-include'
import Loader from '@qilin/kylin-plugin-loader'
import WebServer from '@qilin/host-webserver'
import { WEB_ENTRY_PATH } from '@qilin/client-connection'
import { apply, internals } from '../src/index.ts'

const contexts: Context[] = []
const tempRoots: string[] = []
const originalResolveDistIndex = internals.resolveDistIndex
const originalOpenBrowser = internals.openBrowser

beforeEach(() => {
  vi.stubEnv('SSH_CONNECTION', '')
  vi.stubEnv('SSH_TTY', '')
})

afterEach(async () => {
  for (const ctx of contexts.splice(0)) await ctx.fiber.dispose()
  for (const root of tempRoots.splice(0)) rmSync(root, { recursive: true, force: true })
  internals.resolveDistIndex = originalResolveDistIndex
  internals.openBrowser = originalOpenBrowser
  vi.unstubAllEnvs()
  Reflect.deleteProperty(globalThis, '__qilinWebAppApply')
  Reflect.deleteProperty(globalThis, '__qilinWebServer')
  Reflect.deleteProperty(globalThis, '__qilinConnection')
})

describe('web app browser startup', () => {
  it('opens the canonical URL only after the complete page is reachable', async () => {
    const root = mkdtempSync(join(tmpdir(), 'qilin-web-browser-open-'))
    tempRoots.push(root)
    const dist = join(root, 'dist')
    mkdirSync(dist)
    const index = join(dist, 'index.html')
    writeFileSync(index, '<!doctype html><title>ready</title>')
    internals.resolveDistIndex = () => index

    const webserverModule = join(root, 'webserver.mjs')
    const connectionModule = join(root, 'connection.mjs')
    const webAppModule = join(root, 'web-app.mjs')
    writeFileSync(webserverModule, 'export default globalThis.__qilinWebServer\n')
    writeFileSync(connectionModule, [
      "export const inject = ['webServer']",
      "export const apply = ctx => ctx.provide('connection', globalThis.__qilinConnection)",
      '',
    ].join('\n'))
    writeFileSync(webAppModule, [
      "export const name = 'fixture-web-app'",
      "export const inject = ['webServer']",
      'export const apply = (ctx, config) => globalThis.__qilinWebAppApply(ctx, config)',
      '',
    ].join('\n'))
    const config = join(root, 'cordis.yml')
    writeFileSync(config, [
      '- id: webserver',
      `  name: ${pathToFileURL(webserverModule).href}`,
      '  config:',
      '    host: 127.0.0.1',
      '    port: 0',
      '- id: connection',
      `  name: ${pathToFileURL(connectionModule).href}`,
      '- id: web-app',
      `  name: ${pathToFileURL(webAppModule).href}`,
      '  config:',
      '    openBrowser: true',
      '    printUrl: false',
      '    surfaceContext: false',
      '    trustedHosts: []',
      '',
    ].join('\n'))

    const globals = globalThis as unknown as {
      __qilinWebAppApply: typeof apply
      __qilinWebServer: typeof WebServer
      __qilinConnection: {
        authenticatedUrl(baseUrl: string): string
        entryPath: string
        authorizeIndex(): boolean
        requestRejection(): undefined
        rpc: object
      }
    }
    globals.__qilinWebAppApply = apply
    globals.__qilinWebServer = WebServer
    globals.__qilinConnection = {
      // The entry URL a deployment prints names the application document, which
      // is the path the fixture dist serves below.
      entryPath: WEB_ENTRY_PATH,
      authenticatedUrl: (baseUrl) => {
        const url = new URL(baseUrl)
        url.pathname = WEB_ENTRY_PATH
        url.searchParams.set('token', 'fixture-token')
        return url.href
      },
      authorizeIndex: () => true,
      requestRejection: () => undefined,
      rpc: {},
    }

    let openedUrl: string | undefined
    let openedStatus: number | undefined
    let resolveOpened!: () => void
    const opened = new Promise<void>((resolve) => { resolveOpened = resolve })
    internals.openBrowser = async (url) => {
      openedUrl = url
      openedStatus = (await fetch(url)).status
      resolveOpened()
    }

    const ctx = new Context()
    contexts.push(ctx)
    await ctx.plugin(Loader)
    ctx.loader.builtins.include = Include
    await ctx.loader.create({
      name: 'cordis:include',
      config: { path: pathToFileURL(config).href },
    })
    await ctx.loader.await()
    await opened

    expect(openedUrl).toBe(`http://127.0.0.1:${String(ctx.webServer.port)}${WEB_ENTRY_PATH}?token=fixture-token`)
    expect(openedStatus).toBe(200)
  })
})
