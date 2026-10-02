/**
 * The `agent-team` right-Sidebar page: roster, shared-task board, and the
 * create/edit forms, driven by the `agentTeams` write bridge.
 *
 * The board reads the Lead Session's `agentTeam` projection through the
 * shared Session store — every committed write arrives as a projection push,
 * so the page keeps no board copy of its own. The component never awaits:
 * button and form commits call the injected write face, and the face records
 * each outcome in the page store this body reads. A form closes when its
 * write settles without a notice and stays open beside the notice otherwise.
 */
import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { TeamMemberProjection, TeamTaskView as TeamTask } from '@qilin/experimental-agent-team/client'
import type {} from '@qilin/api-session-controller/client'
import {
  IconCloseOutline16,
  IconPlusOutline16,
  IconRefreshOutline14,
  IconTrashOutline16,
  IconUserOutline16,
  StateDot,
} from '@qilin/client-ui-primitives'
import type {
  InjectFace,
  PropsLocale,
  PropsRuntime,
  PropsStore,
  TranslateNS,
} from '@qilin/client-ui-slots'
import type {} from '@qilin/client-ui-sidebar-right/client'
import type {} from '@qilin/client-ui-session/client'
import type {} from '@qilin/client-locale/client'
import type {} from '@qilin/client-ui-renderer/client'
import {
  emptyTeamDraft,
  isTeamDraftCommittable,
  memberDotState,
  memberStatusKey,
  statusKey,
  taskDotState,
  teamDraftOf,
  teamFormFieldsOf,
  type MemberStatus,
  type TeamDraft,
} from './team-model.ts'
import type { createTeamPageStore } from './team-page-store.ts'
import type { TeamPageInjected } from './team-writes.ts'
import { NS } from './locales.ts'
import css from './TeamBody.module.css'

/** The body's composed props: the tab it draws, its store, its face, and its copy. */
export type TeamBodyProps =
  & PropsRuntime<'sidebar.right.pane.tab'>
  & PropsStore<ReturnType<typeof createTeamPageStore>>
  & InjectFace<TeamPageInjected>
  & PropsLocale<typeof NS>

/**
 * The Team type's chip title: the person glyph before the type's label.
 * @param props - the tab information hook.
 * @returns the glyph followed by the tab's title text.
 */
export function TeamTitle({ useTabInfo }: PropsRuntime<'sidebar.right.pane.tab.title'>): ReactNode {
  const { tab } = useTabInfo()
  return (
    <>
      <IconUserOutline16 size={16} className={css.titleIcon} />
      {tab.title}
    </>
  )
}

/** The create or edit form the page may show, one at a time. */
type PageForm = { readonly kind: 'create'; readonly draft: TeamDraft }
  | { readonly kind: 'edit'; readonly task: TeamTask; readonly draft: TeamDraft }
  | null

/** Shared props of the page's parts: the tab identity, the copy, and the write-busy flag. */
type PagePartProps =
  & Pick<TeamBodyProps, 'sessionId' | 't'>
  & { readonly busy: boolean }

/** One roster card: activity dot, durable name, live status, and the open action. */
function MemberRow({
  member, sessionId, useSessions, useSessionStatus, openTeammate, t,
}: PagePartProps
  & Pick<TeamBodyProps, 'useSessions' | 'useSessionStatus'>
  & Pick<TeamPageInjected, 'openTeammate'>
  & { member: TeamMemberProjection }): ReactNode {
  const model = useSessions(state => state.projectionsBySession[member.id]?.values.modelSelection?.next?.model)
  const running = useSessionStatus(state => state.get(member.id)?.running)
  const summaryRunning = useSessions(state => state.byId[member.id]?.running)
  const status: MemberStatus = member.phase === 'active'
    ? (running ?? summaryRunning) === true ? 'running' : 'inactive'
    : member.phase
  const isCurrent = member.id === sessionId
  const openable = !isCurrent && status !== 'failed' && status !== 'provisioning'
  return (
    <button
      type="button"
      className={css.member}
      disabled={!openable}
      onClick={() => { openTeammate(sessionId, member.id) }}
    >
      <span className={css.memberDot}>
        {status === 'inactive'
          ? <IconUserOutline16 size={14} className={css.inactiveGlyph} />
          : <StateDot state={memberDotState(status)} />}
      </span>
      <span className={css.memberText}>
        <span className={css.memberName}>
          <span className={css.memberNameText}>{member.name}</span>
          {isCurrent && <span className={css.currentTag}>{t('current')}</span>}
        </span>
        <small>
          {t(memberStatusKey(status))}
          {model !== undefined && <span className={css.memberModel}>{` · ${t('model')}: ${model}`}</span>}
        </small>
        {member.error !== undefined && <small className={css.diagnostic}>{member.error}</small>}
      </span>
    </button>
  )
}

