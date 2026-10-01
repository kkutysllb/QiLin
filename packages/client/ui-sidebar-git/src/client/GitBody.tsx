/**
 * The `git` page's body: the repository at the session's workspace root.
 *
 * Everything the panel keeps lives in its store, keyed by tab; every ask goes
 * through its injected face. Top to bottom: the status header (branch,
 * upstream position, pull, push, refresh), the three change sections with a
 * per-row context menu (stage, unstage, discard, copy path) and the inline
 * diff a row click opens, the commit box, and the collapsible branch list
 * with its inline create form. One failure strip reports the last Remote
 * failure by its own code.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import clsx from 'clsx'
import {
  Button, IconBranchOutline16, IconChevronDownOutline14, IconCloseOutline16, IconCopyOutline16, IconPlusOutline16,
  IconRefreshOutline16, IconTrashOutline16, Input, Menu, useCopyFeedback, writeClipboard,
  type MenuEntry,
} from '@qilin/client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime, PropsStore } from '@qilin/client-ui-slots'
import type { GitStatusEntry } from '@qilin/api-workspace-git/types'
import type { GitInjected } from './face.ts'
import type {} from './locales.ts'
import { badgeOf, canDiscardEntry, diffLineKind, gitFailureLine, groupChanges } from './git-model.ts'
import type { DiffLineKind } from './git-model.ts'
import type { GhPrState, createGitStore } from './store.ts'
import css from './GitBody.module.css'

/** The body's composed props: the tab it draws, its store, its face, and its copy. */
export type GitBodyProps =
  & PropsRuntime<'sidebar.right.pane.tab'>
  & PropsStore<ReturnType<typeof createGitStore>>
  & InjectFace<GitInjected>
  & PropsLocale<'sidebarGit'>

/** One change section: its identity, its rows, and which diff side a click reads. */
interface ChangeSection {
  readonly id: 'unstaged' | 'staged' | 'untracked'
  readonly label: string
  readonly entries: readonly GitStatusEntry[]
  readonly staged: boolean
}

/** The merge strategies the merge confirmation offers; empty takes the repository default. */
type MergeMethod = '' | 'merge' | 'squash' | 'rebase'

/** The stylesheet class of one diff line kind; context keeps the pane's own ink. */
const DIFF_CLASS: Record<DiffLineKind, string | undefined> = {
  meta: css.diffMeta,
  hunk: css.diffHunk,
  add: css.diffAdd,
  del: css.diffDel,
  context: undefined,
}

