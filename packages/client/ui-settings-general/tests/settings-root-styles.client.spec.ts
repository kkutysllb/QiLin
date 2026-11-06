/**
 * Settings shell style contracts with the desktop window chrome: the
 * full-window overlay opens below a self-drawn titlebar, so the rail head does
 * not sit under the window menu.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const css = readFileSync(fileURLToPath(new URL('../src/client/SettingsRoot.module.css', import.meta.url)), 'utf8')
const pluginCss = readFileSync(
  fileURLToPath(new URL('../../ui-plugin-manager/src/client/PluginManagerPage.module.css', import.meta.url)),
  'utf8',
)

/** Declarations of one exact selector in one sheet, keyed by property. */
function declarations(selector: string, sheet = css): Map<string, string> | undefined {
  const withoutComments = sheet.replace(/\/\*[\s\S]*?\*\//g, ' ')
  for (const [, selectorList = '', body = ''] of withoutComments.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!selectorList.split(',').map(value => value.trim()).includes(selector)) continue
    const found = new Map<string, string>()
    for (const part of body.split(';')) {
      const colon = part.indexOf(':')
      if (colon === -1) continue
      found.set(part.slice(0, colon).trim(), part.slice(colon + 1).trim().replace(/\s+/g, ' '))
    }
    return found
  }
  return undefined
}

describe('SettingsRoot.module.css overlay', () => {
  it('hosts sticky nested page headers on the panel surface, not the app canvas', () => {
    const panel = declarations('.panel')
    expect(panel?.get('--qilin-page-surface')).toBe('var(--qilin-alias-bg-layer-2)')
    // The plugin manager paints its sticky header backdrop from that surface;
    // bg-base is the canvas behind the panel, so it read as a darker card.
    const bar = declarations('.pageBar[data-natural]::before', pluginCss)
    expect(bar?.get('background')).toBe('var(--qilin-page-surface, var(--qilin-alias-bg-base))')
  })

  it('fills the viewport and clears the caption height a self-drawn titlebar publishes', () => {
    const overlay = declarations('.overlay')
    expect(overlay?.get('position')).toBe('fixed')
    expect(overlay?.get('inset')).toBe('0')
    expect(overlay?.get('top')).toBe(
      'var(--qilin-windows-titlebar-height, var(--dsh-windows-titlebar-height, var(--ok-tb-h, 0px)))',
    )
  })

  it('drops the rail return control below the window control band on a self-drawn macOS titlebar', () => {
    // The rail's 22px top padding alone leaves the control level with the window
    // controls' 26px optical line, so darwin pushes it 20px further down.
    expect(declarations(":global(html[data-platform='darwin']) .navBack")?.get('margin-top')).toBe('20px')
    // Pure web sets no data-platform and keeps the flat rail.
    expect(declarations('.navBack')?.get('margin-top')).toBeUndefined()
  })

  it('gives the caption slot the same height and clips it away when no titlebar claims it', () => {
    const mark = declarations('.captionMark')
    expect(mark?.get('position')).toBe('fixed')
    expect(mark?.get('inset-inline-start')).toBe('12px')
    expect(mark?.get('height')).toBe('var(--qilin-windows-titlebar-height, var(--dsh-windows-titlebar-height, 0px))')
    expect(mark?.get('overflow')).toBe('hidden')
    // The frame's caption band stays the composed drag region: a component
    // sheet may not declare one (app-region-styles owns that contract).
    expect(mark?.has('-webkit-app-region')).toBe(false)
  })
})