/** The owner select: every live roster name plus the unowned release option. */
function OwnerSelect({
  task, members, sessionId, busy, reassignTask, t,
}: PagePartProps & { task: TeamTask; members: readonly TeamMemberProjection[] }
  & Pick<TeamPageInjected, 'reassignTask'>): ReactNode {
  return (
    <label className={css.ownerSelect}>
      <span>{t('owner')}</span>
      <select
        value={task.ownerName ?? ''}
        disabled={busy}
        aria-label={t('owner')}
        onChange={(event) => {
          const owner = event.target.value
          reassignTask(sessionId, task, owner === '' ? undefined : owner)
        }}
      >
        <option value="">{t('unowned')}</option>
        {members.filter(member => member.phase === 'active').map(member => (
          <option key={member.id} value={member.name}>{member.name}</option>
        ))}
      </select>
    </label>
  )
}

/** One board card: status, full description, meta line, owner select, and actions. */
function TaskCard({
  task, members, sessionId, busy, openEdit, transitionTask, reassignTask, t,
}: PagePartProps
  & { task: TeamTask; members: readonly TeamMemberProjection[]; openEdit: (task: TeamTask) => void }
  & Pick<TeamPageInjected, 'transitionTask' | 'reassignTask'>): ReactNode {
  const [armed, setArmed] = useState(false)
  return (
    <article className={css.task}>
      <div className={css.taskTitle}>
        <strong>{task.subject}</strong>
        <span className={css.taskState}>
          <StateDot state={taskDotState(task)} />
          <span>{t(statusKey(task.status))}</span>
        </span>
      </div>
      <p className={css.taskDescription}>{task.description}</p>
      <div className={css.meta}>
        <span>{task.id}</span>
        {task.status === 'pending' && <span>{task.ready ? t('ready') : t('blocked')}</span>}
        {task.blockedBy.length > 0 && <span>{t('blockedBy')}: {task.blockedBy.join(', ')}</span>}
        {task.writeScopes.length > 0 && <span>{t('writeScopes')}: {task.writeScopes.join(', ')}</span>}
        {task.writeScopeWarnings.map(warning => <span key={warning} className={css.warning}>{warning}</span>)}
      </div>
      <div className={css.controls}>
        <OwnerSelect task={task} members={members} sessionId={sessionId} busy={busy} reassignTask={reassignTask} t={t} />
        <span className={css.actions}>
          {task.status === 'in_progress' && (
            <button type="button" className={css.actionButton} disabled={busy}
              onClick={() => { transitionTask(sessionId, task, 'complete') }}>
              {t('complete')}
            </button>
          )}
          {task.status === 'completed' && (
            <button type="button" className={css.actionButton} disabled={busy}
              onClick={() => { transitionTask(sessionId, task, 'reopen') }}>
              {t('reopen')}
            </button>
          )}
          <button
            type="button"
            className={css.actionButton}
            disabled={busy}
            onClick={() => { openEdit(task) }}
          >
            {t('edit')}
          </button>
          <button
            type="button"
            className={armed ? `${css.actionButton} ${css.deleteArmed}` : css.actionButton}
            disabled={busy}
            onClick={() => {
              if (!armed) {
                setArmed(true)
                return
              }
              setArmed(false)
              transitionTask(sessionId, task, 'delete')
            }}
          >
            <IconTrashOutline16 size={13} />
            {t(armed ? 'deleteArmed' : 'delete')}
          </button>
        </span>
      </div>
    </article>
  )
}

