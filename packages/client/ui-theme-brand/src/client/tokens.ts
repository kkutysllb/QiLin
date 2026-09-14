/**
 * QiLin alias-token overrides, applied as one layer over the active palette.
 *
 * The palette is the "玄金麒麟" (dark-gold) landing VI extended to both
 * schemes: the dark values transplant the landing page's tokens verbatim
 * (apps/web/src/landing/landing.css), the light values derive the matching
 * warm-paper variant because the landing VI ships no light mode. Accent
 * contrast is WCAG AA verified: the deep link gold #7d6126 clears 5.3:1 on
 * paper #f8f5ee where the VI's gold-700 #8f6f2e reaches only 4.3:1, and
 * white on gold-700 (light primary buttons) holds 4.7:1.
 *
 * Omitted on purpose: state colors (error/success/warn/info), the ongoing
 * blue state-business family (kept distinct from warn amber), masks, and
 * tokens with no current component consumer. Hover follows each platform's
 * convention: dark schemes brighten (landing CTA gold-500 -> gold-300),
 * light schemes darken (gold-700 -> #7d6126).
 */

import type { ThemeTokenOverrides } from '@qilin/client-ui-theme/client'

/**
 * The layer source id. One layer per source, so this names the origin in
 * `ctx.theme` inspection and makes re-application replace rather than stack.
 */
export const QILIN_THEME_SOURCE = '@qilin/client-ui-theme-brand'

/**
 * QiLin's brand tokens over the platform palettes. Every value states both
 * schemes (the ThemeTokenModes contract), grouped by surface family.
 */
