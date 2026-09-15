/**
 * Theme bootstrap row for the browser's pre-plugin interval. Each index
 * render embeds the current durable built-in preference, content font size,
 * and leading adjustment; the browser resolves only `system`, then writes the
 * same DOM fields ui-layout's ThemePresenter owns after the client plugin tree
 * activates.
 */

import type { IndexInjection } from '@qilin/host-webserver'
import {
  DEFAULT_FONT_SIZE, DEFAULT_LEADING, DEFAULT_PREFERENCE, type ThemePreference,
} from './theme-settings.ts'

/** Build the inline script body for one schema-validated durable theme section. */
function bootThemeScript(preference: ThemePreference, fontSize: number, leading: number): string {
  return `(() => {
  const preference = ${JSON.stringify(preference)}
  const systemDark = preference === 'system'
    && typeof matchMedia !== 'undefined'
    && matchMedia('(prefers-color-scheme: dark)').matches
  const dark = preference === 'dark' || systemDark
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light'
  document.body.toggleAttribute('data-ds-dark-theme', dark)
  document.body.style.setProperty('--qilin-content-font-size', ${JSON.stringify(`${fontSize}px`)})
  document.body.style.setProperty('--qilin-content-leading', ${JSON.stringify(`${leading}px`)})
})()`
}

/**
 * The theme bootstrap as an injection row: an inline script immediately after
 * the opening body tag, before the shell mount and module script.
 * @param preference - Current Host-backed built-in preference.
 * @param fontSize - Current Host-backed content font size in px.
 * @param leading - Current Host-backed leading adjustment in px.
 * @returns the body script row.
 */
export function bootThemeInjection(
  preference: ThemePreference = DEFAULT_PREFERENCE,
  fontSize: number = DEFAULT_FONT_SIZE,
  leading: number = DEFAULT_LEADING,
): IndexInjection {
  return { kind: 'script', placement: 'body', text: bootThemeScript(preference, fontSize, leading) }
}
