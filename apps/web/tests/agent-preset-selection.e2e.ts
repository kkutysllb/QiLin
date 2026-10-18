// Web e2e scenario: agent-preset surfaces over the two shipped presets.
//
// The deployment ships `standard` (普通模式, the new-task default) and `ptc`
// (编码模式, which adds the runtime-authoring capability), so the shipped Web
// composition mounts `ui-agent-preset` and the new-session hero carries its
// chip. The settings section reports both rows with `standard` as the
// new-task default, the chip stages either mode onto a blank session, and the
// session header names the composition a resumed session runs.
//
// Zero model calls: no replay fixture mounts, so a stray stream fails loud.
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import type { Browser, Page } from 'playwright'
import { chromium } from 'playwright'
import { afterAll, beforeAll, describe, expect, it, onTestFailed } from 'vitest'
import {
  SESSION_FORMAT_VERSION, SessionId as sessionId, type SessionEvent, type SessionHeader, type SessionId,
} from '@qilin-agent/session'
import { snapshotSubagentDescriptor } from '@qilin-agent/subagent'
import { createSystemMessage, createUserMessage } from '@qilin-agent/llm'
import {
  captureStableAria, compareOrRefreshGolden, launchWebScaffold, seedSession, watchConsole,
  webSnapshotMode, type WebScaffold,
} from './scaffold.ts'
import {
  connectFreshWorkspace, newEnglishPage, openSettings, saveFailureShot,
} from './support.ts'

const SNAPSHOT_DIR = fileURLToPath(new URL('./expected/agent-preset-selection', import.meta.url))
const HERO_EXPECTED = join(SNAPSHOT_DIR, 'hero.expected.md')
const HEADER_EXPECTED = join(SNAPSHOT_DIR, 'header.expected.md')
const MODE = webSnapshotMode()
const SEED_ID = 'agent-preset-selection-web-e2e'
const SEEDED_CHILD_ID = sessionId('agent-preset-selection-child')
const SEEDED_CHILD_CREATED_AT = 1784974100100

/**
 * A settled one-turn session with no model content: this lane asserts chrome
 * around a conversation, not a conversation, and a recorded turn would tie
 * the golden to a provider's wording for no gain. Its empty system head
 * belongs to the first step, before the user message.
 * @returns a tokenized session log ending on a closed turn.
 */
function seedLog(): string {
  const time = 1784974100000
  const at = (index: number, event: Record<string, unknown>): string =>
    JSON.stringify({ ...event, seq: index, time: time + index })
  return [
    JSON.stringify({
      type: 'session', version: SESSION_FORMAT_VERSION, id: '{{sessionId}}',
      createdAt: time, cwd: '{{cwd}}/workspace', isSeeded: false, delegationDepth: 0,
    }),
    at(0, { type: 'turn/start', data: { turn: 1, trigger: { kind: 'message', source: { kind: 'user', rpcId: 'seed' } } } }),
    at(1, { type: 'step/start', data: { turn: 1, step: 1 } }),
    at(2, {
      type: 'system/message',
      data: { turn: 1, step: 1, message: createSystemMessage('') },
      surfaceOp: 'append',
    }),
    at(3, {
      type: 'user/message',
      data: {
        id: '00000000-0000-4000-9000-000000000001',
        role: 'user',
        content: [{ type: 'text', text: 'Seeded turn.' }],
        source: { kind: 'user', rpcId: 'seed' },
      },
      surfaceOp: 'append',
    }),
    at(4, { type: 'session/title', data: { title: 'Seeded turn', messageSeqs: [3], source: { kind: 'fallback' } } }),
    at(5, { type: 'step/end', data: { turn: 1, step: 1 } }),
    at(6, {
      type: 'subagent/catalog',
      data: {
        version: 0,
        childId: SEEDED_CHILD_ID,
        childCreatedAt: SEEDED_CHILD_CREATED_AT,
        mode: 'one-shot',
        label: 'header order probe',
      },
    }),
    at(7, { type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } }),
  ].join('\n')
}

/**
 * Persist one child so the assembled header snapshot exercises both action
 * contributors whose relative order is the product contract under test.
 * @param scaffold - the booted Web scaffold.
 * @param parentId - the seeded session whose header the browser opens.
 */