export const QILIN_TOKENS: ThemeTokenOverrides = Object.freeze({
  /* Brand gold: dark carries the landing gold-500 accent (8.2:1 on the dark
     canvas), light deepens to gold-700 so white on-primary text and focus
     rings clear AA on paper. Primary-button hover mirrors the landing CTA
     (brighten to gold-300) on dark and the platform's darken convention on
     light. */
  '--dsw-alias-brand-primary': { light: '#8f6f2e', dark: '#c9a24a' },
  '--dsw-alias-button-primary-hover': { light: '#7d6126', dark: '#f3dc9e' },
  '--dsw-alias-link': { light: '#7d6126', dark: '#f3dc9e' },

  /* Surfaces: dark is the landing stack verbatim (bg/surface/raised plus one
     derived step for layer-3), light keeps the platform's light design of
     near-white layers over a warm-paper canvas. The sidebar joins the canvas
     family in both schemes, as the landing header sits on its background. */
  '--dsw-alias-bg-base': { light: '#f8f5ee', dark: '#0d0b09' },
  '--dsw-alias-bg-layer-1': { light: '#fdfbf5', dark: '#16130f' },
  '--dsw-alias-bg-layer-2': { light: '#fdfbf5', dark: '#1d1915' },
  '--dsw-alias-bg-layer-3': { light: '#fdfbf5', dark: '#26211c' },
  '--dsw-alias-bg-overlay': { light: '#e9e3d6', dark: '#4f4939' },
  '--dsw-alias-bg-skeleton': { light: 'rgba(64, 52, 30, 0.06)', dark: 'rgba(239, 233, 223, 0.08)' },
  '--dsw-specific-sidebar-fill': { light: '#f1ece0', dark: '#0d0b09' },
  '--dsw-specific-sidebar-nav-item-hover': { light: '#ede7d9', dark: '#1a1611' },
  '--dsw-specific-sidebar-nav-item-active': { light: '#e8e1d0', dark: '#221d16' },
  '--dsw-specific-sidebar-nav-item-active-accent': { light: '#8f6f2e', dark: '#c9a24a' },

  /* Component surfaces: user bubbles, the composer input, selectors, tips,
     and the dark floating toasts/tooltips, all re-hued warm. */
  '--dsw-specific-bubble': { light: '#f3edde', dark: '#221d17' },
  '--dsw-specific-input-major': { light: '#fffdf8', dark: '#211c16' },
  '--dsw-specific-selector': { light: '#f4f0e6', dark: '#26211c' },
  '--dsw-specific-tip': { light: '#f4f0e6', dark: '#26211c' },
  '--dsw-alias-toast-bg': { light: '#2c261d', dark: '#2b251d' },
  '--dsw-alias-tooltip-bg': { light: '#241f17', dark: '#2b251d' },

  /* Ink: dark is the landing ink ramp (hi/mid/low), light is its warm
     near-black counterpart over paper; tertiary and caption keep the base
     palettes' relative dimming steps. */
  '--dsw-alias-label-primary': { light: '#221d15', dark: '#efe9df' },
  '--dsw-alias-label-primary-dimmed': { light: '#332c21', dark: '#ded6c8' },
  '--dsw-alias-label-secondary': { light: '#5f5749', dark: '#a89f90' },
  '--dsw-alias-label-tertiary': { light: '#857c6c', dark: '#8a8172' },
  '--dsw-alias-label-caption': { light: '#988e7c', dark: '#75705f' },
  '--dsw-alias-label-dimmed': { light: '#d3ccbc', dark: '#4f4a3f' },
  '--dsw-alias-label-primary-inverted': { light: '#fdfbf5', dark: '#221d15' },

  /* Hairlines and hovers: the base palettes' black/white alpha washes
     re-based on warm ink (#efe9df dark, #3c301a light) at the same steps. */
  '--dsw-alias-border-l1': { light: 'rgba(60, 48, 26, 0.07)', dark: 'rgba(239, 233, 223, 0.07)' },
  '--dsw-alias-border-l2': { light: 'rgba(60, 48, 26, 0.11)', dark: 'rgba(239, 233, 223, 0.12)' },
  '--dsw-alias-border-l2-darkmode-thin': { light: 'rgba(60, 48, 26, 0.11)', dark: 'rgba(239, 233, 223, 0.07)' },
  '--dsw-alias-border-l3': { light: 'rgba(60, 48, 26, 0.13)', dark: 'rgba(239, 233, 223, 0.16)' },
  '--dsw-alias-border-l4': { light: 'rgba(60, 48, 26, 0.17)', dark: 'rgba(239, 233, 223, 0.20)' },
  '--dsw-alias-border-inverted': { light: 'rgba(60, 48, 26, 0)', dark: 'rgba(239, 233, 223, 0.06)' },
  '--dsw-alias-border-inverted2': { light: 'rgba(60, 48, 26, 0)', dark: 'rgba(239, 233, 223, 0.08)' },
  '--dsw-alias-interactive-bg-hover': { light: 'rgba(101, 82, 40, 0.08)', dark: 'rgba(239, 233, 223, 0.08)' },
  '--dsw-alias-interactive-bg-active': { light: 'rgba(101, 82, 40, 0.13)', dark: 'rgba(239, 233, 223, 0.14)' },
  '--dsw-alias-interactive-bg-hover-accent': { light: 'rgba(101, 82, 40, 0.14)', dark: 'rgba(239, 233, 223, 0.24)' },
  '--dsw-alias-interactive-bg-hover-solid': { light: '#f0ebdf', dark: '#26211c' },

  /* Secondary button family: the neutral fills the platform paints in each
     mode, re-hued to the warm neutrals at the same depth steps. */
  '--dsw-alias-button-contrast-fill': { light: '#5f5749', dark: '#efe9df' },
  '--dsw-alias-button-elevated-fill': { light: '#fffdf8', dark: '#2b251c' },
  '--dsw-alias-button-floating-fill': { light: '#fffdf8', dark: '#211c16' },
  '--dsw-alias-button-floating-hover': { light: '#f0ebdf', dark: '#26211c' },
  '--dsw-alias-button-ghost-active-fill': { light: '#f0ebdf', dark: '#2b251c' },
  '--dsw-alias-button-ghost-active-hover': { light: '#e9e3d4', dark: '#332c22' },
  '--dsw-alias-button-ghost-active-border': { light: '#9a9080', dark: '#77705f' },
  '--dsw-alias-button-tool-bar-fill': { light: 'rgba(96, 88, 70, 0.5)', dark: 'rgba(140, 128, 100, 0.4)' },
  '--dsw-alias-button-tool-bar-hover': { light: 'rgba(96, 88, 70, 0.6)', dark: 'rgba(140, 128, 100, 0.5)' },
  '--dsw-alias-button-tool-bar-fill-invisible': { light: 'rgba(60, 48, 26, 0.36)', dark: 'rgba(45, 40, 31, 0.36)' },

  /* Code surfaces and scrollbars: the neutral reading surfaces move to warm
     parchment (light) and the landing's deep warm stack (dark). */
  '--dsw-alias-markdown-code-block': { light: '#f4efe3', dark: '#191511' },
  '--dsw-alias-markdown-code-block-banner': { light: '#efe9da', dark: '#211c16' },
  '--dsw-alias-markdown-inline-code': { light: '#f3eee0', dark: '#221d17' },
  '--dsw-alias-markdown-citation': { light: '#efe9db', dark: '#221d17' },
  '--dsw-alias-markdown-tag': { light: '#f1ecdf', dark: '#211c16' },
  '--dsw-alias-scrollbar-bg-l1': { light: '#e3dccb', dark: '#4a4336' },
  '--dsw-alias-scrollbar-bg-l2': { light: '#e3dccb', dark: '#57503f' },
  '--dsw-alias-scrollbar-hover-l1': { light: '#d5ccb6', dark: '#57503f' },
  '--dsw-alias-scrollbar-hover-l2': { light: '#d5ccb6', dark: '#665f4c' },

  /* Seal: unchanged. `--dsw-specific-brand-seal-fill` carries the cinnabar
     of the QiLin seal for surfaces that must match the stamp. Its two values
     are the seal body gradient's own stops (ui-brand Seal.tsx): the mid stop
     on light surfaces and the lit upper stop on dark ones, so the label
     clears 4.5:1 against both the light sidebar #f1ece0 and the dark
     #0d0b09. Changing the seal gradient means changing this token with it. */
  '--dsw-specific-brand-seal-fill': { light: '#c3402f', dark: '#d4503d' },
})
