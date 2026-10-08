/**
 * `sidebarSidechat` namespace dictionaries, and the namespace's declaration.
 * The zh dictionary is the source of truth for the key set; en mirrors it.
 */
import type {} from '@qilin-agent/client-ui-slots'

declare module '@qilin-agent/client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Sidechat panel type name, thread list copy, and transcript copy. */
    sidebarSidechat: SidechatKey
  }
}

/** Dictionary namespace owned by this plugin. */
export const NS = 'sidebarSidechat'

/** Simplified Chinese dictionary and key-set source of truth. */
export const zh = {
  'type.label': '侧聊',
  'guide.title': '侧聊线程',
  'guide.description': '从当前会话分叉的侧聊线程',
  'threads.title': '侧聊线程',
  'threads.empty': '还没有侧聊线程',
  'threads.failed': '无法读取侧聊线程',
  'threads.new': '新建侧聊',
  'threads.starting': '正在创建…',
  'threads.count.one': '{count} 个线程',
  'threads.count.other': '{count} 个线程',
  'thread.live': '活跃',
  'thread.running': '运行中',
  'thread.cancel': '取消本轮',
  'thread.release': '释放',
  'thread.open': '打开线程',
  'prompt.placeholder': '在侧聊里问点什么…',
  'prompt.send': '发送',
  'prompt.sending': '发送中…',
  'entry.boundary': '侧聊边界：继承的上文仅供参考。',
  'panel.empty': '选择或新建一个侧聊线程。',
} as const

/** The namespace's key set; en must define exactly these keys. */
export type SidechatKey = keyof typeof zh

/** English dictionary. */
export const en: Record<SidechatKey, string> = {
  'type.label': 'Sidechat',
  'guide.title': 'Sidechat threads',
  'guide.description': 'Threads forked from the current session',
  'threads.title': 'Sidechat threads',
  'threads.empty': 'No sidechat threads yet',
  'threads.failed': 'Could not read sidechat threads',
  'threads.new': 'New sidechat',
  'threads.starting': 'Creating…',
  'threads.count.one': '{count} thread',
  'threads.count.other': '{count} threads',
  'thread.live': 'live',
  'thread.running': 'running',
  'thread.cancel': 'Cancel turn',
  'thread.release': 'Release',
  'thread.open': 'Open thread',
  'prompt.placeholder': 'Ask something in the sidechat…',
  'prompt.send': 'Send',
  'prompt.sending': 'Sending…',
  'entry.boundary': 'Sidechat boundary: the inherited context is reference only.',
  'panel.empty': 'Select or create a sidechat thread.',
}
