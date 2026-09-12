/** QiLin alias-token overrides, applied as one layer over the active palette. */

import type { ThemeTokenOverrides } from '@qilin/client-ui-theme/client'

/**
 * The layer source id. One layer per source, so this names the origin in
 * `ctx.theme` inspection and makes re-application replace rather than stack.
 */
export const QILIN_THEME_SOURCE = '@qilin/client-ui-theme-qilin'

/**
 * QiLin's brand surfaces. Both palette modes are stated because an override
 * layer supplies the value per active scheme.
 */
export const QILIN_TOKENS: ThemeTokenOverrides = Object.freeze({
  '--dsw-alias-brand-primary': { light: '#0b7a5a', dark: '#3fd6a0' },
  '--dsw-specific-sidebar-fill': { light: '#f1f7f4', dark: '#0e1a16' },
})
