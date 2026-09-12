/** Copy dictionaries for the skills settings page. */

/** English strings (the key-set source of truth for this pair). */
export const en = {
  nav: 'Skills',
  title: 'Skills',
  intro: 'Every skill the current Session can use, grouped by where it was discovered. The catalog follows the Session\u2019s agent preset and workspace.',
  refresh: 'Refresh',
  refreshing: 'Refreshing\u2026',
  noSession: 'No Session is open. Open or create one to see the skills it can use.',
  empty: 'This Session\u2019s composition resolves no skill.',
  errorTitle: 'The skill catalog could not be read',
  retry: 'Retry',
  groupPlugin: 'Provided by plugins',
  groupProject: 'Workspace',
  groupUser: 'User directories',
  groupCustom: 'Custom roots',
  userOnly: 'User invocation only',
  modelInvocable: 'Model and user',
}

/** Chinese strings for the same key set. */
export const zh: Record<keyof typeof en, string> = {
  nav: '技能',
  title: '技能',
  intro: '当前会话可用的全部技能，按发现来源分组。目录跟随该会话的 Agent 预设与工作区。',
  refresh: '刷新',
  refreshing: '刷新中…',
  noSession: '当前没有打开的会话。打开或新建一个会话后，这里会显示它可用的技能。',
  empty: '当前会话的组成没有解析出任何技能。',
  errorTitle: '技能目录读取失败',
  retry: '重试',
  groupPlugin: '插件提供',
  groupProject: '工作区',
  groupUser: '用户目录',
  groupCustom: '自定义根目录',
  userOnly: '仅用户可调用',
  modelInvocable: '模型与用户',
}

/** Key set of one skills page dictionary. */
export type SkillsLocaleKey = keyof typeof en
