/**
 * The filename search beside the tree: the box in the pane's header strip and
 * the matches it returns, drawn in the tree's place while a query stands.
 *
 * Both halves are pure props: the box reports keystrokes and the results report
 * a click, and the body owns what either means. Paths here are the Host's
 * workspace-relative matches, split for display only.
 */
import { useState } from 'react'
import type { ReactNode } from 'react'
import type { TranslateNS } from '@qilin-agent/client-locale/client'
import {
  FileTypeIcon, IconCloseOutlineRegular, IconPlusOutlineRegular, IconSearchOutlineRegular, IconSettingsOutlineRegular,
  IconTrashOutlineRegular, Input, Tooltip, classifyFileType,
} from '@qilin-agent/client-ui-primitives'
import { pathPartsOf } from '@qilin-agent/util-workspace-path'
import { failureLine } from './FileTree.tsx'
import type { FileSearchState, HiddenKinds, SearchMode } from './store.ts'
import type {} from './locales.ts'
import css from './FileSearch.module.css'

/**
 * The search box.
 * @param props - the box's text, the two gestures, and its copy.
 * @returns the input row.
 */
export function FileSearchBox(props: {
  readonly query: string
  readonly mode: SearchMode
  readonly onQuery: (query: string) => void
  readonly onClear: () => void
  readonly onMode: (mode: SearchMode) => void
  readonly settingsOpen: boolean
  readonly onSettingsToggle: () => void
  /** The settings panel while it is open; it anchors under this row. */
  readonly settings?: ReactNode
  readonly t: TranslateNS<'sidebarFiles'>
}): ReactNode {
  const { query, mode, onQuery, onClear, onMode, settingsOpen, onSettingsToggle, settings, t } = props
  return (
    <div className={css.search} data-files-search>
      <Input
        className={css.field}
        icon={<IconSearchOutlineRegular />}
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
          <IconCloseOutlineRegular />
        </button>
      )}
      <span className={css.modes} role="group" aria-label={t('search.mode.label')}>
        {(['name', 'path'] as const).map(candidate => (
          <button
            key={candidate}
            type="button"
            className={css.mode}
            aria-pressed={mode === candidate}
            data-files-search-mode={candidate}
            onClick={() => { onMode(candidate) }}
          >
            {t(candidate === 'name' ? 'search.mode.name' : 'search.mode.path')}
          </button>
        ))}
      </span>
      <Tooltip label={t('search.settings')} side="bottom" align="end" delayMs={500} portal>
        <button
          type="button"
          className={css.clear}
          aria-label={t('search.settings')}
          aria-expanded={settingsOpen}
          data-files-search-settings
          onClick={onSettingsToggle}
        >
          <IconSettingsOutlineRegular size={15} />
        </button>
      </Tooltip>
      {settings}
    </div>
  )
}

/**
 * The search settings popover: this reader's own excluded directories and the
 * hidden-entry kinds the search follows.
 * @param props - the exclusions, hidden kinds, their gestures, and the copy.
 * @returns the floating settings panel.
 */
export function FileSearchSettings(props: {
  readonly excludes: readonly string[]
  readonly hidden: HiddenKinds
  readonly onToggleHidden: (kind: keyof HiddenKinds) => void
  readonly onAddExclude: (name: string) => void
  readonly onRemoveExclude: (name: string) => void
  readonly onClose: () => void
  readonly t: TranslateNS<'sidebarFiles'>
}): ReactNode {
  const { excludes, hidden, onToggleHidden, onAddExclude, onRemoveExclude, onClose, t } = props
  const [text, setText] = useState('')
  return (
    <div className={css.settings} role="dialog" aria-label={t('search.settings')} data-files-search-settings-panel
      onKeyDown={(event) => {
        if (event.key === 'Escape' && !event.nativeEvent.isComposing) onClose()
      }}>
      <p className={css.settingsTitle}>{t('search.hidden.title')}</p>
      {(['dotfiles', 'nodeModules'] as const).map(kind => (
        <label key={kind} className={css.settingsRow}>
          <input
            type="checkbox"
            checked={hidden[kind]}
            data-files-hidden-toggle={kind}
            onChange={() => { onToggleHidden(kind) }}
          />
          <span>{t(kind === 'dotfiles' ? 'hideDotfiles' : 'hideNodeModules')}</span>
        </label>
      ))}
      <p className={css.settingsTitle}>{t('search.exclude.title')}</p>
      <form className={css.settingsRow} onSubmit={(event) => {
        event.preventDefault()
        onAddExclude(text)
        setText('')
      }}>
        <input
          className={css.settingsInput}
          type="text"
          value={text}
          aria-label={t('search.exclude.add')}
          placeholder={t('search.exclude.add')}
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => { setText(event.target.value) }}
        />
        <button type="submit" className={css.settingsAction} aria-label={t('search.exclude.add')}>
          <IconPlusOutlineRegular size={14} />
        </button>
      </form>
      {excludes.length === 0
        ? <p className={css.settingsNote}>{t('search.exclude.empty')}</p>
        : (
          <ul className={css.excludes}>
            {excludes.map(name => (
              <li key={name} className={css.exclude}>
                <span>{name}</span>
                <button type="button" className={css.settingsAction} aria-label={t('search.exclude.remove', { name })}
                  onClick={() => { onRemoveExclude(name) }}>
                  <IconTrashOutlineRegular size={14} />
                </button>
              </li>
            ))}
          </ul>
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
