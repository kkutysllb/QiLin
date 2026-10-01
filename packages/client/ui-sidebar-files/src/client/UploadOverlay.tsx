/**
 * Upload overlay for the files page: a drag-and-drop target over the file
 * tree that PUTs each dropped file to the preview-media upload route,
 * relative to the tree's displayed root. The tree reloads on success.
 */
import { useCallback, useEffect, useRef, useState, type DragEvent, type ReactNode } from 'react'

/** Build the upload route URL for one session file (mirrors documentpreview's media-url). */
function uploadUrl(sessionId: string, path: string): string {
  const params = new URLSearchParams({ sessionId, path })
  return `/sidebar/media/upload?${params.toString()}`
}
import css from './UploadOverlay.module.css'

/** The overlay's completion report: one line per attempted file. */
interface UploadResult {
  readonly name: string
  readonly ok: boolean
  readonly detail?: string
}

/** Props: the session and root the upload resolves against, plus reload. */
export interface UploadOverlayProps {
  readonly sessionId: string
  /** The tree's displayed workspace root; dropped relative paths resolve under it. */
  readonly root: string
  /** Ask the owner to refresh the tree after uploads land. */
  readonly onUploaded: () => void
  /** Localized copy for the overlay and its report. */
  readonly t: import('@qilin/client-ui-slots').TranslateNS<'sidebarFiles'>
  /** The wrapped tree. */
  readonly children: ReactNode
}

/** The per-file byte ceiling mirrors the host route's mediaLimitBytes default. */
const UPLOAD_LIMIT_BYTES = 20 * 1024 * 1024

/**
 * Wrap one file tree with a drag-and-drop upload overlay.
 * @param props - session identity, displayed root, reload callback, copy.
 * @returns the overlay that mounts over the tree while a drag is active.
 */
export function UploadOverlay({ sessionId, root, onUploaded, t, children }: UploadOverlayProps): ReactNode {
  const [active, setActive] = useState(false)
  const [results, setResults] = useState<readonly UploadResult[] | null>(null)
  const [busy, setBusy] = useState(false)
  const dragDepth = useRef(0)

  // Clear the completion report when a new drag starts.
  useEffect(() => { if (active) setResults(null) }, [active])

  const upload = useCallback(async (files: readonly File[]): Promise<void> => {
    setBusy(true)
    const outcomes: UploadResult[] = []
    let anyOk = false
    for (const file of files) {
      if (file.size > UPLOAD_LIMIT_BYTES) {
        outcomes.push({ name: file.name, ok: false, detail: 'too large' })
        continue
      }
      try {
        // A dropped file lands under the tree's displayed root.
        const path = `${root.replace(/[/\\]$/, '')}/${file.name}`
        const response = await fetch(uploadUrl(sessionId, path), {
          method: 'PUT',
          body: file,
        })
        if (response.ok) {
          outcomes.push({ name: file.name, ok: true })
          anyOk = true
        } else {
          const text = await response.text()
          outcomes.push({ name: file.name, ok: false, detail: text.slice(0, 80) })
        }
      } catch (error) {
        outcomes.push({ name: file.name, ok: false, detail: error instanceof Error ? error.message : String(error) })
      }
    }
    setBusy(false)
    setResults(outcomes)
    if (anyOk) onUploaded()
  }, [sessionId, root, onUploaded])

  const onDragEnter = (event: DragEvent<HTMLDivElement>): void => {
    if (!event.dataTransfer.types.includes('Files')) return
    event.preventDefault()
    dragDepth.current += 1
    setActive(true)
  }
  const onDragLeave = (event: DragEvent<HTMLDivElement>): void => {
    event.preventDefault()
    dragDepth.current = Math.max(0, dragDepth.current - 1)
    if (dragDepth.current === 0) setActive(false)
  }
  const onDragOver = (event: DragEvent<HTMLDivElement>): void => {
    if (!event.dataTransfer.types.includes('Files')) return
    event.preventDefault()
  }
  const onDrop = (event: DragEvent<HTMLDivElement>): void => {
    if (!event.dataTransfer.types.includes('Files')) return
    event.preventDefault()
    dragDepth.current = 0
    setActive(false)
    const files = [...event.dataTransfer.files]
    if (files.length > 0) void upload(files)
  }

  return (
    <div
      className={active ? css.active : undefined}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      {children}
      {active && (
        <div className={css.overlay} data-files-upload-active>
          <span className={css.hint}>{busy ? t('upload.uploading') : t('upload.dropHint')}</span>
        </div>
      )}
      {results !== null && (
        <div className={css.report} data-files-upload-report>
          {results.map(result => (
            <span key={result.name} className={result.ok ? css.ok : css.fail}>
              {result.name}{result.ok ? '' : `: ${result.detail ?? t('upload.failed')}`}
            </span>
          ))}
          <span className={css.done}>{t('upload.done', { count: String(results.filter(r => r.ok).length) })}</span>
        </div>
      )}
    </div>
  )
}
