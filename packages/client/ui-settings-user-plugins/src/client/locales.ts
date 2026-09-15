/** Copy dictionaries for the user plugin Settings tab. */
export const zh = {
  tab: '用户插件', title: '用户插件', subtitle: '安装在当前 profile 中的 QiLin / DSH 插件',
  loading: '正在读取插件…', error: '暂时无法读取插件。', retry: '重试', empty: '暂无用户插件。',
  installed: '已安装插件', builtin: '内置', user: '用户安装', versionUnknown: '版本未知',
  checkUpdates: '检查更新', checking: '检查中…', update: '更新', updating: '更新中…', uninstall: '卸载', uninstalling: '卸载中…',
  installTitle: '安装插件', packageSpec: 'npm 包名或 pnpm spec', install: '安装', installing: '安装中…',
  restart: '插件变更将在重启 QiLin 后生效。', output: '最近输出', community: '社区插件',
  communityQuery: '搜索 GitHub 社区插件', search: '搜索', searching: '搜索中…', installCommunity: '安装',
  noCommunity: '没有找到社区插件。', stars: '{count} stars', installFailed: '操作失败。',
} satisfies Record<string, string>

/** User plugin Settings locale key union. */
export type UserPluginsLocaleKey = keyof typeof zh

/** English dictionary checked against the Chinese key set. */
export const en = {
  tab: 'User plugins', title: 'User plugins', subtitle: 'QiLin / DSH plugins installed in the current profile',
  loading: 'Reading plugins…', error: 'Plugins are temporarily unavailable.', retry: 'Retry', empty: 'No user plugins installed.',
  installed: 'Installed plugins', builtin: 'Built-in', user: 'User installed', versionUnknown: 'Unknown version',
  checkUpdates: 'Check for updates', checking: 'Checking…', update: 'Update', updating: 'Updating…', uninstall: 'Uninstall', uninstalling: 'Uninstalling…',
  installTitle: 'Install plugin', packageSpec: 'npm package name or pnpm spec', install: 'Install', installing: 'Installing…',
  restart: 'Plugin changes take effect after restarting QiLin.', output: 'Recent output', community: 'Community plugins',
  communityQuery: 'Search GitHub community plugins', search: 'Search', searching: 'Searching…', installCommunity: 'Install',
  noCommunity: 'No community plugins found.', stars: '{count} stars', installFailed: 'Operation failed.',
} satisfies Record<UserPluginsLocaleKey, string>