async function seedSubagent(scaffold: WebScaffold, parentId: SessionId): Promise<void> {
  const createdAt = SEEDED_CHILD_CREATED_AT
  const header: SessionHeader = {
    version: SESSION_FORMAT_VERSION,
    id: SEEDED_CHILD_ID,
    isSeeded: false,
    createdAt,
    cwd: scaffold.workspaceCwd,
    parentSession: parentId,
    origin: 'subagent',
    delegationDepth: 1,
    agentPreset: 'ptc',
  }
  const handle = await scaffold.ctx.sessionPersistence.create(header)
  await handle.append([
    {
      type: 'turn/start',
      seq: 0,
      time: createdAt,
      data: { turn: 1, trigger: { kind: 'message', source: { kind: 'user' } } },
    },
    {
      type: 'user/message',
      seq: 1,
      time: createdAt + 1,
      data: createUserMessage({
        content: [{ type: 'text', text: 'Check the session-header action order.' }],
        source: { kind: 'user' },
      }),
      surfaceOp: 'append',
    },
    {
      type: 'subagent/descriptor',
      seq: 2,
      time: createdAt + 2,
      data: snapshotSubagentDescriptor({
        mode: 'one-shot', provider: 'spawn', label: 'header order probe',
      }),
    },
    {
      type: 'turn/end',
      seq: 3,
      time: createdAt + 3,
      data: { turn: 1, reason: { kind: 'completed' } },
    },
  ] as SessionEvent[])
  await handle.close()
}

/**
 * The preset the host reports for the blank session the workspace connect
 * produced. Addressed by id rather than by scanning the serialized list: the
 * seeded session records `ptc` too, so a substring match over the whole
 * list answers before the connect has landed.
 * @param scaffold - authenticated Web Host scaffold.
 * @returns the live session's preset, or undefined before it is listed.
 */
async function livePreset(scaffold: WebScaffold): Promise<string | undefined> {
  const response = await scaffold.hostFetch('/api/session/list', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      type: 'client-request', rpcId: 'agent-preset-live', method: 'session/list',
      payload: { args: { _request: {} } },
    }),
  })
  const body = await response.json() as {
    result: {
      value?: {
        items: {
          sessionId: string
          projections?: { values: { agentPreset?: string | null } }
        }[]
      }
    }
  }
  const preset = body.result.value?.items.find(item => item.sessionId !== SEED_ID)
    ?.projections?.values.agentPreset
  return typeof preset === 'string' ? preset : undefined
}

