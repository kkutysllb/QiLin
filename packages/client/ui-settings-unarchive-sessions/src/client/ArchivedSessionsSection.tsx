/**
 * Archived-session Settings page: the registry-global archive set joined with
 * the loaded Session summaries, newest archive first, filtered by one search
 * box. Each row restores its Session, or deletes it together with its stored
 * log after an explicit acknowledgement. An archive entry whose Session is
 * gone has no row and no action; the set itself stays host-owned.
 */
import { useMemo, useState, type ReactNode } from 'react'
import {
  Button, IconSearchOutlineRegular, IconTrashOutlineRegular, RiskConfirmation, relativeTime,
} from '@qilin-agent/client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@qilin-agent/client-ui-slots'
import type { SessionId } from '@qilin-agent/session/types'
import type { ArchivedSessionsLocaleKey } from './locales.ts'
import css from './ArchivedSessionsSection.module.css'

/** Why a delete request was refused, as the page can explain it. */
export type ArchivedSessionDeleteFailure = 'not-archived' | 'live' | 'active' | 'busy' | 'unsupported' | 'unknown'

/** Outcome of one delete request. */
export type ArchivedSessionDeleteResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: ArchivedSessionDeleteFailure }

/** Registration-side face used by the page. */
export interface ArchivedSessionsSectionInjected {
  /**
   * Restore one archived Session.
   * @param sessionId - Session to unarchive.
   */
  unarchive: (sessionId: SessionId) => Promise<void>
  /**
   * Delete one archived Session and its stored log.
   * @param sessionId - Archived Session to delete.
   */
  deleteArchivedSession: (sessionId: SessionId) => Promise<ArchivedSessionDeleteResult>
}

/** Full component props assembled by the Settings slot renderer. */
export type ArchivedSessionsSectionProps =
  PropsRuntime<'settings.section'>
  & PropsLocale<'settings.archivedSessions'>
  & InjectFace<ArchivedSessionsSectionInjected>

type Translate = ArchivedSessionsSectionProps['t']

/** One archived Session as the page renders it. */
interface ArchivedRow {
  id: SessionId
  title: string
  /** Owning Workspace title, or the ungrouped label for a Session outside every Workspace. */
  workspace: string
  updatedAt: number
}

/** Localized compact relative time of one row's last activity. */
function timeLabel(updatedAt: number, now: number, t: Translate): string {
  const { unit, n } = relativeTime(updatedAt, now)
  return unit === 'now' ? t('time.now') : t(`time.${unit}`, { n })
}

/** Whether one row matches the normalized query in its title or Workspace label. */
function matches(row: ArchivedRow, normalizedQuery: string): boolean {
  return normalizedQuery.length === 0
    || row.title.toLowerCase().includes(normalizedQuery)
    || row.workspace.toLowerCase().includes(normalizedQuery)
}

/** Localized explanation of one refused delete. */
const FAILURE_LABELS: Record<ArchivedSessionDeleteFailure, ArchivedSessionsLocaleKey> = {
  'not-archived': 'deleteFailed.not-archived',
  'live': 'deleteFailed.live',
  'active': 'deleteFailed.active',
  'busy': 'deleteFailed.busy',
  'unsupported': 'deleteFailed.unsupported',
  'unknown': 'deleteFailed.unknown',
}

/**
 * @param reason - the Host's refusal kind.
 * @returns the dictionary key naming that refusal.
 */
function failureLabel(reason: ArchivedSessionDeleteFailure): ArchivedSessionsLocaleKey {
  return FAILURE_LABELS[reason]
}

/**
 * Render the archived-session page.
 * @param props - composed slot props (see {@link ArchivedSessionsSectionProps}).
 * @returns the settings page element tree.
 */
