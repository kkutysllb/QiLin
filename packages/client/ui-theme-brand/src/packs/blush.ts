/**
 * The blush color pack: warm pink-paper surfaces with a deep rose accent in the
 * light scheme, and a dim rose canvas with a pale pink accent in the dark one.
 *
 * The identity tint is 浅樱 (#e8a0b4); WCAG AA governs where text sits on it,
 * so fills and links deepen to #b25b74 (white on it clears 4.9:1, and it clears
 * 4.9:1 on the #fbf6f4 paper) while the pale tint stays for selection and
 * decoration only. State colors, masks, and the ongoing blue stay with the base
 * palettes, the same omission rule as every pack. Hover darkens the light accent
 * and brightens the dark one, matching each platform's convention.
 */

import type { ThemeTokenOverrides } from '@qilin-agent/client-ui-theme/client'
import type { SkinPack } from '../skin.ts'

/** Blush tokens over the platform palettes. Every value states both schemes. */
export const BLUSH_TOKENS: ThemeTokenOverrides = Object.freeze({
  '--qilin-alias-brand-primary': { light: '#b25b74', dark: '#f2bccb' },
  '--qilin-alias-button-primary-hover': { light: '#9d4e66', dark: '#ffd6e0' },
  '--qilin-alias-link': { light: '#a04f66', dark: '#f6cdd9' },

  '--qilin-alias-bg-base': { light: '#fbf6f4', dark: '#141010' },
  '--qilin-alias-bg-layer-1': { light: '#fffdfc', dark: '#1b1616' },
  '--qilin-alias-bg-layer-2': { light: '#fdf8f6', dark: '#221b1b' },
  '--qilin-alias-bg-layer-3': { light: '#f8f1ef', dark: '#291f1f' },
  '--qilin-alias-bg-overlay': { light: '#f5e9e7', dark: '#3a2a2e' },
  '--qilin-alias-bg-skeleton': { light: 'rgba(120, 60, 76, 0.06)', dark: 'rgba(242, 188, 203, 0.08)' },
  '--qilin-specific-sidebar-fill': { light: '#f8f1ef', dark: '#141010' },
  '--qilin-specific-sidebar-nav-item-hover': { light: '#f4e8e6', dark: '#241b1d' },
  '--qilin-specific-sidebar-nav-item-active': { light: '#f0e0df', dark: '#2e2024' },
  '--qilin-specific-sidebar-nav-item-active-accent': { light: '#b25b74', dark: '#f2bccb' },

  '--qilin-specific-bubble': { light: '#fbeef0', dark: '#241a1c' },
  '--qilin-specific-input-major': { light: '#fffdfc', dark: '#1c1617' },
  '--qilin-specific-selector': { light: '#f9efee', dark: '#2e2024' },
  '--qilin-specific-tip': { light: '#f9efee', dark: '#2e2024' },
  '--qilin-alias-toast-bg': { light: '#2b1f23', dark: '#2b2124' },
  '--qilin-alias-tooltip-bg': { light: '#261b1f', dark: '#2b2124' },

  '--qilin-alias-label-primary': { light: '#23191c', dark: '#f0e6e8' },
  '--qilin-alias-label-secondary': { light: '#6d5b61', dark: '#b9a6ac' },
  '--qilin-alias-label-tertiary': { light: '#8c7a80', dark: '#93838a' },

  '--qilin-alias-border-l1': { light: 'rgba(120, 60, 76, 0.08)', dark: 'rgba(242, 188, 203, 0.08)' },
  '--qilin-alias-border-l2': { light: 'rgba(120, 60, 76, 0.12)', dark: 'rgba(242, 188, 203, 0.14)' },
  '--qilin-alias-border-l3': { light: 'rgba(120, 60, 76, 0.16)', dark: 'rgba(242, 188, 203, 0.18)' },
})

/** The blush pack as the appearance row consumes it. */
export const BLUSH_PACK: SkinPack = Object.freeze({
  id: 'blush',
  label: Object.freeze({ en: 'Blush', zh: '浅樱' }),
  boot: Object.freeze({ light: '#fbf6f4', dark: '#141010' }),
  tokens: BLUSH_TOKENS,
})
