/**
 * Theme bootstrap row for the browser's pre-plugin interval. Each index
 * render embeds the current durable built-in preference, content font size,
 * and leading adjustment. Head CSS colors the document canvas before script
 * execution; the body script installs the palette selector and both content
 * axes that ui-layout's ThemePresenter adopts after the client plugin tree
 * activates.
 */

import type { IndexInjection } from '@qilin/host-webserver'
import {
  DEFAULT_FONT_SIZE, DEFAULT_LEADING, DEFAULT_PREFERENCE, type ThemePreference,
} from './theme-settings.ts'

const LIGHT_BACKGROUND = '#fff'
const DARK_BACKGROUND = '#151517'

/** CSS that colors the document canvas before any script executes. */
function bootThemeStyle(preference: ThemePreference): string {
  const light = `:root{color-scheme:light}body{background-color:${LIGHT_BACKGROUND};--qilin-boot-bg:${LIGHT_BACKGROUND}}`
  const dark = `:root{color-scheme:dark}body{background-color:${DARK_BACKGROUND};--qilin-boot-bg:${DARK_BACKGROUND}}`
  if (preference === 'light') return light
  if (preference === 'dark') return dark
  return `${light}@media(prefers-color-scheme:dark){${dark}}`
}

/** Build the body script that installs the palette selector, font size, and leading. */
function bootThemeBodyScript(
  preference: ThemePreference,
  fontSize: number,
  leading: number,
): string {
  return `(() => {
  const preference = ${JSON.stringify(preference)}
  const systemDark = preference === 'system'
    && typeof matchMedia !== 'undefined'
    && matchMedia('(prefers-color-scheme: dark)').matches
  const dark = preference === 'dark' || systemDark
  document.documentElement.dataset.dsThemeSource = preference
  document.body.toggleAttribute('data-ds-dark-theme', dark)
  document.body.style.setProperty('--qilin-content-font-size', ${JSON.stringify(`${fontSize}px`)})
  document.body.style.setProperty('--qilin-content-leading', ${JSON.stringify(`${leading}px`)})
})()`
}

/**
 * Theme bootstrap rows: head CSS colors the document canvas before
 * first paint, then the body script installs the palette selector and the
 * content font size and leading before the shell mount and module script.
 * @param preference - Current Host-backed built-in preference.
 * @param fontSize - Current Host-backed content font size in px.
 * @param leading - Current Host-backed leading adjustment in px.
 * @returns head style and body script rows in execution order.
 */
export function bootThemeInjections(
  preference: ThemePreference = DEFAULT_PREFERENCE,
  fontSize: number = DEFAULT_FONT_SIZE,
  leading: number = DEFAULT_LEADING,
): IndexInjection[] {
  return [
    { kind: 'style', text: bootThemeStyle(preference) },
    { kind: 'script', placement: 'body', text: bootThemeBodyScript(preference, fontSize, leading) },
  ]
}
