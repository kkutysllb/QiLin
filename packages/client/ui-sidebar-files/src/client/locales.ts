/**
 * `sidebarFiles` namespace dictionaries, and the namespace's declaration.
 *
 * The failure lines name what went wrong with one path, one code each, because
 * a file or directory that is gone, one outside the workspace, and a path of
 * the wrong kind each suggest a different next step. The editor's keys carry
 * the `file.` prefix so the two types' vocabularies read apart.
 *
 * The namespace merge lives with its key set so that any module naming
 * `TranslateNS<'sidebarFiles'>` or `PropsLocale<'sidebarFiles'>` needs only this
 * file, whichever entry a program loads first.
 */
import type {} from '@qilin/client-ui-slots'

declare module '@qilin/client-ui-slots' {
  interface LocaleNamespaceMap {
    /** File-tree and file-editor type names, guide entry, row states, and failure lines. */
    sidebarFiles: SidebarFilesKey
  }
}

/** Simplified Chinese dictionary and key-set source of truth. */
export const zh = {
  'type.label': '文件',
  'guide.title': '工作区文件',
  'guide.description': '浏览会话工作区的文件',
  loading: '正在读取…',
  empty: '空目录',
  truncated: '条目太多，只显示了一部分。',
  noWorkspace: '这个会话没有工作区目录。',
  reload: '重新读取',
  'entry.other': '这不是文件或目录，没法打开。',
  'error.notFound': '这个目录不在了。可能已被移动或删除。',
  'error.outsideWorkspace': '这个目录在工作区之外，侧栏不会读取它。',
  'error.notDirectory': '这不是一个目录。',
  'error.unavailable': '读取失败：{message}',
  'file.type.label': '文件编辑',
  'file.save': '保存',
  'file.saving': '正在保存…',
  'file.saved': '已保存',
  'file.unsaved': '有未保存的修改',
  'file.reload': '重新载入',
  'file.treeToggle': '显示或收起文件树',
  'file.wrap': '自动换行',
  'file.preview': '预览',
  'file.reloadDirty': '有未保存的修改，重新载入会丢弃它们。',
  'file.reloadDirty.confirm': '丢弃并重新载入',
  'file.reloadDirty.cancel': '取消',
  'file.conflict': '文件在磁盘上已被其他修改更新，保存被拒绝。',
  'file.conflict.reload': '载入磁盘内容（丢弃我的修改）',
  'file.conflict.overwrite': '用我的内容覆盖',
  'file.error.notFound': '这个文件不在了。可能已被移动或删除。',
  'file.error.tooLarge': '文件太大，无法在编辑器中打开（{size}）。',
  'file.error.notText': '这不是 UTF-8 文本，没法编辑。',
  'file.error.notRegularFile': '这不是一个普通文件。',
  'file.error.outsideWorkspace': '保存目标在工作区之外，侧栏不会写入。',
  'file.error.unavailable': '操作失败：{message}',
} satisfies Record<string, string>

/** Files dictionary key union. */
export type SidebarFilesKey = keyof typeof zh

/** English dictionary, checked against the Chinese key set. */
export const en = {
  'type.label': 'Files',
  'guide.title': 'Workspace files',
  'guide.description': 'Browse files in this session\'s workspace',
  loading: 'Reading…',
  empty: 'Empty directory',
  truncated: 'Too many entries, showing only some of them.',
  noWorkspace: 'This session has no workspace directory.',
  reload: 'Reload',
  'entry.other': 'Not a file or a directory, so it cannot be opened.',
  'error.notFound': 'That directory is gone. It may have been moved or deleted.',
  'error.outsideWorkspace': 'That directory is outside the workspace, so the sidebar will not read it.',
  'error.notDirectory': 'That is not a directory.',
  'error.unavailable': 'Read failed: {message}',
  'file.type.label': 'Editor',
  'file.save': 'Save',
  'file.saving': 'Saving…',
  'file.saved': 'Saved',
  'file.unsaved': 'Unsaved changes',
  'file.reload': 'Reload',
  'file.treeToggle': 'Show or hide the file tree',
  'file.wrap': 'Word wrap',
  'file.preview': 'Preview',
  'file.reloadDirty': 'Reloading discards unsaved changes.',
  'file.reloadDirty.confirm': 'Discard and reload',
  'file.reloadDirty.cancel': 'Cancel',
  'file.conflict': 'The file changed on disk since it was read, so the save was refused.',
  'file.conflict.reload': 'Load the disk copy (discard my changes)',
  'file.conflict.overwrite': 'Overwrite with my version',
  'file.error.notFound': 'That file is gone. It may have been moved or deleted.',
  'file.error.tooLarge': 'The file is too large to edit ({size}).',
  'file.error.notText': 'That is not UTF-8 text, so it cannot be edited.',
  'file.error.notRegularFile': 'That is not a regular file.',
  'file.error.outsideWorkspace': 'The save target is outside the workspace, so the sidebar will not write it.',
  'file.error.unavailable': 'The operation failed: {message}',
} satisfies Record<SidebarFilesKey, string>