/** The create or edit form; the commit and change callbacks belong to the page. */
function TaskForm({
  title, draft, busy, change, commit, cancel, t,
}: {
  title: string
  draft: TeamDraft
  busy: boolean
  change: (part: Partial<TeamDraft>) => void
  commit: () => void
  cancel: () => void
  t: TranslateNS<typeof NS>
}): ReactNode {
  return (
    <form className={css.form} onSubmit={(event) => { event.preventDefault() }}>
      <strong>{title}</strong>
      <input
        className={css.textInput}
        value={draft.subject}
        placeholder={t('placeholder.subject')}
        aria-label={t('subject')}
        disabled={busy}
        onChange={(event) => { change({ subject: event.target.value }) }}
      />
      <textarea
        className={css.textInput}
        value={draft.description}
        placeholder={t('placeholder.description')}
        aria-label={t('description')}
        rows={3}
        disabled={busy}
        onChange={(event) => { change({ description: event.target.value }) }}
      />
      <input
        className={css.textInput}
        value={draft.blockers}
        placeholder={t('placeholder.blockers')}
        aria-label={t('blockedBy')}
        disabled={busy}
        onChange={(event) => { change({ blockers: event.target.value }) }}
      />
      <input
        className={css.textInput}
        value={draft.scopes}
        placeholder={t('placeholder.scopes')}
        aria-label={t('writeScopes')}
        disabled={busy}
        onChange={(event) => { change({ scopes: event.target.value }) }}
      />
      <small className={css.hint}>{t('formHint')}</small>
      <div className={css.actions}>
        <button type="button" className={css.actionButton} disabled={busy} onClick={cancel}>{t('cancel')}</button>
        <button
          type="button"
          className={css.commitButton}
          disabled={busy || !isTeamDraftCommittable(draft)}
          onClick={commit}
        >
          {t('commit')}
        </button>
      </div>
    </form>
  )
}

/**
 * Render the Team page: notices, toolbar, roster, board, and the open form.
 * @param props - the tab's shares, the page store, the write face, and the copy.
 * @returns the page.
 */
