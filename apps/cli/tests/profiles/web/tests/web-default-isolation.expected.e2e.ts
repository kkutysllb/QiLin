/** Real Web startup, mounted plugin package identities, and delivered Client graph isolation. */

import { FiberState } from '@qilin-agent/kylin'
import type { WebBootGraph } from '@qilin-agent/client-modules/client'
import { expect, it } from 'vitest'
import { experimentalRuntimeReferences, modulePackage } from './runtime-roster.ts'
import { WEB_ENTRY_PATH } from '@qilin-agent/client-connection'
import { withDefaultWeb, webGet } from './default-web-process.ts'

const experimentalName = '@qilin-agent/experimental-client-ui-agent-team'

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
      expect.objectContaining({ name: '@qilin-agent/host-webserver', state: FiberState.ACTIVE }),
      expect.objectContaining({ name: '@qilin-agent/client-modules', state: FiberState.ACTIVE }),
    ]))
    expect(roster.entries.some(entry => entry.name.endsWith('/runtime-roster-observer.js') && entry.state === FiberState.ACTIVE)).toBe(true)
    expect(roster.plugins.length).toBeGreaterThan(roster.entries.length)
    expect(roster.modules.some(url => modulePackage(url) === '@qilin-agent/cli')).toBe(true)
    expect(roster.client.entries.length).toBeGreaterThan(0)
    // Schedule is an opt-in bundle, not a shipped row: the shipped Web
    // composition carries neither the Host service and its time context nor the
    // browser half, and one deployment decision adds all three together.
    for (const name of ['@qilin-agent/time-context', '@qilin-agent/schedule']) {
      expect(roster.entries.some(entry => entry.name === name), name).toBe(false)
    }
    expect(delivered.entries.some(entry => entry.id === '@qilin-agent/client-ui-schedule')).toBe(false)
    // The shipped graph activates the Sidebar browser tab: the row carries no
    // `disabled` override, so it settles in the roster and is delivered.
    const browserTab = '@qilin-agent/client-ui-sidebar-browser'
    expect(roster.entries.find(entry => entry.name === browserTab)?.state, browserTab).toBe(FiberState.ACTIVE)
    expect(delivered.entries.some(entry => entry.id === browserTab), browserTab).toBe(true)
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
