/** Real Web startup, mounted plugin package identities, and delivered Client graph isolation. */

import { FiberState } from '@qilin/kylin'
import type { WebBootGraph } from '@qilin/client-modules/client'
import { expect, it } from 'vitest'
import { experimentalRuntimeReferences, modulePackage } from './runtime-roster.ts'
import { WEB_ENTRY_PATH } from '@qilin/client-connection'
import { withDefaultWeb, webGet } from './default-web-process.ts'

const experimentalName = '@qilin/experimental-client-ui-agent-team'

it('boots the default Web profile without experimental Host modules or mounted plugins', async (test) => {
  await withDefaultWeb(test, async ({ url, request }) => {
    const auth = await webGet(url, test.signal)
    const cookie = auth.headers['set-cookie']?.[0]?.split(';', 1)[0]
    expect(cookie).toBeDefined()
    // The site root keeps the public landing page; the application document
    // (with the inline boot graph) serves at the workspace entry path.
    const page = await webGet(new URL(WEB_ENTRY_PATH, url), test.signal, { cookie: cookie! })
    expect(page.status).toBe(200)
    const html = page.text
    const rawBoot = /globalThis\["__QILIN_BOOT__"\] = ([\s\S]*?)<\/script>/u.exec(html)?.[1]
    expect(rawBoot, html).toBeDefined()
    const delivered = JSON.parse(rawBoot!) as WebBootGraph
    const roster = await request('roster')
    expect(roster.client).toEqual(delivered)
    expect(roster.entries).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: '@qilin/host-webserver', state: FiberState.ACTIVE }),
      expect.objectContaining({ name: '@qilin/client-modules', state: FiberState.ACTIVE }),
    ]))
    expect(roster.entries.some(entry => entry.name.endsWith('/runtime-roster-observer.js') && entry.state === FiberState.ACTIVE)).toBe(true)
    expect(roster.plugins.length).toBeGreaterThan(roster.entries.length)
    expect(roster.modules.some(url => modulePackage(url) === '@qilin/cli')).toBe(true)
    expect(roster.client.entries.length).toBeGreaterThan(0)
    // The shipped schedule capability: the profile enables the Host service,
    // the time context, and the browser half together, and all three reach the
    // Client graph. The built-in browser row keeps its upstream default,
    // because its value is decided by profile name rather than by this bundle.
    for (const name of ['@qilin/time-context', '@qilin/schedule']) {
      expect(roster.entries, name).toEqual(expect.arrayContaining([
        expect.objectContaining({ name, state: FiberState.ACTIVE }),
      ]))
    }
    expect(delivered.entries.some(entry => entry.id === '@qilin/client-ui-schedule')).toBe(true)
    // The shipped graph resolves this row but leaves it disabled: it appears in
    // the roster with no settled state and is never delivered.
    for (const name of [
      '@qilin/client-ui-sidebar-browser',
    ]) {
      const entry = roster.entries.find(entry => entry.name === name)
      expect(entry, name).toBeDefined()
      expect(entry!.state, name).toBeUndefined()
      expect(delivered.entries.some(entry => entry.id === name), name).toBe(false)
    }
    expect(experimentalRuntimeReferences(roster)).toEqual([])

    const contaminated = await request('mount-experimental')
    expect(contaminated.entries.some(entry => entry.name === experimentalName)).toBe(false)
    const mounted = contaminated.plugins.filter(plugin => plugin.modules.some(url => modulePackage(url) === experimentalName))
    expect(mounted).toEqual([expect.objectContaining({ state: FiberState.ACTIVE })])
    expect(experimentalRuntimeReferences(contaminated)).toEqual(expect.arrayContaining([
      expect.stringContaining('/packages/experimental/client-ui-agent-team/'),
    ]))
  })
})