/** The panel: status header, changes, inline diff, commit box, branches, and GitHub. */
export function GitBody({
  useTabInfo, useStore, actions, t, start, refresh, stage, unstage, discard, commit, push, pull, checkout,
  createBranch, loadBranches, openDiff, ghAuth, ghList, ghCreatePr, ghMergePr,
}: GitBodyProps): ReactNode {
  const { tab } = useTabInfo()
  const { signal } = tab
  const state = useStore(store => store.byTab[tab.id])
  const diff = state?.diff
  const diffText = diff?.phase.kind === 'ready' ? diff.phase.text : ''
  const [menu, setMenu] = useState<{ entry: GitStatusEntry; x: number; y: number } | null>(null)
  const menuRect = useRef<DOMRect | null>(null)
  const [branchesOpen, setBranchesOpen] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [name, setName] = useState('')
  const [from, setFrom] = useState('')
  const [ghOpen, setGhOpen] = useState(false)
  const [prForm, setPrForm] = useState<{ title: string; body: string; base: string } | null>(null)
  const [merging, setMerging] = useState<{ number: number; method: MergeMethod } | null>(null)
  const { copied, onCopy } = useCopyFeedback(diffText)
  const { copied: urlCopied, onCopy: onCopyUrl } = useCopyFeedback(state?.created?.url ?? '')
  useEffect(() => {
    if (state !== undefined || signal.aborted) return
    start(tab.id, signal)
  }, [state, tab.id, signal, start])

  if (state === undefined) return null
  if (state.repo.kind === 'probing') {
    return (
      <div className={css.status} data-git-state="loading">
        <p className={css.statusLine}>{t('loading')}</p>
      </div>
    )
  }
  if (state.repo.kind === 'empty') {
    return (
      <div className={css.status} data-git-state="empty">
        <p className={css.statusLine}>{t('notRepo')}</p>
      </div>
    )
  }
  if (state.repo.kind === 'failed') {
    const failure = gitFailureLine(t, state.repo.failure)
    return (
      <div className={css.status} data-git-state="failed">
        <p className={clsx(css.statusLine, css.failed)} title={failure.title}>{failure.line}</p>
      </div>
    )
  }

  const { busy, failure, repo } = state
  const { status } = repo
  const groups = groupChanges(status.entries)
  const changes = groups.staged.length + groups.unstaged.length + groups.untracked.length
  const message = state.commitDraft.trim()
  // Staging semantics follow the source-control panel this one ports: a
  // selective index is never overridden, but committing an untouched index
  // with a dirty tree stages everything first.
  const autoStage = groups.staged.length === 0 && changes > 0
  const sections: readonly ChangeSection[] = [
    { id: 'unstaged', label: t('changes.unstaged'), entries: groups.unstaged, staged: false },
    { id: 'staged', label: t('changes.staged'), entries: groups.staged, staged: true },
    { id: 'untracked', label: t('changes.untracked'), entries: groups.untracked, staged: false },
  ]

  const submit = (): void => {
    if (busy || message === '' || changes === 0) return
    commit(tab.id, state.commitDraft, autoStage, signal)
  }
  const openBranches = (): void => {
    setBranchesOpen(true)
    if (state.branches === undefined) loadBranches(tab.id, signal)
  }
  const create = (): void => {
    if (name.trim() === '') return
    createBranch(tab.id, name.trim(), from.trim(), signal)
    setFormOpen(false)
  }
  const prsState: GhPrState = state.prs.kind === 'idle' ? 'open' : state.prs.state
  const prs = state.prs.kind === 'ready' ? state.prs.prs : []

  const items: MenuEntry[] = []
  if (menu !== null) {
    items.push(menu.entry.staged
      ? { id: 'unstage', label: t('unstage'), icon: <IconCloseOutline16 size={14} /> }
      : { id: 'stage', label: t('stage'), icon: <IconPlusOutline16 size={14} /> })
    if (canDiscardEntry(menu.entry)) {
      items.push({ id: 'discard', label: t('discard'), icon: <IconTrashOutline16 size={14} />, danger: true })
    }
    items.push({ type: 'separator', id: 'actions' }, { id: 'copy', label: t('menu.copyPath'), icon: <IconCopyOutline16 size={14} /> })
  }
  const select = (id: string): void => {
    const open = menu
    /* v8 ignore next -- the Menu fires onSelect only for a row of an open menu. */
    if (open === null) return
    setMenu(null)
    if (id === 'stage') stage(tab.id, open.entry.path, signal)
    else if (id === 'unstage') unstage(tab.id, open.entry.path, signal)
    else if (id === 'discard') discard(tab.id, open.entry.path, signal)
    else {
      // The Menu fires onSelect only for a row of an open menu; with stage,
      // unstage, and discard handled above, the remaining row is copy.
      void writeClipboard(open.entry.path)
    }
  }

  return (
    <div className={css.root} data-git-state="ready">
      <div className={css.header}>
        <span className={css.toolIcon} aria-hidden="true"><IconBranchOutline16 /></span>
        <span className={css.branch} data-git-branch>{status.branch ?? t('noBranch')}</span>
        {status.upstream === undefined
          ? <span className={css.upstreamNone}>{t('upstream.none')}</span>
          : (
            <span className={css.upstream}>
              {status.upstream.ahead > 0 && (
                <span className={css.ahead} title={t('upstream.ahead', { n: status.upstream.ahead })}>
                  ↑{status.upstream.ahead}
                </span>
              )}
              {status.upstream.behind > 0 && (
                <span className={css.behind} title={t('upstream.behind', { n: status.upstream.behind })}>
                  ↓{status.upstream.behind}
                </span>
              )}
            </span>
          )}
        <span className={css.spacer} />
        <button
          type="button"
          className={css.action}
          disabled={busy || status.upstream === undefined}
          title={t('pull')}
          onClick={() => { pull(tab.id, signal) }}
        >
          {t('pull')}
        </button>
        <button
          type="button"
          className={css.action}
          disabled={busy}
          title={status.upstream === undefined ? t('pushSetUpstream') : t('push')}
          data-git-push-upstream={status.upstream === undefined ? 'true' : 'false'}
          onClick={() => { push(tab.id, status.upstream === undefined, signal) }}
        >
          {status.upstream === undefined ? t('pushSetUpstream') : t('push')}
        </button>
        <button
          type="button"
          className={css.tool}
          aria-label={t('refresh')}
          title={t('refresh')}
          onClick={() => { refresh(tab.id, signal) }}
        >
          <IconRefreshOutline16 />
        </button>
      </div>
      {failure !== undefined && (
        <p
          className={clsx(css.note, css.failed)}
          role="status"
          data-git-failure={failure.code}
          title={gitFailureLine(t, failure).title}
        >
          {gitFailureLine(t, failure).line}
        </p>
      )}
      {sections.map(section => (
        <section className={css.section} key={section.id} data-git-section={section.id}>
          <div className={css.sectionHeader}>
            <span className={css.sectionTitle}>{section.label} · {section.entries.length}</span>
            {section.entries.length > 0 && (
              <button
                type="button"
                className={css.link}
                disabled={busy}
                onClick={() => {
                  if (section.staged) unstage(tab.id, '', signal)
                  else stage(tab.id, '', signal)
                }}
              >
                {section.staged ? t('unstage') : t('stage')}
              </button>
            )}
          </div>
          {section.entries.length === 0 && <p className={css.note} data-git-row="empty">{t('changes.empty')}</p>}
          <ul className={css.list}>
            {section.entries.map(entry => (
              <li className={css.item} key={entry.path}>
                <button
                  type="button"
                  className={css.row}
                  data-git-path={entry.path}
                  onClick={() => { openDiff(tab.id, entry.path, section.staged, signal) }}
                  onContextMenu={(event) => {
                    event.preventDefault()
                    menuRect.current = new DOMRect(event.clientX, event.clientY, 0, 0)
                    setMenu({ entry, x: event.clientX, y: event.clientY })
                  }}
                >
                  <span className={css.badge} data-git-badge>{badgeOf(entry)}</span>
                  <span className={css.name}>{entry.path}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {diff !== undefined && (
        <section className={css.section} data-git-section="diff">
          <div className={css.sectionHeader}>
            <span className={css.diffPath} title={diff.path}>{diff.path}</span>
            <span className={css.spacer} />
            <button
              type="button"
              className={css.link}
              aria-pressed={diff.staged}
              data-git-diff-toggle
              onClick={() => { openDiff(tab.id, diff.path, !diff.staged, signal) }}
            >
              {t('diff.stagedToggle')}
            </button>
            <button
              type="button"
              className={css.link}
              disabled={diff.phase.kind !== 'ready'}
              onClick={onCopy}
            >
              {copied ? t('diff.copied') : t('diff.copy')}
            </button>
            <button
              type="button"
              className={css.tool}
              aria-label={t('diff.close')}
              title={t('diff.close')}
              onClick={() => { actions.diffClosed(tab.id) }}
            >
              <IconCloseOutline16 />
            </button>
          </div>
          {diff.phase.kind === 'loading' && <p className={css.note} data-git-row="loading">{t('loading')}</p>}
          {diff.phase.kind === 'failed' && (
            <p className={clsx(css.note, css.failed)} title={gitFailureLine(t, diff.phase.failure).title}>
              {gitFailureLine(t, diff.phase.failure).line}
            </p>
          )}
          {diff.phase.kind === 'ready' && diff.phase.text === '' && (
            <p className={css.note} data-git-row="empty">{t('diff.empty')}</p>
          )}
          {diff.phase.kind === 'ready' && diff.phase.text !== '' && (
            <pre className={css.diffBody} data-git-diff>
              {diff.phase.text.split('\n').map((line, index) => {
                const kind = diffLineKind(line)
                return (
                  <div className={clsx(css.diffLine, DIFF_CLASS[kind])} data-git-diff-line={kind} key={index}>
                    {line === '' ? '\u00a0' : line}
                  </div>
                )
              })}
            </pre>
          )}
        </section>
      )}
      <div className={css.commit}>
        <textarea
          className={css.commitInput}
          data-git-commit-input
          placeholder={t('commit.placeholder')}
          value={state.commitDraft}
          disabled={busy}
          onChange={(event) => { actions.commitDraft(tab.id, event.target.value) }}
          onKeyDown={(event) => {
            if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') submit()
          }}
        />
        <div className={css.commitRow}>
          {message === ''
            ? <span className={css.note}>{t('commit.emptyHint')}</span>
            : autoStage && <span className={css.note}>{t('commit.autoStage')}</span>}
          <span className={css.spacer} />
          <Button
            variant="primary"
            size="sm"
            disabled={busy || message === '' || changes === 0}
            title={autoStage ? t('commit.autoStage') : undefined}
            data-git-commit
            onClick={submit}
          >
            {t('commit.button')}
          </Button>
        </div>
      </div>
      <section className={css.section} data-git-section="branches">
        <button
          type="button"
          className={css.sectionToggle}
          aria-expanded={branchesOpen}
          onClick={() => { if (branchesOpen) setBranchesOpen(false); else openBranches() }}
        >
          <IconChevronDownOutline14 className={clsx(css.chevron, !branchesOpen && css.chevronClosed)} />
          {t('branches.title')}
        </button>
        {branchesOpen && state.branches?.kind === 'ready' && state.branches.truncated && (
          <p className={css.note} data-git-row="truncated">{t('branches.truncated')}</p>
        )}
        {branchesOpen && state.branches?.kind === 'ready' && state.branches.branches.length === 0 && (
          <p className={css.note} data-git-row="empty">{t('branches.empty')}</p>
        )}
        {branchesOpen && state.branches?.kind === 'ready' && (
          <ul className={css.list}>
            {state.branches.branches.map(branch => (
              <li className={css.item} key={branch.name}>
                <button
                  type="button"
                  className={css.row}
                  data-git-branch={branch.name}
                  disabled={busy || branch.current}
                  onClick={() => { checkout(tab.id, branch.name, signal) }}
                >
                  <span className={css.name}>{branch.name}</span>
                  {branch.current && <span className={css.pill}>{t('branches.current')}</span>}
                  {branch.upstream !== undefined && (
                    <span className={css.tracking}>
                      {t('branches.tracking', { upstream: branch.upstream, ahead: branch.ahead, behind: branch.behind })}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
        {branchesOpen && state.branches?.kind === 'loading' && (
          <p className={css.note} data-git-row="loading">{t('loading')}</p>
        )}
        {branchesOpen && state.branches?.kind === 'failed' && (
          <p className={clsx(css.note, css.failed)} title={gitFailureLine(t, state.branches.failure).title}>
            {gitFailureLine(t, state.branches.failure).line}
          </p>
        )}
        {branchesOpen && (
          <div className={css.branchForm}>
            {formOpen
              ? (
                <>
                  <Input
                    className={css.input}
                    data-git-branch-name
                    placeholder={t('branches.namePlaceholder')}
                    value={name}
                    disabled={busy}
                    onChange={(event) => { setName(event.target.value) }}
                    onKeyDown={(event) => { if (event.key === 'Enter') create() }}
                  />
                  <Input
                    className={css.input}
                    data-git-branch-from
                    placeholder={t('branches.fromPlaceholder')}
                    value={from}
                    disabled={busy}
                    onChange={(event) => { setFrom(event.target.value) }}
                  />
                  <Button variant="primary" size="sm" disabled={busy || name.trim() === ''} onClick={create}>
                    {t('branches.createButton')}
                  </Button>
                  <button
                    type="button"
                    className={css.tool}
                    aria-label={t('branches.cancel')}
                    title={t('branches.cancel')}
                    onClick={() => { setFormOpen(false) }}
                  >
                    <IconCloseOutline16 />
                  </button>
                </>
              )
              : (
                <button
                  type="button"
                  className={css.link}
                  disabled={busy}
                  onClick={() => { setFormOpen(true); setName(''); setFrom('') }}
                >
                  <IconPlusOutline16 size={14} />
                  {t('branches.create')}
                </button>
              )}
          </div>
        )}
      </section>
      {state.gh.kind !== 'probing' && state.gh.kind !== 'off' && (
        <section className={css.section} data-git-section="github">
          <button
            type="button"
            className={css.sectionToggle}
            aria-expanded={ghOpen}
            onClick={() => {
              if (ghOpen) setGhOpen(false)
              else {
                setGhOpen(true)
                if (state.gh.kind === 'on') ghAuth(tab.id, prsState, signal)
              }
            }}
          >
            <IconChevronDownOutline14 className={clsx(css.chevron, !ghOpen && css.chevronClosed)} />
            {t('gh.title')}
          </button>
          {ghOpen && state.gh.kind === 'authLoading' && (
            <p className={css.note} data-git-row="loading">{t('loading')}</p>
          )}
          {ghOpen && state.gh.kind === 'signedOut' && (
            <div className={css.subrow}>
              <p className={css.note} title={state.gh.message}>{t('gh.signedOut', { message: state.gh.message })}</p>
              <button
                type="button"
                className={css.link}
                onClick={() => { ghAuth(tab.id, prsState, signal) }}
              >
                {t('gh.recheck')}
              </button>
            </div>
          )}
          {ghOpen && state.gh.kind === 'ready' && (
            <>
              {state.created !== undefined && (
                <div className={css.subrow} data-git-notice>
                  <span className={css.noticeText}>{t('gh.created', { number: state.created.number })}</span>
                  <button type="button" className={css.link} onClick={onCopyUrl}>
                    {urlCopied ? t('gh.copiedUrl') : t('gh.copyUrl')}
                  </button>
                  <button
                    type="button"
                    className={css.tool}
                    aria-label={t('gh.dismiss')}
                    title={t('gh.dismiss')}
                    onClick={() => { actions.ghNoticeClosed(tab.id) }}
                  >
                    <IconCloseOutline16 />
                  </button>
                </div>
              )}
              <div className={css.sectionHeader}>
                <span className={css.sectionTitle}>{t('gh.title')}</span>
                {(['open', 'closed', 'all'] as const).map(filter => (
                  <button
                    type="button"
                    key={filter}
                    className={css.link}
                    aria-pressed={prsState === filter}
                    data-git-filter={filter}
                    disabled={state.prs.kind === 'loading'}
                    onClick={() => {
                      if (state.prs.kind !== 'ready' || state.prs.state !== filter) ghList(tab.id, filter, signal)
                    }}
                  >
                    {t(`gh.filter.${filter}`)}
                  </button>
                ))}
              </div>
              {state.prs.kind === 'loading' && <p className={css.note} data-git-row="loading">{t('loading')}</p>}
              {state.prs.kind === 'failed' && (
                <p
                  className={clsx(css.note, css.failed)}
                  role="status"
                  data-git-failure={state.prs.failure.code}
                  title={gitFailureLine(t, state.prs.failure).title}
                >
                  {gitFailureLine(t, state.prs.failure).line}
                </p>
              )}
              {state.prs.kind === 'ready' && prs.length === 0 && (
                <p className={css.note} data-git-row="empty">{t('gh.empty')}</p>
              )}
              {state.prs.kind === 'ready' && prs.length > 0 && (
                <ul className={css.list}>
                  {prs.map(pr => (
                    <li className={css.prRow} key={pr.number} data-git-pr={pr.number}>
                      <div className={css.prLine}>
                        <span className={css.prNumber}>#{pr.number}</span>
                        <span className={css.name}>{pr.title}</span>
                        {pr.isDraft && <span className={css.pill}>{t('gh.draft')}</span>}
                      </div>
                      <div className={css.prSub}>
                        <span className={css.tracking}>
                          {t('gh.prMeta', { head: pr.headRefName, base: pr.baseRefName })}
                        </span>
                        <span className={css.spacer} />
                        {merging?.number === pr.number
                          ? (
                            <>
                              <select
                                className={css.select}
                                aria-label={t('gh.mergeMethod')}
                                value={merging.method}
                                onChange={(event) => {
                                  setMerging({ number: pr.number, method: event.target.value as MergeMethod })
                                }}
                              >
                                <option value="">{t('gh.method.default')}</option>
                                <option value="merge">{t('gh.method.merge')}</option>
                                <option value="squash">{t('gh.method.squash')}</option>
                                <option value="rebase">{t('gh.method.rebase')}</option>
                              </select>
                              <Button
                                variant="primary"
                                size="sm"
                                disabled={busy}
                                onClick={() => {
                                  ghMergePr(tab.id, pr.number, merging.method, prsState, signal)
                                  setMerging(null)
                                }}
                              >
                                {t('gh.merge')}
                              </Button>
                              <button
                                type="button"
                                className={css.tool}
                                aria-label={t('gh.cancel')}
                                title={t('gh.cancel')}
                                onClick={() => { setMerging(null) }}
                              >
                                <IconCloseOutline16 />
                              </button>
                            </>
                          )
                          : (
                            <button
                              type="button"
                              className={css.link}
                              disabled={busy}
                              onClick={() => { setMerging({ number: pr.number, method: '' }) }}
                            >
                              {t('gh.merge')}
                            </button>
                          )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              <div className={css.branchForm}>
                {prForm === null
                  ? (
                    <button
                      type="button"
                      className={css.link}
                      disabled={busy}
                      onClick={() => { setPrForm({ title: '', body: '', base: status.branch ?? '' }) }}
                    >
                      <IconPlusOutline16 size={14} />
                      {t('gh.create')}
                    </button>
                  )
                  : (
                    <div className={css.prForm}>
                      <Input
                        className={css.input}
                        data-git-pr-title
                        placeholder={t('gh.titlePlaceholder')}
                        value={prForm.title}
                        disabled={busy}
                        onChange={(event) => { setPrForm({ ...prForm, title: event.target.value }) }}
                      />
                      <textarea
                        className={clsx(css.commitInput, css.prBody)}
                        data-git-pr-body
                        placeholder={t('gh.bodyPlaceholder')}
                        value={prForm.body}
                        disabled={busy}
                        onChange={(event) => { setPrForm({ ...prForm, body: event.target.value }) }}
                      />
                      <Input
                        className={css.input}
                        data-git-pr-base
                        placeholder={t('gh.basePlaceholder')}
                        value={prForm.base}
                        disabled={busy}
                        onChange={(event) => { setPrForm({ ...prForm, base: event.target.value }) }}
                      />
                      <Button
                        variant="primary"
                        size="sm"
                        disabled={busy || prForm.title.trim() === ''}
                        onClick={() => {
                          ghCreatePr(tab.id, prForm.title.trim(), prForm.body.trim(), prForm.base.trim(), prsState, signal)
                          setPrForm(null)
                        }}
                      >
                        {t('gh.createButton')}
                      </Button>
                      <button
                        type="button"
                        className={css.tool}
                        aria-label={t('gh.cancel')}
                        title={t('gh.cancel')}
                        onClick={() => { setPrForm(null) }}
                      >
                        <IconCloseOutline16 />
                      </button>
                    </div>
                  )}
              </div>
            </>
          )}
        </section>
      )}
      <Menu
        open={menu !== null}
        anchor={<span className={css.menuAnchor} data-git-menu-anchor hidden />}
        items={items}
        autoFocus
        portal
        onClose={() => { setMenu(null) }}
        onSelect={select}
        getAnchorRect={() => menuRect.current}
      />
    </div>
  )
}
