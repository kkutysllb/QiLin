/**
 * Appearance and font row slot stores: mirrors of the theme service
 * snapshot. The plugin's apply-world change listener is the only writer; the
 * row components read via props.useStore.
 */
import { defineStore, type EngineStoreHandle } from '@qilin-agent/client-store'
import {
  DEFAULT_FONT_SIZES, DEFAULT_SKIN, type FontFamilies, type FontSizes, type ThemePreference,
} from '../theme-settings.ts'

/** One registered skin as the row renders it: id plus the label resolved for the active language. */
export interface AppearanceSkinOption {
  /** Skin id written by the row's `setSkin`. */
  id: string
  /** Display name resolved through the registry's language chain. */
  label: string
}

/** Store state mirrored from the theme snapshot. */
export interface AppearanceRowState {
  /** Persisted preference (selection state reads this, never the resolved active theme). */
  preference: ThemePreference
  /** Persisted skin selection (an empty id keeps the platform palette). */
  skin: string
  /** Registered skins in registration order. */
  skins: readonly AppearanceSkinOption[]
  /** Service revision; -1 until first sync so revision 0 lands as a change. */
  revision: number
}

/** Declared action shape giving the exported factory a stable return type. */
type AppearanceRowActions = {
  sync: (draft: AppearanceRowState, preference: ThemePreference, skin: string, revision: number) => void
  syncSkins: (draft: AppearanceRowState, skins: readonly AppearanceSkinOption[]) => void
}

/**
 * Declares the Appearance row state and write surface.
 * @returns the store handle.
 */
export function createAppearanceRowStore(): EngineStoreHandle<AppearanceRowState, AppearanceRowActions> {
  return defineStore({
    init: (): AppearanceRowState => ({ preference: 'system', skin: DEFAULT_SKIN, skins: [], revision: -1 }),
    actions: {
      sync: (d, preference: ThemePreference, skin: string, revision: number) => {
        if (revision <= d.revision) return
        d.preference = preference
        d.skin = skin
        d.revision = revision
      },
      // Labels are resolved for the active language, so a language switch rewrites
      // them without a theme revision change.
      syncSkins: (d, skins: readonly AppearanceSkinOption[]) => {
        d.skins = skins
      },
    },
  })
}

/** Store state mirrored from the theme snapshot's fonts (shared by the font-size row and the font settings group). */
export interface FontRowState {
  /** Persisted font sizes in px by role. */
  fontSizes: FontSizes
  /** Persisted normalized font lists by role. */
  fontFamilies: FontFamilies
  /** Service revision; -1 until first sync so revision 0 lands as a change. */
  revision: number
}

/** Declared action shape giving the exported factory a stable return type. */
type FontRowActions = {
  sync: (draft: FontRowState, fontSizes: FontSizes, fontFamilies: FontFamilies, revision: number) => void
}

/**
 * Declares the font rows' state and write surface.
 * @returns the store handle.
 */
export function createFontRowStore(): EngineStoreHandle<FontRowState, FontRowActions> {
  return defineStore({
    init: (): FontRowState => ({ fontSizes: DEFAULT_FONT_SIZES, fontFamilies: { text: '', code: '', terminal: '' }, revision: -1 }),
    actions: {
      sync: (d, fontSizes: FontSizes, fontFamilies: FontFamilies, revision: number) => {
        if (revision <= d.revision) return
        d.fontSizes = fontSizes
        d.fontFamilies = fontFamilies
        d.revision = revision
      },
    },
  })
}