export function TeamBody({
  sessionId, useSession, useSessions, useSessionStatus, useStore, actions,
  openTeammate, refresh, createTask, editTask, transitionTask, reassignTask, t,
}: TeamBodyProps): ReactNode {
  const [form, setForm] = useState<PageForm>(null)
  /** A commit awaiting its settlement: the form closes when the store stays notice-free. */
  const [closingForm, setClosingForm] = useState(false)
  const busy = useStore(state => state.busy)
  const notice = useStore(state => state.notice)
  const leadSessionId = useSession(snapshot => snapshot.subagent?.address.parentSessionId) ?? sessionId
  const team = useSessions(state => state.projectionsBySession[leadSessionId]?.values.agentTeam)
  const opening = useSession(snapshot => snapshot.openState === 'loading')
  const listing = useSessions(state => state.phase === 'pending')

  useEffect(() => {
    setForm(null)
    setClosingForm(false)
  }, [sessionId])

  useEffect(() => {
    if (!closingForm || busy) return
    setClosingForm(false)
    if (notice === undefined) setForm(null)
  }, [closingForm, busy, notice])

  return (
    <div className={css.root} data-team-page>
      <div className={css.toolbar}>
        <span className={css.toolbarText}>{t('tasks')}</span>
        <button type="button" className={css.actionButton} disabled={busy} onClick={() => { refresh(sessionId) }}>
          <IconRefreshOutline14 size={13} />
          {t('refresh')}
        </button>
        <button
          type="button"
          className={form?.kind === 'create' ? `${css.actionButton} ${css.toolbarActive}` : css.actionButton}
          disabled={busy}
          onClick={() => {
            setClosingForm(false)
            setForm(current => current?.kind === 'create' ? null : { kind: 'create', draft: emptyTeamDraft() })
          }}
        >
          <IconPlusOutline16 size={13} />
          {t('create')}
        </button>
      </div>
      {busy && (
        <div className={css.notice} role="status"><StateDot state="ongoing" />{t('busy')}</div>
      )}
      {notice !== undefined && (
        <div
          className={notice.kind === 'conflict' ? `${css.notice} ${css.warningNotice}` : `${css.notice} ${css.errorNotice}`}
          role="alert"
        >
          <StateDot state={notice.kind === 'conflict' ? 'warning' : 'error'} />
          {notice.kind === 'conflict' ? t('conflict') : t('rejected', { message: notice.message })}
          <button
            type="button"
            className={css.noticeClose}
            aria-label={t('notice.close')}
            disabled={busy}
            onClick={actions.cleared}
          >
            <IconCloseOutline16 size={12} />
          </button>
        </div>
      )}
      {team === undefined && (
        <div className={css.notice} role="status">
          <StateDot state={opening || listing ? 'ongoing' : 'warning'} />
          {t(opening || listing ? 'loading' : 'unavailable')}
        </div>
      )}
      {team !== undefined && team.failure !== undefined && (
        <div className={`${css.notice} ${css.errorNotice}`} role="alert">
          <StateDot state="error" />{t('failure', { message: team.failure })}
        </div>
      )}
      {team !== undefined && (
        <>
          <section>
            <h3>
              {t('roster')}
              <span className={css.count}>{team.members.length}</span>
            </h3>
            <div className={css.roster}>
              {team.members.map(member => (
                <MemberRow
                  key={member.id}
                  member={member}
                  sessionId={sessionId}
                  useSessions={useSessions}
                  useSessionStatus={useSessionStatus}
                  openTeammate={openTeammate}
                  busy={busy}
                  t={t}
                />
              ))}
            </div>
          </section>
          <section>
            {form?.kind === 'create' && (
              <TaskForm
                title={t('create')}
                draft={form.draft}
                busy={busy}
                change={(part) => { setForm({ kind: 'create', draft: { ...form.draft, ...part } }) }}
                commit={() => {
                  createTask(sessionId, teamFormFieldsOf(form.draft))
                  setClosingForm(true)
                }}
                cancel={() => { setForm(null) }}
                t={t}
              />
            )}
            {form?.kind === 'edit' && (
              <TaskForm
                title={t('edit')}
                draft={form.draft}
                busy={busy}
                change={(part) => { setForm({ kind: 'edit', task: form.task, draft: { ...form.draft, ...part } }) }}
                commit={() => {
                  editTask(sessionId, form.task, teamFormFieldsOf(form.draft))
                  setClosingForm(true)
                }}
                cancel={() => { setForm(null) }}
                t={t}
              />
            )}
          </section>
          <section>
            {team.tasks.length === 0
              ? <p className={css.emptyNotice}>{t('empty')}</p>
              : (
                <>
                  <h3>
                    {t('tasks')}
                    <span className={css.count}>{team.tasks.length}</span>
                  </h3>
                  <div className={css.tasks}>
                    {team.tasks.map(task => (
                      <TaskCard
                        key={task.id}
                        task={task}
                        members={team.members}
                        sessionId={sessionId}
                        busy={busy}
                        openEdit={(task2) => {
                          setClosingForm(false)
                          setForm({ kind: 'edit', task: task2, draft: teamDraftOf(task2) })
                        }}
                        transitionTask={transitionTask}
                        reassignTask={reassignTask}
                        t={t}
                      />
                    ))}
                  </div>
                </>
              )}
          </section>
        </>
      )}
    </div>
  )
}
