/** One retained Markdown renderer over the document owner's accumulated text. */
import { useCallback, useMemo } from 'react'
import type { ReactNode } from 'react'
import { MarkdownText, type MarkdownLabels, type MarkdownPathImages } from '@qilin/client-ui-primitives'
import type { PropsLocale } from '@qilin/client-ui-slots'
import type { DocumentPreviewProps } from '../document/contract.ts'
import { markdownImageUrl } from './path-images.ts'
import { renderableMarkdownHtml, sanitizeMarkdownHtml } from './sanitize-html.ts'
import type {} from './locales.ts'
import css from './MarkdownBody.module.css'

/** Standard document inputs and this implementation's locale. */
export type MarkdownBodyProps = DocumentPreviewProps & PropsLocale<'documentMarkdown'>

/**
 * Render one accumulated document; EOF completes the primitive's full parse.
 * @param props - owner-loaded contents and localized primitive labels.
 * @returns Markdown content, or nothing for a non-text delivery.
 */
export function MarkdownBody({ content, resourceAddress, useResource, t }: MarkdownBodyProps): ReactNode {
  const absolutePath = useResource<'file'>(resourceAddress).value?.absolutePath
  const pathImages = useMemo<MarkdownPathImages>(() => ({
    resolve: value => markdownImageUrl(document.baseURI, absolutePath, value),
  }), [absolutePath])
  const copyLabel = t('code.copy')
  const copiedLabel = t('code.copied')
  const footnotes = t('footnotes')
  const diagramLabel = t('mermaid.diagram')
  const enlargedLabel = t('mermaid.enlarged')
  const labels = useMemo<MarkdownLabels>(() => ({
    code: { copyLabel, copiedLabel }, mermaid: { diagramLabel, enlargedLabel }, footnotes,
  }), [copyLabel, copiedLabel, footnotes, diagramLabel, enlargedLabel])
  // Authored raw HTML renders through this preview's own sanitizer: DOMPurify
  // with a denylist on top of its defaults, anchors forced to a new tab, and
  // local image sources rewritten through the same route as Markdown images.
  // The renderer identity is stable per resolved document, because a new one
  // discards the primitive's streaming render cache.
  const html = useCallback((source: string): ReactNode => {
    // A run the parse cannot hand over whole — an inline tag, or a block
    // opening that closes in another run — stays literal text.
    if (!renderableMarkdownHtml(source)) return source
    const markup = sanitizeMarkdownHtml(
      source,
      destination => markdownImageUrl(document.baseURI, absolutePath, destination),
    )
    if (markup === '') return null
    return <div className={css.htmlBlock} dangerouslySetInnerHTML={{ __html: markup }} />
  }, [absolutePath])
  if (content.kind !== 'text') return null
  return (
    <div className={css.document} data-document-markdown>
      <MarkdownText text={content.text} streaming={!content.eof} labels={labels} pathImages={pathImages} html={html} />
    </div>
  )
}
