/** QiLin skin identity shared by the node and browser halves. */

/** The skin id the appearance row persists as the user's QiLin palette selection. */
export const QILIN_SKIN_ID = 'qilin'

/** Provider-owned display name; `ui-theme` resolves it through the language chain. */
export const QILIN_SKIN_LABEL = Object.freeze({ zh: '玄金', en: 'Xuanjin' })

/** Canvas colors for the pre-plugin interval, matching the skin's `--qilin-alias-bg-base` pair. */
export const QILIN_SKIN_BOOT = Object.freeze({ light: '#f8f5ee', dark: '#0d0b09' })
