/**
 * 文件预览类型检测 — 根据 MIME 与扩展名识别渲染策略
 */

export type PreviewKind = 'image' | 'pdf' | 'text' | 'code' | 'markdown' | 'json' | 'audio' | 'video' | 'unsupported';

export interface PreviewInfo {
  kind: PreviewKind;
  /** 可选的渲染 hint(如 language) */
  hint?: string;
  /** 是否支持 inline 预览 */
  inline: boolean;
}

const IMAGE_EXT = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico']);
const PDF_EXT = new Set(['pdf']);
const MD_EXT = new Set(['md', 'markdown']);
const JSON_EXT = new Set(['json']);
const CODE_EXT: Record<string, string> = {
  py: 'python',
  js: 'javascript',
  ts: 'typescript',
  tsx: 'tsx',
  jsx: 'jsx',
  go: 'go',
  rs: 'rust',
  java: 'java',
  rb: 'ruby',
  php: 'php',
  css: 'css',
  scss: 'scss',
  html: 'html',
  xml: 'xml',
  yaml: 'yaml',
  yml: 'yaml',
  toml: 'toml',
  sh: 'bash',
  bash: 'bash',
  zsh: 'bash',
  sql: 'sql',
  c: 'c',
  cpp: 'cpp',
  h: 'c',
  hpp: 'cpp'
};
const TEXT_EXT = new Set(['txt', 'log', 'csv', 'tsv', 'env', 'ini', 'cfg', 'conf', 'mdx']);
const AUDIO_EXT = new Set(['mp3', 'wav', 'ogg', 'flac', 'm4a']);
const VIDEO_EXT = new Set(['mp4', 'webm', 'mov', 'avi', 'mkv']);

export function detectPreview(filename: string, mime?: string): PreviewInfo {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  const m = mime?.toLowerCase() ?? '';

  if (m.startsWith('image/') || IMAGE_EXT.has(ext)) {
    return { kind: 'image', inline: true };
  }
  if (m === 'application/pdf' || PDF_EXT.has(ext)) {
    return { kind: 'pdf', inline: true };
  }
  if (m.startsWith('audio/') || AUDIO_EXT.has(ext)) {
    return { kind: 'audio', inline: true };
  }
  if (m.startsWith('video/') || VIDEO_EXT.has(ext)) {
    return { kind: 'video', inline: true };
  }
  if (MD_EXT.has(ext)) {
    return { kind: 'markdown', inline: true };
  }
  if (JSON_EXT.has(ext)) {
    return { kind: 'json', inline: true, hint: 'json' };
  }
  if (CODE_EXT[ext]) {
    return { kind: 'code', inline: true, hint: CODE_EXT[ext] };
  }
  if (TEXT_EXT.has(ext) || m.startsWith('text/')) {
    return { kind: 'text', inline: true };
  }
  return { kind: 'unsupported', inline: false };
}
