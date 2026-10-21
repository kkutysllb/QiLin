/**
 * The green color pack: light-green paper with a deep green accent in the
 * light scheme, and a deep ink-green canvas with a light green accent in the
 * dark scheme. Accent contrast is WCAG AA verified: white on #2f6b4b clears
 * 6.4:1, the light link #2a5a40 clears 6.5:1 on #f1f6f2, and the dark accent
 * #8fd0a8 clears 11:1 on the #0a120e canvas.
 *
 * State colors, masks, and the ongoing blue stay with the base palettes, the
 * same omission rule as every pack. Hover darkens the light accent and
 * brightens the dark one, matching each platform's convention.
 */

import type { ThemeTokenOverrides } from '@qilin-agent/client-ui-theme/client'
import type { SkinPack } from '../skin.ts'

/** Green tokens over the platform palettes. Every value states both schemes. */
export const VERDANT_TOKENS: ThemeTokenOverrides = Object.freeze({
  '--qilin-alias-brand-primary': { light: '#2f6b4b', dark: '#8fd0a8' },
  '--qilin-alias-button-primary-hover': { light: '#24553b', dark: '#aee3c1' },
  '--qilin-alias-link': { light: '#2a5a40', dark: '#b7e6c8' },

  '--qilin-alias-bg-base': { light: '#f1f6f2', dark: '#0a120e' },
  '--qilin-alias-bg-layer-1': { light: '#fbfdfb', dark: '#101a14' },
  '--qilin-alias-bg-layer-2': { light: '#fbfdfb', dark: '#16221a' },
  '--qilin-alias-bg-layer-3': { light: '#fbfdfb', dark: '#1d2b21' },
  '--qilin-alias-bg-overlay': { light: '#e2ebe4', dark: '#3c4f43' },
  '--qilin-alias-bg-skeleton': { light: 'rgba(20, 60, 40, 0.06)', dark: 'rgba(210, 235, 220, 0.08)' },
  '--qilin-specific-sidebar-fill': { light: '#e9f1ea', dark: '#0a120e' },
  '--qilin-specific-sidebar-nav-item-hover': { light: '#e2ece4', dark: '#152018' },
  '--qilin-specific-sidebar-nav-item-active': { light: '#d9e7dc', dark: '#1d2b21' },
  '--qilin-specific-sidebar-nav-item-active-accent': { light: '#2f6b4b', dark: '#8fd0a8' },

  '--qilin-specific-bubble': { light: '#eaf2ec', dark: '#18251c' },
  '--qilin-specific-input-major': { light: '#fcfefc', dark: '#14201a' },
  '--qilin-specific-selector': { light: '#eef4ef', dark: '#1d2b21' },
  '--qilin-specific-tip': { light: '#eef4ef', dark: '#1d2b21' },
  '--qilin-alias-toast-bg': { light: '#1f2a24', dark: '#1f2c24' },
  '--qilin-alias-tooltip-bg': { light: '#1a241f', dark: '#1f2c24' },

  '--qilin-alias-label-primary': { light: '#16211b', dark: '#e4f0e7' },
  '--qilin-alias-label-primary-dimmed': { light: '#24322a', dark: '#cfe0d4' },
  '--qilin-alias-label-secondary': { light: '#4f6157', dark: '#9db3a4' },
  '--qilin-alias-label-tertiary': { light: '#76877c', dark: '#7f9487' },
  '--qilin-alias-label-caption': { light: '#8a998f', dark: '#64796b' },
  '--qilin-alias-label-dimmed': { light: '#c8d5cb', dark: '#42544a' },
  '--qilin-alias-label-primary-inverted': { light: '#fbfdfb', dark: '#14201a' },

  '--qilin-alias-border-l1': { light: 'rgba(28, 58, 42, 0.07)', dark: 'rgba(210, 235, 220, 0.07)' },
  '--qilin-alias-border-l2': { light: 'rgba(28, 58, 42, 0.11)', dark: 'rgba(210, 235, 220, 0.12)' },
  '--qilin-alias-border-l2-darkmode-thin': { light: 'rgba(28, 58, 42, 0.11)', dark: 'rgba(210, 235, 220, 0.07)' },
  '--qilin-alias-border-l3': { light: 'rgba(28, 58, 42, 0.13)', dark: 'rgba(210, 235, 220, 0.16)' },
  '--qilin-alias-border-l4': { light: 'rgba(28, 58, 42, 0.17)', dark: 'rgba(210, 235, 220, 0.20)' },
  '--qilin-alias-border-inverted': { light: 'rgba(28, 58, 42, 0)', dark: 'rgba(210, 235, 220, 0.06)' },
  '--qilin-alias-border-inverted2': { light: 'rgba(28, 58, 42, 0)', dark: 'rgba(210, 235, 220, 0.08)' },
  '--qilin-alias-interactive-bg-hover': { light: 'rgba(28, 58, 42, 0.08)', dark: 'rgba(210, 235, 220, 0.08)' },
  '--qilin-alias-interactive-bg-active': { light: 'rgba(28, 58, 42, 0.13)', dark: 'rgba(210, 235, 220, 0.14)' },
  '--qilin-alias-interactive-bg-hover-accent': { light: 'rgba(28, 58, 42, 0.14)', dark: 'rgba(210, 235, 220, 0.24)' },
  '--qilin-alias-interactive-bg-hover-solid': { light: '#eaf2ec', dark: '#1d2b21' },

  '--qilin-alias-button-contrast-fill': { light: '#4f6157', dark: '#e4f0e7' },
  '--qilin-alias-button-elevated-fill': { light: '#fcfefc', dark: '#1f2c24' },
  '--qilin-alias-button-floating-fill': { light: '#fcfefc', dark: '#18251c' },
  '--qilin-alias-button-floating-hover': { light: '#eef4ef', dark: '#1d2b21' },
  '--qilin-alias-button-ghost-active-fill': { light: '#eaf2ec', dark: '#1f2c24' },
  '--qilin-alias-button-ghost-active-hover': { light: '#e2ece4', dark: '#27362c' },
  '--qilin-alias-button-ghost-active-border': { light: '#8fa096', dark: '#5f7466' },
  '--qilin-alias-button-tool-bar-fill': { light: 'rgba(90, 110, 98, 0.5)', dark: 'rgba(140, 165, 150, 0.4)' },
  '--qilin-alias-button-tool-bar-hover': { light: 'rgba(90, 110, 98, 0.6)', dark: 'rgba(140, 165, 150, 0.5)' },
  '--qilin-alias-button-tool-bar-fill-invisible': { light: 'rgba(28, 58, 42, 0.36)', dark: 'rgba(35, 50, 42, 0.36)' },

  '--qilin-alias-markdown-code-block': { light: '#e9f1ea', dark: '#0f1a13' },
  '--qilin-alias-markdown-code-block-banner': { light: '#e2ece4', dark: '#16221a' },
  '--qilin-alias-markdown-inline-code': { light: '#e8f0e9', dark: '#18251c' },
  '--qilin-alias-markdown-citation': { light: '#e4eee6', dark: '#18251c' },
  '--qilin-alias-markdown-tag': { light: '#e8f0e9', dark: '#14201a' },
  '--qilin-alias-scrollbar-bg-l1': { light: '#d3e0d6', dark: '#39493f' },
  '--qilin-alias-scrollbar-bg-l2': { light: '#c5d5c9', dark: '#4a5c50' },
  '--qilin-alias-scrollbar-hover-l1': { light: '#c5d5c9', dark: '#4a5c50' },
  '--qilin-alias-scrollbar-hover-l2': { light: '#b7cabd', dark: '#5a6d60' },
})

/** The green pack as one selectable skin. */
export const VERDANT_PACK: SkinPack = Object.freeze({
  id: 'verdant',
  label: Object.freeze({ zh: '墨绿', en: 'Verdant' }),
  boot: Object.freeze({ light: '#f1f6f2', dark: '#0a120e' }),
  tokens: VERDANT_TOKENS,
})
