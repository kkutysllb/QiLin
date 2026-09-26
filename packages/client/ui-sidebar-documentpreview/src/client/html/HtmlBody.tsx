/** Complete HTML rendered in a script-enabled opaque iframe, without parent application access. */
import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import clsx from 'clsx'
import type { PropsLocale } from '@qilin/client-ui-slots'
import type { DocumentPreviewProps } from '../document/contract.ts'
import { LoadingIndicator } from '../LoadingIndicator.tsx'
import { createHtmlDocument } from './bootstrap.ts'
import { packHtml } from './pack.ts'
import { createReadHtmlRelative } from './read-relative.ts'
import type { ReadHtmlRelated } from './read-relative.ts'
import type {} from './locales.ts'
import css from './HtmlBody.module.css'

/** Standard document inputs plus this renderer's dictionary. */
export type HtmlBodyProps = DocumentPreviewProps & PropsLocale<'documentHtml'> & {
  /** Ordinary Remote callback bound by this renderer's Slot inject. */
  readonly readRelated: ReadHtmlRelated
}

type FrameInput = Pick<HtmlBodyProps, 'resourceAddress' | 'readRelated' | 'addResource' | 'setResources'> & {
  readonly data: Uint8Array<ArrayBuffer>
  readonly signal: AbortSignal
}

type FrameState = Pick<FrameInput, 'data' | 'readRelated'> & { readonly url: string | undefined }

/** One mounted file owns its root Blob; replacing content also replaces the browsing context. */
function HtmlFrame({ data, resourceAddress, readRelated, addResource, setResources, signal, t }: FrameInput & { t: HtmlBodyProps['t'] }): ReactNode {
  const [frame, setFrame] = useState<FrameState>()
  useEffect(() => {
    const controller = new AbortController()
    const resources = new Set<string>()
    const readRelative = createReadHtmlRelative(readRelated, resourceAddress, signal, (address) => {
      resources.add(address)
      addResource(address)
    })
    let url: string | undefined
    void (async () => {
      try {
        const bundle = await packHtml(data, readRelative, controller.signal)
        controller.signal.throwIfAborted()
        const html = createHtmlDocument(bundle)
        url = URL.createObjectURL(new Blob([html], { type: 'text/html' }))
        setFrame({ data, readRelated, url })
      } catch {
        if (!controller.signal.aborted) setFrame({ data, readRelated, url: undefined })
      } finally {
        if (!controller.signal.aborted && !signal.aborted) setResources([...resources])
      }
    })()
    return () => {
      controller.abort()
      if (url !== undefined) URL.revokeObjectURL(url)
    }
  }, [data, readRelated, resourceAddress, addResource, setResources, signal])

  if (frame?.data !== data || frame.readRelated !== readRelated) {
    return <LoadingIndicator className={clsx(css.status, css.opening)} label={t('loading')} />
  }
  if (frame.url === undefined) return <p className={css.status} role="alert">{t('failed')}</p>
  return <iframe key={frame.url} className={css.frame} src={frame.url} sandbox="allow-scripts" title={t('frame')} data-html-preview />
}

/**
 * Render complete HTML with the standard file and tab hooks.
 * @param props - document bytes, hooks, related-file reader and locale.
 * @returns an isolated HTML document, or nothing for text delivery.
 */
export function HtmlBody({
  content, resourceAddress, readRelated, useTabInfo, addResource, setResources, t,
}: HtmlBodyProps): ReactNode {
  const { tab } = useTabInfo()
  if (content.kind !== 'bytes') return null
  return <HtmlFrame key={resourceAddress} data={content.data} resourceAddress={resourceAddress}
    readRelated={readRelated} signal={tab.signal} addResource={addResource} setResources={setResources} t={t} />
}
