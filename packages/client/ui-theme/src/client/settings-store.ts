/**
 * Typography settings-row slot store: a mirror of the theme service snapshot.
 * The plugin's apply-world change listener is the only writer; the font-size
 * and line-spacing rows read their field via props.useStore.
 */
import { defineStore, type EngineStoreHandle } from '@qilin/client-store'
import { DEFAULT_FONT_SIZE, DEFAULT_LEADING } from '../theme-settings.ts'

/** Store state mirrored from the theme snapshot's typography fields. */
export interface TypographyRowState {
  /** Persisted content font size in px. */
  fontSize: number
  /** Persisted leading adjustment in px; 0 keeps the shipped line heights. */
  leading: number
  /** Service revision; -1 until first sync so revision 0 lands as a change. */
  revision: number
}

/** Declared action shape giving the exported factory a stable return type. */
type TypographyRowActions = {
  sync: (draft: TypographyRowState, fontSize: number, leading: number, revision: number) => void
}

/**
 * Declares the shared typography-row state and write surface.
 * @returns the store handle.
 */
export function createTypographyRowStore(): EngineStoreHandle<TypographyRowState, TypographyRowActions> {
  return defineStore({
    init: (): TypographyRowState => ({ fontSize: DEFAULT_FONT_SIZE, leading: DEFAULT_LEADING, revision: -1 }),
    actions: {
      sync: (d, fontSize: number, leading: number, revision: number) => {
        if (revision <= d.revision) return
        d.fontSize = fontSize
        d.leading = leading
        d.revision = revision
      },
    },
  })
}
