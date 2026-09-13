/** QiLin alias-token overrides, applied as one layer over the active palette. */

import type { ThemeTokenOverrides } from '@qilin/client-ui-theme/client'

/**
 * The layer source id. One layer per source, so this names the origin in
 * `ctx.theme` inspection and makes re-application replace rather than stack.
 */
export const QILIN_THEME_SOURCE = '@qilin/client-ui-theme-brand'

/**
 * QiLin's brand surfaces. Both palette modes are stated because an override
 * layer supplies the value per active scheme.
 *
 * `--dsw-specific-brand-seal-fill` carries the cinnabar of the QiLin seal for
 * surfaces that must match the stamp. Its two values are the seal body
 * gradient's own stops (`ui-brand` Seal.tsx): the mid stop on light surfaces
 * and the lit upper stop on dark ones, so the label clears 4.5:1 against both
 * `#ffffff` and the neutral `#0f0f0f` sidebar. Changing the seal gradient
 * means changing this token with it.
 *
 * `--dsw-specific-sidebar-fill` is the column's own surface: white on the
 * light palette and the platform's neutral dark on the dark one, so the
 * sidebar reads as the same surface family as the centre rather than as a
 * tinted panel.
 */
export const QILIN_TOKENS: ThemeTokenOverrides = Object.freeze({
  '--dsw-alias-brand-primary': { light: '#0b7a5a', dark: '#3fd6a0' },
  '--dsw-specific-sidebar-fill': { light: '#ffffff', dark: '#0f0f0f' },
  '--dsw-specific-brand-seal-fill': { light: '#c3402f', dark: '#d4503d' },
})
