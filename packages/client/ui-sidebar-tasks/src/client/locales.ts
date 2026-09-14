/**
 * `sidebarTasks` namespace dictionaries, and the namespace's declaration.
 *
 * Two vocabularies live here: the page's own (the type name, the guide entry,
 * the section headings, the fold control, and the empty and failure lines) and
 * the background-job list's (the wire status words and the elapsed-time
 * phrases), which this page owns rather than borrowing from the session
 * header's job action because a plugin bundle shares runtime code only through
 * the platform modules.
 *
 * The namespace merge lives with its key set so that any module naming
 * `TranslateNS<'sidebarTasks'>` or `PropsLocale<'sidebarTasks'>` needs only
 * this file, whichever entry a program loads first.
 */
import type {} from '@qilin/client-ui-slots'

declare module '@qilin/client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Tasks page type name, guide entry, section copy, and job status words. */
    sidebarTasks: SidebarTasksKey
  }
}

/** Dictionary namespace owned by this plugin. */
export const NS = 'sidebarTasks'

/** Simplified Chinese dictionary and key-set source of truth. */
export const zh = {
  'type.label': '任务',
  'guide.title': '任务与子代理',
  'guide.description': '查看子代理拓扑与后台任务',
  empty: '这个会话还没有子代理或后台任务。',
  'subagents.title': '子代理',
  'subagents.count.one': '{count} 个子代理',
  'subagents.count.other': '{count} 个子代理',
  'subagents.loading': '正在读取子代理…',
  'subagents.empty': '没有子代理',
  'subagents.failed': '无法读取子代理目录',
  'subagents.retry': '重试',
  'subagents.refresh': '刷新子代理',
  'subagents.interrupt': '中断',
  'subagents.mode.oneShot': '一次性',
  'subagents.mode.continuable': '可继续',
  'subagents.diagnostic.corrupt': '这条子代理记录已损坏',
  'subagents.diagnostic.unsupported': '这条子代理记录的版本不受支持',
  'subagents.diagnostic.unavailable': '这条子代理记录暂不可读',
  'tasks.title': '后台任务',
  'tasks.count.one': '{count} 个后台任务',
  'tasks.count.other': '{count} 个后台任务',
  'tasks.empty': '没有后台任务',
  'tasks.status.running': '运行中',
  'tasks.status.stopping': '正在停止',
  'tasks.status.completed': '已完成',
  'tasks.status.killed': '已取消',
  'tasks.status.failed': '已失败',
  'tasks.duration.seconds': '{seconds}秒',
  'tasks.duration.minutes': '{minutes}分{seconds}秒',
  'tasks.duration.hours': '{hours}小时{minutes}分',
  'tasks.duration.live': '已运行 {duration}',
  'tasks.duration.done': '耗时 {duration}',
  'more.expand': '展开更多（还有 {count} 条）',
  'more.collapse': '收起',
} satisfies Record<string, string>

/** Tasks dictionary key union. */
export type SidebarTasksKey = keyof typeof zh

/** English dictionary, checked against the Chinese key set. */
export const en = {
  'type.label': 'Tasks',
  'guide.title': 'Tasks and subagents',
  'guide.description': 'Review the subagent topology and background jobs',
  empty: 'This session has no subagents and no background jobs yet.',
  'subagents.title': 'Subagents',
  'subagents.count.one': '{count} subagent',
  'subagents.count.other': '{count} subagents',
  'subagents.loading': 'Reading subagents…',
  'subagents.empty': 'No subagents',
  'subagents.failed': 'Unable to read the subagent catalog',
  'subagents.retry': 'Retry',
  'subagents.refresh': 'Refresh subagents',
  'subagents.interrupt': 'Stop',
  'subagents.mode.oneShot': 'one-shot',
  'subagents.mode.continuable': 'continuable',
  'subagents.diagnostic.corrupt': 'This subagent record is damaged',
  'subagents.diagnostic.unsupported': 'This subagent record has an unsupported version',
  'subagents.diagnostic.unavailable': 'This subagent record is temporarily unreadable',
  'tasks.title': 'Background jobs',
  'tasks.count.one': '{count} background job',
  'tasks.count.other': '{count} background jobs',
  'tasks.empty': 'No background jobs',
  'tasks.status.running': 'running',
  'tasks.status.stopping': 'stopping',
  'tasks.status.completed': 'completed',
  'tasks.status.killed': 'cancelled',
  'tasks.status.failed': 'failed',
  'tasks.duration.seconds': '{seconds}s',
  'tasks.duration.minutes': '{minutes}m {seconds}s',
  'tasks.duration.hours': '{hours}h {minutes}m',
  'tasks.duration.live': 'Running for {duration}',
  'tasks.duration.done': 'Took {duration}',
  'more.expand': 'Show more ({count} hidden)',
  'more.collapse': 'Show less',
} satisfies Record<SidebarTasksKey, string>