export function ArchivedSessionsSection(props: ArchivedSessionsSectionProps): ReactNode {
  const { t, unarchive, deleteArchivedSession, useSessions, useWorkspaces } = props
  const sessions = useSessions(state => state)
  const workspaces = useWorkspaces(state => state.items)
  const archivedSessionIds = useWorkspaces(state => state.archivedSessionIds)
  const [query, setQuery] = useState('')
  const [target, setTarget] = useState<ArchivedRow | null>(null)
  const [acknowledged, setAcknowledged] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [failure, setFailure] = useState<ArchivedSessionsLocaleKey | null>(null)
  const ungrouped = t('ungrouped')
  const summaries = sessions.byId

  // Archive order is oldest first; the page lists the most recently archived
  // Session first. A member with no loaded summary is not addressable here.
  const rows = useMemo<ArchivedRow[]>(() => {
    const owners = new Map<string, string>()
    for (const workspace of workspaces) {
      for (const id of workspace.sessionIds) owners.set(id, workspace.title)
    }
    return [...archivedSessionIds].reverse().flatMap((id) => {
      const summary = summaries[id]
      if (summary === undefined) return []
      return [{
        id,
        title: summary.displayTitle,
        workspace: owners.get(id) ?? ungrouped,
        updatedAt: summary.updatedAt,
      }]
    })
  }, [archivedSessionIds, workspaces, summaries, ungrouped])

  if (sessions.phase !== 'ready') return <p className={css.status}>{t('loading')}</p>

  const now = Date.now()
  const visible = rows.filter(row => matches(row, query.trim().toLowerCase()))
  const archived = archivedSessionIds.length > 0

  const openDelete = (row: ArchivedRow): void => {
    setFailure(null)
    setAcknowledged(false)
    setTarget(row)
  }

  const closeDelete = (): void => {
    if (deleting) return
    setTarget(null)
    setAcknowledged(false)
  }

  const confirmDelete = (): void => {
    if (target === null || !acknowledged || deleting) return
    setDeleting(true)
    setFailure(null)
    deleteArchivedSession(target.id).then((result) => {
      setDeleting(false)
      if (result.ok) {
        setTarget(null)
        setAcknowledged(false)
        return
      }
      setFailure(failureLabel(result.reason))
    }, (reason: unknown) => {
      // A transport fault is not a refusal the page can explain; keep the row.
      console.warn('session delete rejected:', reason)
      setDeleting(false)
      setFailure(failureLabel('unknown'))
    })
  }

  return (
    <div className={css.section}>
      <div className={css.controls}>
        <div className={css.search}>
          <IconSearchOutlineRegular aria-hidden="true" />
          <input
            type="search"
            value={query}
            placeholder={t('search')}
            aria-label={t('search')}
            onChange={(event) => { setQuery(event.currentTarget.value) }}
          />
        </div>
        {archived ? <span className={css.count}>{t('count', { n: String(rows.length) })}</span> : null}
      </div>
      {!archived ? <p className={css.status}>{t('empty')}</p> : null}
      {archived && rows.length === 0 ? <p className={css.status}>{t('unavailable')}</p> : null}
      {rows.length > 0 && visible.length === 0 ? <p className={css.status}>{t('emptySearch')}</p> : null}
      {visible.length > 0 ? (
        <ul className={css.list}>
          {visible.map(row => (
            <li key={row.id} className={css.row}>
              <span className={css.identity}>
                <span className={css.title} title={row.title}>{row.title}</span>
                <span className={css.meta}>
                  {[row.workspace, timeLabel(row.updatedAt, now, t)].join(' · ')}
                </span>
              </span>
              <span className={css.actions}>
                <Button
                  variant="outline"
                  size="sm"
                  aria-label={t('unarchiveNamed', { title: row.title })}
                  onClick={() => {
                    unarchive(row.id).catch((reason: unknown) => {
                      console.warn('session unarchive rejected:', reason)
                    })
                  }}
                >
                  {t('unarchive')}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className={css.dangerAction}
                  aria-label={t('deleteNamed', { title: row.title })}
                  title={t('delete')}
                  icon={<IconTrashOutlineRegular aria-hidden="true" />}
                  onClick={() => { openDelete(row) }}
                />
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {failure !== null ? <p className={css.failure} role="status">{t(failure)}</p> : null}
      <RiskConfirmation
        open={target !== null}
        title={t('deleteTitle')}
        description={target === null ? '' : t('deleteDescription', { title: target.title })}
        acknowledgeLabel={t('deleteAcknowledge')}
        cancelLabel={t('deleteCancel')}
        closeLabel={t('close')}
        confirmLabel={deleting ? t('deleteProgress') : t('deleteConfirm')}
        acknowledged={acknowledged}
        disabled={deleting}
        onAcknowledgedChange={setAcknowledged}
        onCancel={closeDelete}
        onConfirm={confirmDelete}
      />
    </div>
  )
}
