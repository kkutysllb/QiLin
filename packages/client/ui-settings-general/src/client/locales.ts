/** Shell chrome and General-nav dictionaries; feature rows own their copy. */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'trigger': '设置',
  'title': '设置',
  'close': '关闭',
  'resizeNavigation': '调整设置导航宽度',
  'backToWorkspace': '返回工作区',
  'about.nav': '关于 QiLin',
  'about.title': '关于 QiLin',
  'about.description': 'QiLin 是一个可组合的 AI 工作区，连接模型、工具与会话，让复杂任务保持清晰可控。',
  'about.signature': '当前项目 · QiLin',
  'about.logoLabel': 'QiLin 麒麟标识',
  'about.logoMark': '麒麟',
  'general.nav': '通用设置',
  'connection.error': '连接异常',
  'connection.retry': '立即重连',
  'connection.connecting': '自动重连中',
  'connection.connected': '连接成功',
  'connection.reconnect': '连接异常，点击立即重连',
  'connection.restart': '连接中断，正在自动重试，点击立即重连',
} satisfies Record<string, string>

/** The settings namespace key union. */
export type SettingsKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'trigger': 'Settings',
  'title': 'Settings',
  'close': 'Close',
  'resizeNavigation': 'Resize settings navigation',
  'backToWorkspace': 'Back to workspace',
  'about.nav': 'About QiLin',
  'about.title': 'About QiLin',
  'about.description': 'QiLin is a composable AI workspace that connects models, tools, and sessions so complex work stays clear and controlled.',
  'about.signature': 'Current project · QiLin',
  'about.logoLabel': 'QiLin seal mark',
  'about.logoMark': '麒麟',
  'general.nav': 'General',
  'connection.error': 'Disconnected',
  'connection.retry': 'Reconnect now',
  'connection.connecting': 'Reconnecting',
  'connection.connected': 'Connected',
  'connection.reconnect': 'Disconnected, reconnect now',
  'connection.restart': 'Reconnecting automatically, reconnect now',
} satisfies Record<SettingsKey, string>
