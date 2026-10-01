/**
 * Inline video preview: play the file in a native `<video>` element that
 * streams from the host media route (HTTP Range windows make scrubbing
 * work). The element fetches its own bytes, so the body reports readiness
 * through the renderer contract on mount and failure through the element's
 * error event; a decode failure degrades to the download affordance.
 */
import { useEffect, useState, type ReactNode } from 'react'
import type { DocumentPreviewProps } from '../document/contract.ts'
import type { PropsLocale } from '@qilin/client-ui-slots'
import { hostFileOf } from '../rpc.ts'
import { previewMediaUrl } from '../media-url.ts'
import css from './VideoBody.module.css'

/** Document input plus localized copy. */
export type VideoBodyProps = DocumentPreviewProps & PropsLocale<'sidebarVideo'>

/**
 * Play one video file with seek support and a download fallback.
 * @param props - Renderer-owned document seats (the element streams itself).
 * @returns The player stage with its meta row.
 */
export function VideoBody({ content, resourceAddress, t }: VideoBodyProps): ReactNode {
  const [failed, setFailed] = useState(false)
  const file = hostFileOf(resourceAddress)
  const revision = content.kind === 'renderer' ? content.revision : 0

  // Switching files inside one tab must clear the previous file's decode
  // failure (the <video> element persists across the switch), and each
  // renderer revision reports its own readiness.
  useEffect(() => {
    setFailed(false)
    if (content.kind !== 'renderer') return
    content.loaded('')
    return content.failed
  }, [content, revision])

  return (
    <div className={css.stage}>
      <div className={css.playerHost}>
        <video
          key={`${file.sessionId}:${file.path}`}
          className={css.player}
          src={previewMediaUrl(file.sessionId, file.path)}
          controls
          preload="metadata"
          playsInline
          onError={() => {
            setFailed(true)
            if (content.kind === 'renderer') content.failed()
          }}
        />
      </div>
      <div className={css.meta}>
        <span className={css.name} title={file.path}>{file.path}</span>
        {failed && <span className={css.notice}>{t('videoUnsupported')}</span>}
        <a className={css.download} href={previewMediaUrl(file.sessionId, file.path, { download: true })} download>
          {t('downloadToView')}
        </a>
      </div>
    </div>
  )
}
