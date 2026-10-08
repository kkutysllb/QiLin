/** Locale-owned video preview status and fallback copy. */
export const zh = {
  title: '视频', videoUnsupported: '此视频无法在浏览器中播放（编码不受支持）。',
  downloadToView: '下载文件查看',
} satisfies Record<string, string>

/** Video preview dictionary keys. */
export type VideoPreviewKey = keyof typeof zh

/** English video preview copy. */
export const en = {
  title: 'Video', videoUnsupported: 'This video cannot be played in the browser (unsupported codec).',
  downloadToView: 'Download the file to view it',
} satisfies Record<VideoPreviewKey, string>

declare module '@qilin-agent/client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Video preview status and fallback copy. */
    sidebarVideo: VideoPreviewKey
  }
}
