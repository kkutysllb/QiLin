/** MCP servers main panel: the page as a full workspace pane beside the sidebar. */

import type { ReactNode } from 'react'
import type { InjectFace, PropsRuntime } from '@qilin-agent/client-ui-slots'
import { McpSection } from './McpSection.tsx'
import type { McpSectionInjected } from './McpSection.tsx'
import css from './McpPanelPage.module.css'

/** Props the renderer binds for the panel: the page's inject face. */
export type McpPanelPageProps = PropsRuntime<'main'> & InjectFace<McpSectionInjected>

/**
 * Render the MCP servers panel.
 *
 * The panel owns the whole centre column, so it carries its own scroll area and
 * a readable measure instead of inheriting the Settings shell's padding.
 * @param props - composed panel props.
 * @returns the panel element tree.
 */
export function McpPanelPage(props: McpPanelPageProps): ReactNode {
  return (
    <div className={css.page}>
      <div className={css.column}>
        <McpSection {...props} />
      </div>
    </div>
  )
}
