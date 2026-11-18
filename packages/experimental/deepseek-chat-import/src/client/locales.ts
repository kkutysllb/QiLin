/** `deepseekChatImport` namespace dictionaries for the import action and dialog. */

/** Dictionary namespace owned by this plugin. */
export const NS = 'deepseekChatImport'

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'action.label': '导入 DeepSeek 会话',
  'dialog.title': '导入 DeepSeek 会话记录',
  'dialog.description': '选择从 DeepSeek 官网导出的 ZIP 文件（deepseek_data-*.zip），以及接收这些会话的工作区。',
  'dialog.file': '导出文件',
  'dialog.chooseFile': '选择文件…',
  'dialog.changeFile': '重新选择',
  'dialog.workspace': '工作区',
  'dialog.chooseWorkspace': '选择工作区',
  'dialog.cancel': '取消',
  'dialog.close': '关闭',
  'dialog.import': '导入',
  'dialog.importing': '正在导入…',
  'dialog.importingCount': '正在导入 {done}/{total}',
  'dialog.uploading': '正在上传 {percent}%',
  'dialog.done': '完成',
  'result.imported.one': '已导入 {count} 个会话到工作区 {name}。',
  'result.imported.other': '已导入 {count} 个会话到工作区 {name}。',
  'result.omitted.one': '{count} 个较早的会话超出导入上限，未导入。',
  'result.omitted.other': '{count} 个较早的会话超出导入上限，未导入。',
  'result.skipped.one': '{count} 个会话无法导入。',
  'result.skipped.other': '{count} 个会话无法导入。',
  'error.missing-manifest': '这不是 DeepSeek 导出数据：缺少 manifest.json。',
  'error.missing-index': '这不是 DeepSeek 导出数据：缺少 chat_session_index.json，或该文件无法读取。',
  'error.unsupported-version': '不支持该导出格式版本。',
  'error.unreadable-archive': '该文件不是可读取的 ZIP 压缩包。',
  'error.no-conversations': '导出数据中没有可导入的会话。',
  'error.too-large': '文件过大：最多 {limit}。',
  'error.workspace-not-found': '所选工作区已不存在，请重新选择。',
  'error.busy': '已有一个导入正在进行，请稍后再试。',
  'error.upload-failed': '上传失败：{message}',
  'error.unknown': '导入失败：{message}',
} satisfies Record<string, string>

/** The namespace key union. */
export type DeepseekChatImportKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'action.label': 'Import DeepSeek chats',
  'dialog.title': 'Import DeepSeek chat history',
  'dialog.description': 'Choose the ZIP file exported from the DeepSeek website (deepseek_data-*.zip) and the workspace that receives the sessions.',
  'dialog.file': 'Export file',
  'dialog.chooseFile': 'Choose file…',
  'dialog.changeFile': 'Change',
  'dialog.workspace': 'Workspace',
  'dialog.chooseWorkspace': 'Choose workspace',
  'dialog.cancel': 'Cancel',
  'dialog.close': 'Close',
  'dialog.import': 'Import',
  'dialog.importing': 'Importing…',
  'dialog.importingCount': 'Importing {done}/{total}',
  'dialog.uploading': 'Uploading {percent}%',
  'dialog.done': 'Done',
  'result.imported.one': 'Imported {count} session into the {name} workspace.',
  'result.imported.other': 'Imported {count} sessions into the {name} workspace.',
  'result.omitted.one': '{count} older conversation exceeded the import limit and was not imported.',
  'result.omitted.other': '{count} older conversations exceeded the import limit and were not imported.',
  'result.skipped.one': '{count} conversation could not be imported.',
  'result.skipped.other': '{count} conversations could not be imported.',
  'error.missing-manifest': 'This is not a DeepSeek export: manifest.json is missing.',
  'error.missing-index': 'This is not a DeepSeek export: chat_session_index.json is missing or unreadable.',
  'error.unsupported-version': 'This export format version is not supported.',
  'error.unreadable-archive': 'The file is not a readable ZIP archive.',
  'error.no-conversations': 'The export contains no conversations that can be imported.',
  'error.too-large': 'The file is too large: the limit is {limit}.',
  'error.workspace-not-found': 'The chosen workspace no longer exists. Choose another one.',
  'error.busy': 'Another import is running. Try again later.',
  'error.upload-failed': 'Upload failed: {message}',
  'error.unknown': 'Import failed: {message}',
} satisfies Record<DeepseekChatImportKey, string>
