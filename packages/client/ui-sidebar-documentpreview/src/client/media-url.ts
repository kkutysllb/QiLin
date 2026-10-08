/**
 * URLs for the host preview-media route (`@qilin-agent/host-preview-media`): one
 * session file over `/sidebar/media`, Range-streamable for the video viewer
 * and switchable to a download disposition.
 */

/** Absolute-path URL of the media route for one session file.
 * @param sessionId - Session whose workspace root resolves the path.
 * @param path - absolute path or workspace-relative path.
 * @param options - `download` switches the disposition to an attachment.
 * @returns the relative `/sidebar/media` URL carrying the session and path.
 */
export function previewMediaUrl(sessionId: string, path: string, options?: { readonly download?: boolean }): string {
  const params = new URLSearchParams({ sessionId, path })
  if (options?.download === true) params.set('download', '1')
  return `/sidebar/media?${params.toString()}`
}
