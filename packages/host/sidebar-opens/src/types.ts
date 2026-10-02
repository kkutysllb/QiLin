/** What the model asked the sidebar to show, and how one request reaches the browser. */

/** One open request, as the tool resolved it. */
export interface SidebarOpenRequest {
  /** Host-minted identity, so a client can dedupe a replay it already applied. */
  readonly id: string
  /** What the target is. */
  readonly kind: 'file' | 'url'
  /**
   * The absolute Host path of the file, or the normalized http(s) URL of the
   * page. A file path is verified to be a regular file before the request is
   * made; a URL is verified to be http(s).
   */
  readonly target: string
  /** The tab title to use: the file's basename, or the page's host. */
  readonly title: string
}
