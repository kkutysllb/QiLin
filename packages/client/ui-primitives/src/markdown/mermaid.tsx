/**
 * Mermaid diagram rendering for markdown fences: a ```mermaid fence renders
 * as a static SVG diagram through the `mermaid` library, loaded lazily on
 * the first diagram (the library and its graph deps are heavy; the Vite
 * build splits the dynamic import into its own chunk).
 *
 * Security posture (mirrors the vendored sidebar implementation this was
 * absorbed from): `securityLevel: 'strict'` (labels escaped, no raw-HTML
 * foreignObject), `htmlLabels: false` keeps node text as real SVG text,
 * `bindFunctions` is never applied (static diagrams), the emitted SVG is
 * sanitized (allowlist strip of scripts, event handlers, foreignObject,
 * and external references) before it reaches `dangerouslySetInnerHTML`,
 * and `suppressErrorRendering` keeps mermaid's error dump out of the
 * document body. A failed render falls back to the fenced source block.
 */
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { CodeBlock } from './CodeBlock.tsx'
import css from './mermaid.module.css'

/** The lazily resolved mermaid render entry. */
type MermaidRender = (id: string, text: string) => Promise<{ svg: string }>

/** One load outcome: waiting, a rendered SVG document, or the failure line. */
type DiagramState =
  | { status: 'loading' }
  | { status: 'ready'; svg: string }
  | { status: 'error'; message: string }

let mermaidRender: MermaidRender | undefined
let mermaidDark: boolean | undefined

/** Configure and memoize the mermaid library for the current scheme.
 * @param dark - whether the dark diagram theme should apply.
 * @returns the render entry.
 */
async function mermaidOf(dark: boolean): Promise<MermaidRender> {
  if (mermaidRender !== undefined && mermaidDark === dark) return mermaidRender
  const mermaid = (await import('mermaid')).default
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    htmlLabels: false,
    // Mermaid 11 renders a large error SVG into document.body before
    // rejecting invalid diagrams; the fallback below owns failure display.
    suppressErrorRendering: true,
    theme: dark ? 'dark' : 'default',
  })
  mermaidDark = dark
  mermaidRender = (id, text) => mermaid.render(id, text)
  return mermaidRender
}

/** Tags and attributes an emitted diagram may keep (everything else strips). */
const SVG_ALLOWED_TAGS = new Set([
  'svg', 'g', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon',
  'text', 'tspan', 'title', 'defs', 'marker', 'style', 'use', 'linearGradient',
  'radialGradient', 'stop', 'pattern', 'clipPath', 'mask',
])
const SVG_ALLOWED_ATTRS = new RegExp(
  `^(?:${[
    'aria-',
    'class$', 'd$', 'fill$',
    'font-family$', 'font-size$', 'font-style$', 'font-weight$',
    'height$', 'id$', 'marker-', 'offset$', 'opacity$',
    'rx$', 'ry$', 'spreadMethod$', 'stop-color$', 'stop-opacity$',
    'stroke$', 'stroke-dasharray$', 'stroke-linecap$', 'stroke-linejoin$', 'stroke-width$',
    'style$', 'text-anchor$', 'transform$', 'viewBox$', 'width$',
    'x1?$', 'x2$', 'y1?$', 'y2$',
  ].join('|')})`,
)

/** Strip everything the diagram contract does not allow from an emitted SVG.
 * @param svg - the library's emitted SVG document string.
 * @returns the sanitized SVG string.
 */
export function sanitizeMermaidSvg(svg: string): string {
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml')
  const walk = (node: Element): void => {
    for (const child of [...node.children]) {
      if (!SVG_ALLOWED_TAGS.has(child.tagName)) {
        child.remove()
        continue
      }
      for (const attr of [...child.attributes]) {
        if (!SVG_ALLOWED_ATTRS.test(attr.name) || attr.value.includes('javascript:')) child.removeAttribute(attr.name)
      }
      walk(child)
    }
  }
  walk(doc.documentElement)
  return doc.documentElement.outerHTML
}

/** Whether the document currently paints the dark scheme. */
function isDarkScheme(): boolean {
  return typeof matchMedia === 'undefined' ? false : matchMedia('(prefers-color-scheme: dark)').matches
}

/**
 * Render one mermaid fence as a static sanitized SVG diagram.
 * @param props - the fenced diagram source and the code-block labels for the fallback.
 * @returns the diagram, its loading state, or the fenced source fallback.
 */
export interface MermaidDiagramProps {
  /** The fenced diagram source between the fences (info string stripped). */
  readonly code: string
  /** Copy-control labels for the fallback source block. */
  readonly copyLabel: string
  readonly copiedLabel: string
  /** Alt text naming the on-page diagram stage. */
  readonly diagramLabel: string
  /** Alt text naming the enlarged overlay copy. */
  readonly enlargedLabel: string
}

export function MermaidDiagram({ code, copyLabel, copiedLabel, diagramLabel, enlargedLabel }: MermaidDiagramProps): ReactNode {
  const reactId = useId()
  const [state, setState] = useState<DiagramState>({ status: 'loading' })
  const [zoom, setZoom] = useState<string | null>(null)
  const darkRef = useRef<boolean>(isDarkScheme())
  const domId = `mermaid-${reactId.replace(/[^a-zA-Z0-9]/g, '')}`

  useEffect(() => {
    let cancelled = false
    setState({ status: 'loading' })
    void mermaidOf(darkRef.current).then(async (render) => {
      const { svg } = await render(domId, code)
      if (!cancelled) setState({ status: 'ready', svg: sanitizeMermaidSvg(svg) })
    }).catch((error: unknown) => {
      if (!cancelled) {
        const message = error instanceof Error ? error.message : String(error)
        setState({ status: 'error', message: message.split('\n').slice(0, 6).join('\n') })
      }
    })
    return () => { cancelled = true }
  }, [code, domId])

  if (state.status === 'loading') {
    return <div className={css.stage} data-mermaid-loading aria-hidden="true" />
  }
  if (state.status === 'error') {
    return (
      <div className={css.error} role="alert">
        <span className={css.errorLine}>{state.message}</span>
        <CodeBlock code={`${code}\n`} copyLabel={copyLabel} copiedLabel={copiedLabel} />
      </div>
    )
  }
  const stage = (
    <div
      className={css.stage}
      data-mermaid-diagram
      // The sanitized SVG carries no event surface or script content.
      dangerouslySetInnerHTML={{ __html: state.svg }}
      onClick={() => { setZoom(state.svg) }}
      role="button"
      tabIndex={0}
      aria-label={diagramLabel}
      onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') setZoom(state.svg) }}
    />
  )
  if (zoom === null) return stage
  return <>
    {stage}
    {createPortal(
      <div className={css.zoomOverlay} onClick={() => { setZoom(null) }} role="presentation">
        <div
          className={css.zoomStage}
          dangerouslySetInnerHTML={{ __html: zoom }}
          onClick={(event) => { event.stopPropagation() }}
          role="img"
          aria-label={enlargedLabel}
        />
      </div>,
      document.body,
    )}
  </>
}
