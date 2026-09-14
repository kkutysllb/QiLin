/**
 * `sidebarPlans` namespace dictionaries, and the namespace's declaration.
 *
 * The namespace merge lives with its key set so that any module naming
 * `TranslateNS<'sidebarPlans'>` or `PropsLocale<'sidebarPlans'>` needs only
 * this file, whichever entry a program loads first.
 */
import type {} from '@qilin/client-ui-slots'

declare module '@qilin/client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Task-plan type name, guide entry, search row, row states, and failure line. */
    sidebarPlans: SidebarPlansKey
  }
}

/** Simplified Chinese dictionary and key-set source of truth. */
export const zh = {
  'type.label': '任务计划',
  'guide.title': '任务计划',
  'guide.description': '扫描工作区里的计划文档',
  'search.placeholder': '搜索标题或路径',
  'search.label': '搜索计划',
  reload: '重新扫描',
  loading: '正在扫描…',
  empty: '这个工作区里没有计划文档。',
  noMatch: '没有匹配的计划。',
  'error.failed': '扫描失败：{message}',
  noWorkspace: '这个会话没有工作区目录。',
} satisfies Record<string, string>

/** Plans dictionary key union. */
export type SidebarPlansKey = keyof typeof zh

/** English dictionary, checked against the Chinese key set. */
export const en = {
  'type.label': 'Task plans',
  'guide.title': 'Task plans',
  'guide.description': 'Scan this workspace for plan documents',
  'search.placeholder': 'Search titles or paths',
  'search.label': 'Search plans',
  reload: 'Scan again',
  loading: 'Scanning…',
  empty: 'This workspace has no plan documents.',
  noMatch: 'No plan matches the search.',
  'error.failed': 'Scan failed: {message}',
  noWorkspace: 'This session has no workspace directory.',
} satisfies Record<SidebarPlansKey, string>
