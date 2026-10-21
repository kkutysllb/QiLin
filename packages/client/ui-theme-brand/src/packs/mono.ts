/**
 * The monochrome color pack: one neutral ramp from pure white to pure black,
 * with no hue. Accent, canvas, and ink are all greys; the light scheme uses a
 * near-black accent so white on-accent text and focus rings clear AA, and the
 * dark scheme mirrors it with an off-white accent on black.
 *
 * State colors, masks, and the ongoing blue stay with the base palettes, the
 * same omission rule as every pack. Hover darkens the light accent and
 * brightens the dark one, matching each platform's convention.
 */

import type { ThemeTokenOverrides } from '@qilin-agent/client-ui-theme/client'
import type { SkinPack } from '../skin.ts'

/** Monochrome tokens over the platform palettes. Every value states both schemes. */
export const MONO_TOKENS: ThemeTokenOverrides = Object.freeze({
  '--qilin-alias-brand-primary': { light: '#1a1a1a', dark: '#f2f2f2' },
  '--qilin-alias-button-primary-hover': { light: '#000000', dark: '#ffffff' },
  '--qilin-alias-link': { light: '#1f1f1f', dark: '#ededed' },

  '--qilin-alias-bg-base': { light: '#f4f4f4', dark: '#000000' },
  '--qilin-alias-bg-layer-1': { light: '#ffffff', dark: '#0d0d0d' },
  '--qilin-alias-bg-layer-2': { light: '#ffffff', dark: '#141414' },
  '--qilin-alias-bg-layer-3': { light: '#ffffff', dark: '#1c1c1c' },
  '--qilin-alias-bg-overlay': { light: '#e6e6e6', dark: '#3f3f3f' },
  '--qilin-alias-bg-skeleton': { light: 'rgba(20, 20, 20, 0.06)', dark: 'rgba(242, 242, 242, 0.08)' },
  '--qilin-specific-sidebar-fill': { light: '#ececec', dark: '#000000' },
  '--qilin-specific-sidebar-nav-item-hover': { light: '#e6e6e6', dark: '#141414' },
  '--qilin-specific-sidebar-nav-item-active': { light: '#dedede', dark: '#1c1c1c' },
  '--qilin-specific-sidebar-nav-item-active-accent': { light: '#1a1a1a', dark: '#f2f2f2' },

  '--qilin-specific-bubble': { light: '#ededed', dark: '#1a1a1a' },
  '--qilin-specific-input-major': { light: '#ffffff', dark: '#141414' },
  '--qilin-specific-selector': { light: '#f0f0f0', dark: '#1c1c1c' },
  '--qilin-specific-tip': { light: '#f0f0f0', dark: '#1c1c1c' },
  '--qilin-alias-toast-bg': { light: '#262626', dark: '#2b2b2b' },
  '--qilin-alias-tooltip-bg': { light: '#1f1f1f', dark: '#262626' },

  '--qilin-alias-label-primary': { light: '#141414', dark: '#f2f2f2' },
  '--qilin-alias-label-primary-dimmed': { light: '#262626', dark: '#dcdcdc' },
  '--qilin-alias-label-secondary': { light: '#5a5a5a', dark: '#a6a6a6' },
  '--qilin-alias-label-tertiary': { light: '#808080', dark: '#8a8a8a' },
  '--qilin-alias-label-caption': { light: '#969696', dark: '#707070' },
  '--qilin-alias-label-dimmed': { light: '#cfcfcf', dark: '#4a4a4a' },
  '--qilin-alias-label-primary-inverted': { light: '#ffffff', dark: '#141414' },

  '--qilin-alias-border-l1': { light: 'rgba(20, 20, 20, 0.07)', dark: 'rgba(242, 242, 242, 0.07)' },
  '--qilin-alias-border-l2': { light: 'rgba(20, 20, 20, 0.11)', dark: 'rgba(242, 242, 242, 0.12)' },
  '--qilin-alias-border-l2-darkmode-thin': { light: 'rgba(20, 20, 20, 0.11)', dark: 'rgba(242, 242, 242, 0.07)' },
  '--qilin-alias-border-l3': { light: 'rgba(20, 20, 20, 0.13)', dark: 'rgba(242, 242, 242, 0.16)' },
  '--qilin-alias-border-l4': { light: 'rgba(20, 20, 20, 0.17)', dark: 'rgba(242, 242, 242, 0.20)' },
  '--qilin-alias-border-inverted': { light: 'rgba(20, 20, 20, 0)', dark: 'rgba(242, 242, 242, 0.06)' },
  '--qilin-alias-border-inverted2': { light: 'rgba(20, 20, 20, 0)', dark: 'rgba(242, 242, 242, 0.08)' },
  '--qilin-alias-interactive-bg-hover': { light: 'rgba(20, 20, 20, 0.07)', dark: 'rgba(242, 242, 242, 0.08)' },
  '--qilin-alias-interactive-bg-active': { light: 'rgba(20, 20, 20, 0.12)', dark: 'rgba(242, 242, 242, 0.14)' },
  '--qilin-alias-interactive-bg-hover-accent': { light: 'rgba(20, 20, 20, 0.14)', dark: 'rgba(242, 242, 242, 0.24)' },
  '--qilin-alias-interactive-bg-hover-solid': { light: '#ededed', dark: '#1c1c1c' },

  '--qilin-alias-button-contrast-fill': { light: '#5a5a5a', dark: '#f2f2f2' },
  '--qilin-alias-button-elevated-fill': { light: '#ffffff', dark: '#1f1f1f' },
  '--qilin-alias-button-floating-fill': { light: '#ffffff', dark: '#141414' },
  '--qilin-alias-button-floating-hover': { light: '#ededed', dark: '#1c1c1c' },
  '--qilin-alias-button-ghost-active-fill': { light: '#ededed', dark: '#1f1f1f' },
  '--qilin-alias-button-ghost-active-hover': { light: '#e4e4e4', dark: '#2a2a2a' },
  '--qilin-alias-button-ghost-active-border': { light: '#9a9a9a', dark: '#6f6f6f' },
  '--qilin-alias-button-tool-bar-fill': { light: 'rgba(90, 90, 90, 0.5)', dark: 'rgba(160, 160, 160, 0.4)' },
  '--qilin-alias-button-tool-bar-hover': { light: 'rgba(90, 90, 90, 0.6)', dark: 'rgba(160, 160, 160, 0.5)' },
  '--qilin-alias-button-tool-bar-fill-invisible': { light: 'rgba(20, 20, 20, 0.36)', dark: 'rgba(30, 30, 30, 0.36)' },

  '--qilin-alias-markdown-code-block': { light: '#efefef', dark: '#101010' },
  '--qilin-alias-markdown-code-block-banner': { light: '#e8e8e8', dark: '#171717' },
  '--qilin-alias-markdown-inline-code': { light: '#eeeeee', dark: '#1a1a1a' },
  '--qilin-alias-markdown-citation': { light: '#eaeaea', dark: '#1a1a1a' },
  '--qilin-alias-markdown-tag': { light: '#ededed', dark: '#141414' },
  '--qilin-alias-scrollbar-bg-l1': { light: '#dcdcdc', dark: '#3a3a3a' },
  '--qilin-alias-scrollbar-bg-l2': { light: '#dcdcdc', dark: '#4a4a4a' },
  '--qilin-alias-scrollbar-hover-l1': { light: '#cfcfcf', dark: '#4a4a4a' },
  '--qilin-alias-scrollbar-hover-l2': { light: '#cfcfcf', dark: '#5a5a5a' },
})

/** The monochrome pack as one selectable skin. */
export const MONO_PACK: SkinPack = Object.freeze({
  id: 'mono',
  label: Object.freeze({ zh: '黑白', en: 'Mono' }),
  boot: Object.freeze({ light: '#f4f4f4', dark: '#000000' }),
  tokens: MONO_TOKENS,
})
