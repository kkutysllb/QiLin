/**
 * The text preview's layout: an optional banner, the path header, and the
 * content row, with the workspace navigator Factories in fixed positions.
 *
 * Every preview state renders this one Component, so the navigator, its header
 * toggle, and the file handoff keep their DOM nodes, focus, and scroll position
 * while the preview moves between unsupported, loading, and text. The two
 * Factory positions are memoized Components whose props are only the tab hook
 * and `renderFactorySlot`; a preview-only update, such as a recorded scroll,
 * does not re-render them.
 */
import { memo, useCallback, useLayoutEffect, useRef } from 'react'
import { pathPartsOf } from '@qilin-agent/util-workspace-path'
import type { ReactNode, RefObject } from 'react'
import type { PropsRenderFactories, PropsRuntime } from '@qilin-agent/client-ui-slots'
import type {} from '@qilin-agent/client-ui-sidebar-files/client'
import type { ContextMenuTriggerProps } from '@qilin-agent/client-ui-context-menu/client'
import css from './TextPreview.module.css'

/** The inputs both navigator Factory positions render from. */
type NavigatorSeatProps = Pick<PropsRuntime<'sidebar.right.pane.tab'>, 'useTabInfo'> & PropsRenderFactories

/** The workspace navigator after the preview's content. */
const NavigatorSeat = memo(function NavigatorSeat({ useTabInfo, renderFactorySlot }: NavigatorSeatProps): ReactNode {
  const { tab } = useTabInfo()
  const onOpen = useCallback((address: string): void => {
    tab.actions.openResource(address, { replaceTab: true })
  }, [tab.actions])
  return renderFactorySlot('sidebar.files.navigator', { useTabInfo, onOpen })
})

/** The navigator's toggle at the header's end. */
const NavigatorToggleSeat = memo(function NavigatorToggleSeat({ useTabInfo, renderFactorySlot }: NavigatorSeatProps): ReactNode {
  return renderFactorySlot('sidebar.files.navigator.toggle', { useTabInfo })
})

/**
 * Keep the path row's `data-textpreview-path-clipped` current: set while the
 * path's text is wider than its box, so the stylesheet fades the clipped start.
 * Read after each commit that can change the path or mount the header, and
 * whenever either box resizes.
 */
function usePathClipped(
  box: RefObject<HTMLSpanElement | null>,
  text: RefObject<HTMLSpanElement | null>,
  path: string,
): void {
  useLayoutEffect(() => {
    const outer = box.current
    const inner = text.current
    if (outer === null || inner === null) return undefined
    const apply = (): void => {
      if (inner.offsetWidth > outer.clientWidth) outer.dataset.textpreviewPathClipped = ''
      else delete outer.dataset.textpreviewPathClipped
    }
    apply()
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(apply)
    observer?.observe(outer)
    observer?.observe(inner)
    return () => { observer?.disconnect() }
  }, [box, text, path])
}

/**
 * Props of {@link PreviewFrame}. `banner`, `tools`, `handoff`, and `children` are
 * ReactNode values passed between Components of this package; no slot owner
 * data or injected member carries them.
 */
export type PreviewFrameProps = NavigatorSeatProps & {
  /** The path the header shows. */
  readonly path: string
  /** Context menu handlers bound to the header path. */
  readonly pathTrigger: ContextMenuTriggerProps
  /** A notice above the header. */
  readonly banner?: ReactNode
  /** Controls between the path and the file handoff. */
  readonly tools?: ReactNode
  /** The contributions that hand the file to the Host, in the same position in every state, before the navigator toggle. */
  readonly handoff?: ReactNode
  /** The content before the navigator. */
  readonly children: ReactNode
  /** Data attributes forwarded to the root element. */
  readonly [attribute: `data-${string}`]: string | undefined
}

/**
 * The text preview's layout for every preview state.
 * @param props - the header and content parts, the navigator inputs, and the root's data attributes.
 * @returns the preview root.
 */
export function PreviewFrame({
  path, pathTrigger, banner, tools, handoff, children, useTabInfo, renderFactorySlot, ...data
}: PreviewFrameProps): ReactNode {
  const pathRef = useRef<HTMLSpanElement | null>(null)
  const pathTextRef = useRef<HTMLSpanElement | null>(null)
  usePathClipped(pathRef, pathTextRef, path)
  const { directory, name } = pathPartsOf(path)
  return (
    <div className={css.preview} {...data}>
      {banner}
      <div className={css.header}>
        <span ref={pathRef} className={css.path} title={path} data-textpreview-path {...pathTrigger}>
          <span ref={pathTextRef} className={css.pathText}>
            {directory !== '' && <span className={css.pathDirectory}>{directory}</span>}
            <span className={css.pathName}>{name}</span>
          </span>
        </span>
        {tools}
        {handoff}
        <NavigatorToggleSeat useTabInfo={useTabInfo} renderFactorySlot={renderFactorySlot} />
      </div>
      <div className={css.content} data-textpreview-content>
        {children}
        <NavigatorSeat useTabInfo={useTabInfo} renderFactorySlot={renderFactorySlot} />
      </div>
    </div>
  )
}
