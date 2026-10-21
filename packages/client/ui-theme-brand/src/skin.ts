/**
 * The shipped color packs, shared by the node and browser halves.
 *
 * A pack is one selectable skin: an id, a provider-owned label, the canvas
 * colors the pre-plugin index render paints, and the alias-token overrides for
 * both base palettes. Packs are identified by their palette, never by a
 * product name, so a composition can pick any of them without exposing who
 * uses it.
 */

import type { ThemeTokenOverrides } from '@qilin-agent/client-ui-theme/client'
import { QILIN_PACK, QILIN_TOKENS } from './packs/qilin.ts'
import { MONO_PACK } from './packs/mono.ts'
import { VERDANT_PACK } from './packs/verdant.ts'

/** One selectable color pack as both halves consume it. */
export interface SkinPack {
  /** Stable id persisted by the appearance row. */
  readonly id: string
  /** Provider-owned display name, resolved through the language chain. */
  readonly label: Readonly<{ en: string; readonly [locale: string]: string }>
  /** Canvas colors for the pre-plugin interval, matching the pack's base background. */
  readonly boot: Readonly<{ light: string; dark: string }>
  /** Alias-token overrides; every token states both palettes. */
  readonly tokens: ThemeTokenOverrides
}

/** Every shipped pack, in appearance-row order. */
export const SKIN_PACKS: readonly SkinPack[] = Object.freeze([QILIN_PACK, MONO_PACK, VERDANT_PACK])

/** The dark-gold pack's id, persisted as the product default. */
export const QILIN_SKIN_ID = QILIN_PACK.id

/** The dark-gold pack's display name. */
export const QILIN_SKIN_LABEL = QILIN_PACK.label

/** The dark-gold pack's canvas colors. */
export const QILIN_SKIN_BOOT = QILIN_PACK.boot

export { QILIN_PACK, QILIN_TOKENS }
