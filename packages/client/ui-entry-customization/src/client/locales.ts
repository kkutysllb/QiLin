/** Copy for the More menu rows: navigation actions, and Creator draft prompts per region. */
export const en = {
  'pinTooltip': 'Pin to the left sidebar',
  'pin': 'Pin {name} to the sidebar',
  install: 'Browse other plugins',
  create: 'Create your plugin',
  'createPrompt.sidebar': 'Create a QiLin plugin with a left sidebar entry.',
  'createPrompt.conversation': 'Create a QiLin conversation view plugin.',
  'createPrompt.rightbar': 'Create a QiLin plugin with a right sidebar entry.',
} as const

/** Chinese counterpart of the entry-customization dictionary. */
export const zh: Record<keyof typeof en, string> = {
  'pinTooltip': '固定到左侧栏',
  'pin': '将 {name} 固定到侧边栏',
  install: '浏览更多插件',
  create: '创建你的插件',
  'createPrompt.sidebar': '创建一个带左侧栏入口的 QiLin 插件。',
  'createPrompt.conversation': '创建一个 QiLin 会话视图插件。',
  'createPrompt.rightbar': '创建一个带右侧栏入口的 QiLin 插件。',
}
