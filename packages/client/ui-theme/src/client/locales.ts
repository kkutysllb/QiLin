/** `settings.theme` namespace dictionary (the font-size and line-spacing rows' copy). */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'fontSize.title': '字号大小',
  'fontSize.description': '仅影响会话内容的字号',
  'fontSize.unit': 'px',
  'fontSize.increase': '增大字号',
  'fontSize.decrease': '减小字号',
  'leading.title': '行间距',
  'leading.description': '在默认行高上增减会话正文的行间距，0 为默认',
  'leading.unit': 'px',
  'leading.increase': '增大行间距',
  'leading.decrease': '减小行间距',
} satisfies Record<string, string>

/** The settings.theme namespace key union. */
export type ThemeKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'fontSize.title': 'Font size',
  'fontSize.description': 'Only affects conversation content',
  'fontSize.unit': 'px',
  'fontSize.increase': 'Increase font size',
  'fontSize.decrease': 'Decrease font size',
  'leading.title': 'Line spacing',
  'leading.description': 'Adds or removes pixels from the default line height of message text; 0 is the default',
  'leading.unit': 'px',
  'leading.increase': 'Increase line spacing',
  'leading.decrease': 'Decrease line spacing',
} satisfies Record<ThemeKey, string>
