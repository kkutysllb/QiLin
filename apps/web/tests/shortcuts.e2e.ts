/** Real Web composition: keyboard routing, inline editing, and localized system feedback. */
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { chromium, type Browser } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { captureStableAria, compareOrRefreshGolden, launchWebScaffold, watchConsole, webSnapshotMode, type WebScaffold } from './scaffold.ts'
import { openSettings } from './support.ts'

const expected = fileURLToPath(new URL('./expected/shortcuts', import.meta.url))
const mode = webSnapshotMode()

describe('web e2e: shortcut reference', () => {
  let scaffold: WebScaffold
  let browser: Browser
  beforeAll(async () => {
    scaffold = await launchWebScaffold({})
    browser = await chromium.launch()
  }, 120_000)
  afterAll(async () => { await browser?.close(); await scaffold?.close() })

  it.each([
    { locale: 'zh-CN', platform: 'MacIntel', title: '快捷键', settings: '设置', view: '编辑快捷键', search: '搜索快捷键', key: 'Meta' },
    { locale: 'en-US', platform: 'Win32', title: 'Keyboard shortcuts', settings: 'Settings', view: 'Edit shortcuts', search: 'Search shortcuts', key: 'Control' },
  ])('opens, searches, and restores nested focus in $locale', async ({ locale, platform, title, settings, view, search, key }) => {
    const referenceKey = platform === 'Win32' ? 'Control+Slash' : 'Meta+Slash'
    const context = await browser.newContext({ locale, colorScheme: 'light', viewport: { width: 1440, height: 1000 } })
    try {
      // Branch coverage for device labels; native Windows input is separately verified on Windows.
      await context.addInitScript((value) => { Object.defineProperty(navigator, 'platform', { value }) }, platform)
      const page = await context.newPage()
      const console = watchConsole(page)
      await page.goto(scaffold.authenticatedUrl, { waitUntil: 'load' })
      await page.waitForSelector('[class*="frame"]', { timeout: 30_000 })
      await openSettings(page, { menu: settings, dialog: settings })
      const dialog = page.getByRole('dialog', { name: title, exact: true })
      const opener = page.getByRole('button', { name: view, exact: true })
      await opener.click()
      await dialog.waitFor()
      // The reference rides above the settings panel: two portalled dialogs.
      expect(await page.getByRole('dialog').count()).toBe(2)
      expect(await dialog.locator('footer').count()).toBe(1)
      const resetAll = dialog.getByRole('button', { name: locale === 'zh-CN' ? '恢复全部默认' : 'Restore all defaults', exact: true })
      expect(await resetAll.isDisabled()).toBe(true)
      expect(await dialog.getByRole('searchbox', { name: search }).evaluate(element => element === document.activeElement)).toBe(true)
      const rows = dialog.getByRole('listitem')
      const stopRow = dialog.getByRole('region', { name: locale === 'zh-CN' ? '消息输入' : 'Message input', exact: true })
        .getByRole('listitem').last()
      await stopRow.getByText(locale === 'zh-CN' ? '停止生成' : 'Stop generating', { exact: true }).waitFor()
      const stopButtons = stopRow.getByRole('button')
      expect(await stopButtons.count()).toBe(0)
      // Every row keeps its content inside its own box, including while the
      // fixed stop row renders no edit control at all.
      expect(await rows.evaluateAll(items => items.every(row => row.getBoundingClientRect().height >= 42
        && row.scrollWidth <= row.clientWidth))).toBe(true)
      await compareOrRefreshGolden(join(expected, `${locale}.expected.md`),
        await captureStableAria(page, '[data-shortcut-modal="shortcuts"]', scaffold.workspaceCwd), mode)

      // Inline editing: the sidebar toggle row's editor records into the row.
      const editLabel = locale === 'zh-CN' ? '修改展开／收起左侧栏快捷键' : 'Edit shortcut for Toggle left sidebar'
      const editButton = page.getByRole('button', { name: editLabel, exact: true })
      const boundRow = dialog.getByRole('listitem').filter({ has: page.getByText(
        locale === 'zh-CN' ? '快捷键速查' : 'Open keyboard shortcuts', { exact: true },
      ) })
      const badge = boundRow.getByRole('button', { name: locale === 'zh-CN' ? '修改快捷键速查快捷键' : 'Edit shortcut for Open keyboard shortcuts', exact: true })
      const boundInline = dialog.getByRole('group', { name: locale === 'zh-CN' ? '快捷键速查' : 'Open keyboard shortcuts', exact: true })
      await editButton.click()
      // The inline editor replaces the row's edit control, so the group is
      // located by its command name rather than through the row filter.
      const inline = dialog.getByRole('group', { name: locale === 'zh-CN' ? '展开／收起左侧栏' : 'Toggle left sidebar', exact: true })
      await inline.waitFor()
      // The reference binding's combination is occupied: recording it reports the conflict by command name.
      await page.keyboard.press(referenceKey)
      const errorToast = page.getByRole('alert').filter({ hasText: locale === 'zh-CN' ? '已被「快捷键速查」占用' : 'Already used by “Open keyboard shortcuts”' })
      await errorToast.waitFor()
      expect(await errorToast.evaluate(element => element.closest('[role="dialog"]') === null)).toBe(true)
      await page.keyboard.press('i')
      await page.getByRole('alert').filter({ hasText: locale === 'zh-CN'
        ? '请同时按下 Command、Ctrl 或 Alt 修饰键。' : 'Include Command, Ctrl, or Alt in the combination.' }).waitFor()
      // A valid new combination closes the editor and reports the save.
      await page.keyboard.press(`${key}+Shift+.`)
      await inline.waitFor({ state: 'hidden' })
      const successToast = page.getByRole('alert').filter({ hasText: locale === 'zh-CN' ? '已修改' : 'Modified' })
      await successToast.waitFor()
      await compareOrRefreshGolden(join(expected, `${locale}-saved.expected.md`), await successToast.ariaSnapshot(), mode)

      // The sidebar toggle keeps its new binding; restore default returns Meta/Ctrl+B.
      await editButton.click()
      await inline.waitFor()
      await inline.getByRole('button', { name: locale === 'zh-CN' ? '恢复默认' : 'Restore default', exact: true }).click()
      await inline.waitFor({ state: 'hidden' })

      // Removing the reference binding restores the empty state; restore default brings it back.
      await badge.click()
      await boundInline.waitFor()
      await boundInline.getByRole('button', { name: locale === 'zh-CN' ? '移除' : 'Remove', exact: true }).click()
      await boundInline.waitFor({ state: 'hidden' })
      await boundRow.getByText(locale === 'zh-CN' ? '暂无快捷键' : 'No shortcut', { exact: true }).waitFor()
      await badge.click()
      await boundInline.waitFor()
      await boundInline.getByRole('button', { name: locale === 'zh-CN' ? '恢复默认' : 'Restore default', exact: true }).click()
      await boundInline.waitFor({ state: 'hidden' })

      // Search: unmatched queries empty the list; fuzzy and exact queries find one row.
      for (const query of ['abc', 'sendEnter']) {
        await dialog.getByRole('searchbox').fill(query)
        expect(await dialog.getByRole('listitem').count()).toBe(0)
        expect(await dialog.getByRole('status').textContent()).toBe(locale === 'zh-CN' ? '没有匹配的快捷键' : 'No matching shortcuts')
        if (query === 'abc') await compareOrRefreshGolden(join(expected, `${locale}-empty.expected.md`),
          await captureStableAria(page, '[data-shortcut-modal="shortcuts"]', scaffold.workspaceCwd), mode)
      }
      for (const query of [locale === 'zh-CN' ? '左侧栏' : 'toggle left', 'tgllft', 'toggle left sidebar']) {
        await dialog.getByRole('searchbox').fill(query)
        expect(await dialog.getByRole('listitem').count()).toBe(1)
        expect(await dialog.getByRole('listitem').textContent()).toContain(locale === 'zh-CN' ? '展开／收起左侧栏' : 'Toggle left sidebar')
      }
      // The reference close shortcut still works while the search holds text,
      // and reopening restores the reference directly.
      await page.keyboard.press(referenceKey)
      await dialog.waitFor({ state: 'hidden' })
      expect(await page.getByRole('dialog').count()).toBe(1)
      await page.keyboard.press(referenceKey)
      await dialog.waitFor()
      expect(await page.getByRole('dialog').count()).toBe(2)
      expect(await dialog.getByRole('searchbox').inputValue()).toBe('')
      await page.keyboard.press(referenceKey)
      await dialog.waitFor({ state: 'hidden' })

      // Restore-all confirmation: cancel keeps the customization, confirm clears it.
      // The close shortcut hid the reference above; reopen it for the footer flows.
      await page.keyboard.press(referenceKey)
      await dialog.waitFor()
      // Leave exactly one customization behind for the footer count to report.
      await editButton.click()
      await inline.waitFor()
      await page.keyboard.press(`${key}+Shift+.`)
      await inline.waitFor({ state: 'hidden' })
      await dialog.getByRole('searchbox').fill('abc')
      expect(await dialog.locator('footer').textContent()).toContain(locale === 'zh-CN' ? '1 项已自定义' : '1 customized')
      await resetAll.click()
      const confirm = page.getByRole('dialog', { name: locale === 'zh-CN' ? '恢复全部默认快捷键？' : 'Restore all default shortcuts?', exact: true })
      const cancel = confirm.getByRole('button', { name: locale === 'zh-CN' ? '取消' : 'Cancel', exact: true })
      expect(await cancel.evaluate(element => element === document.activeElement)).toBe(true)
      await compareOrRefreshGolden(join(expected, `${locale}-reset-confirm.expected.md`), await confirm.ariaSnapshot(), mode)
      await cancel.click()
      expect(await resetAll.evaluate(element => element === document.activeElement)).toBe(true)
      expect(await dialog.locator('footer').textContent()).toContain(locale === 'zh-CN' ? '1 项已自定义' : '1 customized')
      await resetAll.click()
      await confirm.getByRole('button', { name: locale === 'zh-CN' ? '恢复默认' : 'Restore default', exact: true }).click()
      await confirm.waitFor({ state: 'hidden' })
      expect(await resetAll.isDisabled()).toBe(true)
      expect(await dialog.locator('footer').textContent()).toBe(locale === 'zh-CN' ? '恢复全部默认' : 'Restore all defaults')
      expect(await dialog.getByRole('searchbox').evaluate(element => element === document.activeElement)).toBe(true)

      // The settings-open binding edits inline from the reference and restores.
      // The reset flow left the unmatched query in the search box; clear it so
      // the command rows render again.
      await dialog.getByRole('searchbox').fill('')
      const settingsCommand = locale === 'zh-CN' ? '打开设置' : 'Open settings'
      const settingsRow = dialog.getByRole('listitem').filter({ has: page.getByText(settingsCommand, { exact: true }) })
      await dialog.getByRole('button', { name: locale === 'zh-CN' ? `修改${settingsCommand}快捷键` : `Edit shortcut for ${settingsCommand}`, exact: true }).click()
      await page.keyboard.press(`${key}+Shift+Comma`)
      await dialog.getByRole('group').waitFor({ state: 'hidden' })
      // QiLin's account-menu trigger does not mirror the binding; the reference
      // row's keycaps are the user-facing display of the change.
      expect(await settingsRow.textContent()).toContain(key === 'Meta' ? '⇧⌘,' : 'Ctrl+Shift+,')
      await dialog.getByRole('button', { name: locale === 'zh-CN' ? `修改${settingsCommand}快捷键` : `Edit shortcut for ${settingsCommand}`, exact: true }).click()
      await dialog.getByRole('button', { name: locale === 'zh-CN' ? '恢复默认' : 'Restore default', exact: true }).click()
      await dialog.getByRole('group').waitFor({ state: 'hidden' })
      expect(await settingsRow.textContent()).toContain(key === 'Meta' ? '⌘,' : 'Ctrl+,')

      // A saved binding survives a reload from the profile storage.
      const sidebar = page.getByRole('button', { name: locale === 'zh-CN' ? '收起侧边栏' : 'Collapse sidebar', exact: true })
      expect(await sidebar.getAttribute('aria-keyshortcuts')).toBe(key === 'Meta' ? 'Alt+Meta+B' : 'Control+Alt+B')
      await page.reload({ waitUntil: 'load' })
      await page.waitForSelector('[class*="frame"]', { timeout: 30_000 })
      const reloadedSidebar = page.getByRole('button', { name: locale === 'zh-CN' ? '收起侧边栏' : 'Collapse sidebar', exact: true })
      await reloadedSidebar.waitFor()
      expect(await reloadedSidebar.getAttribute('aria-keyshortcuts')).toBe(key === 'Meta' ? 'Alt+Meta+B' : 'Control+Alt+B')
      expect(console.pageErrors).toEqual([])
      expect(console.warnings).toEqual([])
    } finally { await context.close() }
  }, 240_000)
})
