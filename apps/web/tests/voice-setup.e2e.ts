/** Empty local caches guide explicit enablement to plugin setup without starting installation. */
import { fileURLToPath } from 'node:url'
import { chromium, type Browser } from 'playwright'
import { expect, it, onTestFinished } from 'vitest'
import { captureStableAria, compareOrRefreshGolden, launchWebScaffold, watchConsole, webSnapshotMode, type WebScaffold } from './scaffold.ts'
import { newEnglishPage, openSettings } from './support.ts'

const bundle = fileURLToPath(new URL('../../../packages/experimental/voice-input-bundle', import.meta.url))
const expected = fileURLToPath(new URL('./expected/voice-setup.expected.md', import.meta.url))
// The Settings dialog is open behind the activation prompt, and both are
// role="dialog"; name the prompt's own modal so the golden captures it.
const DIALOG_SELECTOR = '[role="dialog"][aria-label="Set up voice input before recording"]'

it('guides a newly enabled voice plugin to installation and lets the user postpone it', async () => {
  const resources: { scaffold?: WebScaffold; browser?: Browser } = {}
  onTestFinished(async () => {
    try { await resources.browser?.close() } finally { await resources.scaffold?.close() }
  })
  const scaffold = await launchWebScaffold({ profile: { packages: [{ dir: bundle, enabled: false }] } })
  resources.scaffold = scaffold
  const browser = await chromium.launch()
  resources.browser = browser
  const page = await newEnglishPage(browser), tripwire = watchConsole(page)
  await page.goto(scaffold.authenticatedUrl)
  const settings = await openSettings(page, { menu: 'Settings', dialog: 'Settings' })
  await settings.getByRole('button', { name: 'Built-in plugins', exact: true }).click()
  await settings.getByRole('tab', { name: 'Manage plugins', exact: true }).click()
  const toggle = settings.getByRole('switch', { name: 'Enable Voice input', exact: true })
  await toggle.waitFor()
  expect(await toggle.getAttribute('aria-checked')).toBe('false')
  const dialog = page.getByRole('dialog', { name: 'Set up voice input before recording', exact: true })
  expect(await dialog.count()).toBe(0)
  await toggle.click()
  await dialog.waitFor()
  await compareOrRefreshGolden(expected, await captureStableAria(page, DIALOG_SELECTOR, scaffold.workspaceCwd), webSnapshotMode())
  await dialog.getByRole('button', { name: 'Later', exact: true }).click()
  await dialog.waitFor({ state: 'hidden' })
  expect(await toggle.getAttribute('aria-checked')).toBe('true')
  const card = page.locator('[data-plugin-package="@qilin-agent/experimental-voice-input-bundle"]')
  expect(await card.getByRole('status').count()).toBe(0)
  await toggle.click()
  await expect.poll(() => toggle.getAttribute('aria-checked')).toBe('false')
  await toggle.click()
  await dialog.getByRole('button', { name: 'Go to setup', exact: true }).click()
  await page.getByRole('button', { name: 'Download and prepare', exact: true }).waitFor()
  expect(await dialog.count()).toBe(0)
  expect(await page.getByText('Local models will be downloaded to the machine running QILIN. No Python or compiler is required.', { exact: true }).count()).toBe(1)
  expect(await page.getByText('Audio is recognized on the machine running QILIN. If models need downloading, that machine must be able to reach the selected source and its file services. Configure a proxy on that machine if needed.', { exact: true }).count()).toBe(1)
  const source = page.getByLabel('Model download source', { exact: true })
  expect(await source.inputValue()).toBe('')
  expect(await source.getByRole('option').allTextContents()).toEqual(['Automatic (recommended)', 'Hugging Face', 'HF-Mirror (China mirror)'])
  await compareOrRefreshGolden(fileURLToPath(new URL('./expected/voice-source-auto.expected.md', import.meta.url)),
    await captureStableAria(page, '[data-speech-provider]', scaffold.workspaceCwd), webSnapshotMode())
  await source.selectOption('https://hf-mirror.com')
  await compareOrRefreshGolden(fileURLToPath(new URL('./expected/voice-source-manual.expected.md', import.meta.url)),
    await captureStableAria(page, '[data-speech-provider]', scaffold.workspaceCwd), webSnapshotMode())
  expect(tripwire.pageErrors).toEqual([])
})
