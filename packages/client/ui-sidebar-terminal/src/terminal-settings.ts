/**
 * The terminal's durable user settings: the font family and size its screen
 * measures with. Declared once here because the Host registers the schema and
 * the browser reads the same section.
 */
import z from '@qilin/schemastery'

/** Settings namespace owned by the terminal target. */
export const TERMINAL_SETTINGS_NAMESPACE = 'ui-sidebar-terminal'

/** Smallest terminal font size a preference may hold, in CSS pixels. */
export const TERMINAL_FONT_SIZE_MIN = 8

/** Largest terminal font size a preference may hold, in CSS pixels. */
export const TERMINAL_FONT_SIZE_MAX = 32

/** Font size for users without an explicit preference, matching xterm's own default. */
export const DEFAULT_TERMINAL_FONT_SIZE = 13

/** The terminal section as the browser reads it. */
export interface TerminalSettings {
  /** Preferred font family; empty selects the built-in monospace stack. */
  fontFamily: string
  /** Preferred font size in CSS pixels, within the declared range. */
  fontSize: number
}

/** Durable terminal schema; also the wire envelope the browser scope validates against. */
export const TerminalSettingsSchema: z<TerminalSettings> = z.object({
  fontFamily: z.string().default(''),
  fontSize: z.number().step(1).min(TERMINAL_FONT_SIZE_MIN).max(TERMINAL_FONT_SIZE_MAX)
    .default(DEFAULT_TERMINAL_FONT_SIZE),
})
