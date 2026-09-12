/** Copy dictionaries for the sidebar account menu. */

/** English strings (the key-set source of truth for this pair). */
export const en = {
  label: 'Account',
  settings: 'Settings',
  appearance: 'Appearance',
  'appearance.light': 'Light',
  'appearance.dark': 'Dark',
  'appearance.system': 'Follow system',
  language: 'Language',
  signOut: 'Sign out',
}

/** Chinese strings for the same key set. */
export const zh: Record<keyof typeof en, string> = {
  label: '账户',
  settings: '设置',
  appearance: '主题样式',
  'appearance.light': '浅色',
  'appearance.dark': '深色',
  'appearance.system': '跟随系统',
  language: '语言',
  signOut: '退出登录',
}

/** Key set of one account menu dictionary. */
export type AccountLocaleKey = keyof typeof en
