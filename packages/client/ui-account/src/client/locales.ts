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
  'update.available': 'New version available — click to install',
  'update.downloading': 'Downloading update',
  'update.ready': 'Update ready — click to restart',
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
  'update.available': '发现新版本，点击安装',
  'update.downloading': '正在下载更新',
  'update.ready': '更新已就绪，点击重启安装',
}

/** Key set of one account menu dictionary. */
export type AccountLocaleKey = keyof typeof en
