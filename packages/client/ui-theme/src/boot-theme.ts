/**
 * Theme bootstrap row for the browser's pre-plugin interval. Each index
 * render embeds the current durable preference, font sizes, font-family lists,
 * and the selected skin's canvas colors. Head CSS colors the document canvas
 * before script execution; the body script installs the palette selector and
 * font variables that the client presenters adopt.
 */

import type { IndexInjection } from '@qilin-agent/host-webserver'
import {
  DEFAULT_FONT_SIZES, DEFAULT_PREFERENCE, FONT_ROLES, FONT_SIZE_SPECS, fontFamilyVariable, normalizeFontFamily,
  type FontFamilies, type FontSizes, type ThemePreference,
} from './theme-settings.ts'

/** Canvas background one skin contributes for each base palette. */
export interface SkinBootColors {
  /** Background while the light base palette is active. */
  light: string
  /** Background while the dark base palette is active. */
  dark: string
}

/** Canvas colors the platform palettes paint when no skin supplies its own. */
export const PLATFORM_BOOT_COLORS: SkinBootColors = Object.freeze({ light: '#fff', dark: '#151517' })

/** CSS that colors the document canvas before any script executes. */
function bootThemeStyle(preference: ThemePreference, colors: SkinBootColors): string {
  const light = `:root{color-scheme:light}body{background-color:${colors.light};--qilin-boot-bg:${colors.light}}`
  const dark = `:root{color-scheme:dark}body{background-color:${colors.dark};--qilin-boot-bg:${colors.dark}}`
  if (preference === 'light') return light
  if (preference === 'dark') return dark
  return `${light}@media(prefers-color-scheme:dark){${dark}}`
}

/** Build the body script that installs the palette selector and font variables. */
function bootThemeBodyScript(preference: ThemePreference, fontSizes: FontSizes, fontFamilies: FontFamilies): string {
  const sizes = FONT_ROLES.map(role =>
    `\n  document.body.style.setProperty(${JSON.stringify(FONT_SIZE_SPECS[role].variable)}, ${JSON.stringify(`${fontSizes[role]}px`)})`).join('')
  const families = FONT_ROLES.flatMap((kind) => {
    const list = normalizeFontFamily(fontFamilies[kind])
    return list === '' ? [] : [`\n  document.body.style.setProperty(${JSON.stringify(fontFamilyVariable(kind))}, ${JSON.stringify(list)})`]
  }).join('')
  return `(() => {
  const preference = ${JSON.stringify(preference)}
  const systemDark = preference === 'system'
    && typeof matchMedia !== 'undefined'
    && matchMedia('(prefers-color-scheme: dark)').matches
  const dark = preference === 'dark' || systemDark
  document.documentElement.dataset.dsThemeSource = preference
  document.body.toggleAttribute('data-ds-dark-theme', dark)${sizes}${families}
})()`
}

/**
 * Theme bootstrap rows: head CSS colors the document canvas before
 * first paint, then the body script installs the palette selector and font
 * size and font families before the shell mount and module script.
 * @param preference - Current Host-backed built-in preference.
 * @param fontSizes - Current Host-backed font sizes in px by role.
 * @param fontFamilies - Current Host-backed font lists; each is normalized before embedding.
 * @param colors - Canvas colors of the selected skin, or {@link PLATFORM_BOOT_COLORS}.
 * @returns head and body script rows in execution order.
 */
export function bootThemeInjections(
  preference: ThemePreference = DEFAULT_PREFERENCE,
  fontSizes: FontSizes = DEFAULT_FONT_SIZES,
  fontFamilies: FontFamilies = { text: '', code: '', terminal: '' },
  colors: SkinBootColors = PLATFORM_BOOT_COLORS,
): IndexInjection[] {
  return [
    { kind: 'style', text: bootThemeStyle(preference, colors) },
    { kind: 'script', placement: 'body', text: bootThemeBodyScript(preference, fontSizes, fontFamilies) },
  ]
}