describe('web e2e: agent-preset selection', () => {
  let scaffold: WebScaffold
  let browser: Browser
  let page: Page
  let tripwire: ReturnType<typeof watchConsole>

  beforeAll(async () => {
    // No roster patch: the lane rides the shipped scaffold default (`standard`)
    // and the plugin's own shipped root.
    scaffold = await launchWebScaffold()
    // A resumed session runs what it was created with; seeding one that
    // records `ptc` is what makes the header label a claim about the
    // session rather than an echo of the current default.
    const seededId = await seedSession(scaffold, seedLog(), SEED_ID, 'ptc')
    await seedSubagent(scaffold, seededId)
    browser = await chromium.launch()
    page = await newEnglishPage(browser)
    tripwire = watchConsole(page)
    await page.goto(scaffold.authenticatedUrl, { waitUntil: 'load' })
    await page.waitForSelector('[class*="frame"]', { timeout: 30_000 })
  }, 120_000)

  afterAll(async () => {
    await browser?.close()
    await scaffold?.close()
  })

  it('offers both shipped modes over the ordinary default', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-agent-preset-hero'))
    await connectFreshWorkspace(page, scaffold.workspaceCwd)
    // The connect composed the blank session from the shipped default, and the
    // chip names it beside the workspace picker.
    await expect.poll(() => livePreset(scaffold), { timeout: 15_000 }).toBe('standard')
    const chip = page.getByRole('button', { name: 'Standard mode', exact: true })
    await chip.waitFor({ timeout: 10_000 })

    // Both shipped modes are selectable; the chip opens on the composed default.
    await chip.click()
    await expect.poll(() => page.getByRole('menuitem', { name: /Standard mode/ }).count(), { timeout: 10_000 }).toBe(1)
    await expect.poll(() => page.getByRole('menuitem', { name: /Coding mode/ }).count(), { timeout: 10_000 }).toBe(1)
    await page.keyboard.press('Escape')

    const snapshot = await captureStableAria(page, '[class*="heroWorkspaceRow"]', scaffold.workspaceCwd)
    await compareOrRefreshGolden(HERO_EXPECTED, snapshot, MODE)
    expect(snapshot).toContain('Choose workspace')
  }, 60_000)

  it('reports the ordinary preset as the new-task default beside the coding preset', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-agent-preset-settings'))
    const dialog = await openSettings(page, { menu: 'Settings', dialog: 'Settings' })
    await dialog.getByRole('button', { name: 'Agent presets' }).click()
    // The roster carries both shipped presets, localized through the shared
    // display fold rather than by their file metadata, and the host names
    // `standard` the default new tasks compose from.
    await dialog.getByRole('button', { name: 'New task default: Standard mode' }).waitFor({ timeout: 10_000 })
    await dialog.getByRole('button', { name: 'View: Coding mode' }).waitFor({ timeout: 10_000 })
    // The coding preset documents the runtime-authoring capability it adds.
    await dialog.getByText(/persistent plugin management, and composition authoring/).waitFor({ timeout: 10_000 })
    const toggle = dialog.getByRole('switch', { name: 'Allow switching Agent modes' })
    expect(await toggle.getAttribute('aria-checked')).toBe('true')
    await dialog.getByRole('button', { name: 'Close' }).last().click()
  }, 60_000)

  it('stages either mode onto the blank session', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-agent-preset-stage'))
    const standardChip = page.getByRole('button', { name: 'Standard mode', exact: true })
    await standardChip.waitFor({ timeout: 10_000 })
    await standardChip.click()
    await page.getByRole('menuitem', { name: /Coding mode/ }).click()
    // The host recomposes the still-blank session from `ptc`.
    await expect.poll(() => livePreset(scaffold), { timeout: 15_000 }).toBe('ptc')

    const codingChip = page.getByRole('button', { name: 'Coding mode', exact: true })
    await codingChip.waitFor({ timeout: 10_000 })
    await codingChip.click()
    await page.getByRole('menuitem', { name: /Standard mode/ }).click()
    await expect.poll(() => livePreset(scaffold), { timeout: 15_000 }).toBe('standard')
  }, 60_000)

  it('labels a resumed session with the preset it was created under', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-agent-preset-header'))
    // The seeded session's cwd is the scaffold root rather than the connected
    // workspace, so it lists under Ungrouped; the group collapses by default.
    await page.getByRole('treeitem', { name: /^Ungrouped/ }).click()
    await page.locator('[role="treeitem"]').last().click()
    await page.getByText('Seeded turn.').waitFor({ timeout: 15_000 })
    // The descendant count reads the parent's own subagent catalog projection,
    // which lands after the Session opens; waiting for it keeps the capture
    // from racing its arrival.
    await page.getByRole('button', { name: '1 subagent' }).waitFor({ timeout: 15_000 })

    const snapshot = await captureStableAria(page, '[class*="titleRow"]', scaffold.workspaceCwd)

    await compareOrRefreshGolden(HEADER_EXPECTED, snapshot, MODE)
    expect(snapshot).toContain('Coding mode')
    expect(snapshot).toContain('button "1 subagent"')
    // A root session carries no breadcrumb switcher: its descendant count is an
    // occupant of the actions band, so it follows the preset label the same band
    // carries and still precedes the corner's own control.
    expect(snapshot.indexOf('Coding mode')).toBeLessThan(snapshot.indexOf('button "1 subagent"'))
    expect(snapshot.indexOf('button "1 subagent"')).toBeLessThan(snapshot.indexOf('button "Open right sidebar"'))
    // Static chrome, not a control: the header can only report a composition
    // the host would refuse to change.
    expect(snapshot).not.toContain('button "Coding mode"')
  })

  it('drove every surface without a page error or a stream warning', () => {
    expect(tripwire.pageErrors).toEqual([])
    expect(tripwire.warnings).toEqual([])
  })
})
