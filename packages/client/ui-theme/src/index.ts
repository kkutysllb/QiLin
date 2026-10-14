/** Host registration for the browser theme preference and pre-plugin palette. */

import type { Context } from '@qilin-agent/kylin'
import type {} from '@qilin-agent/host-webserver'
import type {} from '@qilin-agent/settings'
import { bootThemeInjections } from './boot-theme.ts'
import {
  DEFAULT_FONT_SIZE, DEFAULT_PREFERENCE, FONT_FAMILY_FIELDS, FONT_SIZE_SPECS,
  THEME_SETTINGS_NAMESPACE, ThemeSettingsSchema,
  sectionFontSizes, type FontFamilies, type ThemeSettings,
} from './theme-settings.ts'

export {
  DEFAULT_FONT_SIZE, DEFAULT_PREFERENCE,
  FONT_FAMILY_FIELDS, FONT_SIZE_FIELD, FONT_SIZE_MAX, FONT_SIZE_MIN,
  FONT_ROLES, FONT_SIZE_SPECS,
  THEME_PREFERENCE_FIELD, THEME_PREFERENCES, THEME_SETTINGS_NAMESPACE,
  type FontFamilies, type FontRole, type FontSizes, type ThemePreference, type ThemeSettings,
} from './theme-settings.ts'

/** Font-family lists read from a settings section, keyed by role. */
export function sectionFontFamilies(section: ThemeSettings): FontFamilies {
  return Object.freeze({
    text: section[FONT_FAMILY_FIELDS.text],
    code: section[FONT_FAMILY_FIELDS.code],
    terminal: section[FONT_FAMILY_FIELDS.terminal],
  })
}

const THEME_NAMESPACE = THEME_SETTINGS_NAMESPACE

/** Read the registered theme section or the schema defaults without a settings provider. */
function readSection(ctx: Context): ThemeSettings {
  const fallback: ThemeSettings = {
    preference: DEFAULT_PREFERENCE, fontSize: DEFAULT_FONT_SIZE,
    codeFontSize: FONT_SIZE_SPECS.code.default, terminalFontSize: FONT_SIZE_SPECS.terminal.default,
    textFontFamily: '', codeFontFamily: '', terminalFontFamily: '',
  }
  const settings = ctx.get('settings')
  if (settings === undefined) return fallback
  const section = settings.get(THEME_NAMESPACE) as ThemeSettings | undefined
  if (section === undefined) return fallback
  return section
}

/**
 * Register the durable theme section when the optional settings service is
 * composed, and answer every index injection collection with the current
 * theme bootstrap row (palette plus the three font roles).
 * @param ctx - Host context that may acquire the settings service.
 */
export function apply(ctx: Context): void {
  ctx.inject(['settings'], (settingsCtx) => {
    settingsCtx.settings.register(THEME_NAMESPACE, ThemeSettingsSchema)
  })
  ctx.on('webserver/index-inject', (table) => {
    const section = readSection(ctx)
    table.push(...bootThemeInjections(section.preference, sectionFontSizes(section), sectionFontFamilies(section)))
  }, { prepend: true })
}
