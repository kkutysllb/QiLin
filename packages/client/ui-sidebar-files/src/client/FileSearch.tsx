/**
 * The filename search beside the tree: the box in the pane's header strip and
 * the matches it returns, drawn in the tree's place while a query stands.
 *
 * Both halves are pure props: the box reports keystrokes and the results report
 * a click, and the body owns what either means. Paths here are the Host's
 * workspace-relative matches, split for display only.
 */
import type { ReactNode } from 'react'
import type { TranslateNS } from '@qilin-agent/client-locale/client'
import {
  FileTypeIcon, IconCloseOutline16, IconSearchOutline16, Input, classifyFileType,
} from '@qilin-agent/client-ui-primitives'
import { pathPartsOf } from '@qilin-agent/util-workspace-path'
import { failureLine } from './FileTree.tsx'
import type { FileSearchState } from './store.ts'
import type {} from './locales.ts'
import css from './FileSearch.module.css'

/**
 * The search box.
 * @param props - the box's text, the two gestures, and its copy.
 * @returns the input row.
 */
export function FileSearchBox(props: {
  readonly query: string
  readonly onQuery: (query: string) => void
  readonly onClear: () => void
  readonly t: TranslateNS<'sidebarFiles'>
}): ReactNode {
  const { query, onQuery, onClear, t } = props
  return (
    <div className={css.search} data-files-search>
      <Input
        className={css.field}
        icon={<IconSearchOutline16 />}
        value={query}
        placeholder={t('search.placeholder')}
        aria-label={t('search.label')}
        data-files-search-input
        onChange={(event) => { onQuery(event.target.value) }}
      />
      {query !== '' && (
        <button
          type="button"
          className={css.clear}
          aria-label={t('search.clear')}
          title={t('search.clear')}
          data-files-search-clear
          onClick={onClear}
        >
          <IconCloseOutline16 />
        </button>
      )}
    </div>
  )
}

/**
 * The matches, or one line naming why there are none.
 * @param props - the search's state, the open gesture, and its copy.
 * @returns the rows of the results list.
 */
export function FileSearchResults(props: {
  readonly state: FileSearchState
  readonly onOpen: (path: string) => void
  readonly t: TranslateNS<'sidebarFiles'>
}): ReactNode {
  const { state, onOpen, t } = props
  if (state.kind === 'failed') {
    return (
      <li className={css.note} data-files-row="search-failed" data-files-code={state.failure.code}>
        {failureLine(t, state.failure)}
      </li>
    )
  }
  if (state.kind !== 'ready') {
    return <li className={css.note} data-files-row="search-running">{t('search.running')}</li>
  }
  if (state.matches.length === 0) {
    return <li className={css.note} data-files-row="search-empty">{t('search.empty')}</li>
  }
  return (
    <>
      {state.matches.map((match) => {
        const { directory, name } = pathPartsOf(match.path)
        return (
          <li key={match.path} data-files-entry="match" data-files-path={match.path}>
            <button type="button" className={css.result} onClick={() => { onOpen(match.path) }}>
              <span className={css.resultName}>
                <FileTypeIcon kind={classifyFileType(name)} size={16} />
                <span className={css.resultText}>{name}</span>
              </span>
              {directory !== '' && <span className={css.resultDirectory}>{directory}</span>}
            </button>
          </li>
        )
      })}
      {state.truncated && <li className={css.note} data-files-row="search-truncated">{t('search.truncated')}</li>}
    </>
  )
}
