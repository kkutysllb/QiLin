/** Copy owned by the sidebar terminal feature. */
import type {} from '@qilin-agent/client-ui-slots'

declare module '@qilin-agent/client-ui-slots' {
  interface LocaleNamespaceMap {
    sidebarTerminal: keyof typeof zh
  }
}

/** Simplified Chinese terminal copy. */
export const zh = {
  recoveryFailed: '恢复终端失败：{message}', retryRecovery: '重试恢复终端',
  shell: '选择 Shell', shellLoading: '正在读取 Shell…', shellEmpty: '没有可用的 Shell', description: '在会话工作区运行命令',
  title: '终端', new: '新建终端', loading: '正在读取终端环境…', creating: '正在启动…',
  connecting: '正在连接…', disconnected: '连接已断开。', reconnect: '重新连接',
  readonly: '此页面当前只读。', control: '接管输入',
  closed: '终端已关闭。', exited: '进程已退出（{code}）', failed: '终端错误：{message}',
  rename: '终端名称', unavailable: '不可用', retry: '重试',
  cleanupFailed: '终端「{title}」未能结束：{message}',
  missingTerminal: '此终端已不存在，请新建终端。',
  inputFull: '输入缓冲区已满，请重新连接后重试。',
  attachmentEnded: '终端连接已结束，请重新连接。',
  invalidOutput: '终端画面传输异常，请重新连接。',
  terminalLimit: '终端数量已达上限，请关闭不用的终端后重试。已退出的终端也计入数量。',
  'settings.font.title': '终端字体',
  'settings.font.description': '终端测量字符网格所用的字体与字号。留空字体系列即使用内置等宽字体栈；提示图标会自动追加 Nerd Font 回退。',
  'settings.font.family': '字体系列',
  'settings.font.size': '字号（像素）',
} satisfies Record<string, string>

/** English terminal copy. */
export const en = {
  recoveryFailed: 'Terminal recovery failed: {message}', retryRecovery: 'Retry terminal recovery',
  shell: 'Choose shell', shellLoading: 'Loading shells…', shellEmpty: 'No shells available', description: 'Run commands in the Session workspace',
  title: 'Terminal', new: 'New terminal', loading: 'Reading terminal environment…', creating: 'Starting…',
  connecting: 'Connecting…', disconnected: 'Disconnected.', reconnect: 'Reconnect',
  readonly: 'This view is read-only.', control: 'Take control',
  closed: 'Terminal closed.', exited: 'Process exited ({code})', failed: 'Terminal error: {message}',
  rename: 'Terminal name', unavailable: 'Unavailable', retry: 'Retry',
  cleanupFailed: 'Terminal “{title}” could not be ended: {message}',
  missingTerminal: 'This terminal no longer exists. Open a new terminal.',
  inputFull: 'The input buffer is full. Reconnect and try again.',
  attachmentEnded: 'The terminal connection ended. Reconnect to continue.',
  invalidOutput: 'The terminal screen could not be received. Reconnect to recover it.',
  terminalLimit: 'The terminal limit has been reached. Close unused terminals and try again. Exited terminals also count toward the limit.',
  'settings.font.title': 'Terminal font',
  'settings.font.description': 'The family and size the terminal measures its character grid with. An empty family uses the built-in monospace stack; icon fonts are appended as fallbacks.',
  'settings.font.family': 'Font family',
  'settings.font.size': 'Size (px)',
} satisfies Record<keyof typeof zh, string>
