/**
 * The task-card parts the conversation action draws inline and the sidebar page
 * draws in its board.
 *
 * Each surface owns its CSS module and styles these parts differently, so a
 * part receives the class names it draws with rather than importing one
 * surface's module into the other.
 */
import type { ReactNode } from 'react'
import type { TeamTaskView as TeamTask } from '@qilin-agent/experimental-agent-team/client'
import { StateDot } from '@qilin-agent/client-ui-primitives'
import type { TranslateNS } from '@qilin-agent/client-ui-slots'
import { NS } from './locales.ts'
import { statusKey, taskDotState } from './team-model.ts'

/**
 * The class names the shared parts draw with, as their owner's CSS module spells
 * them: `taskTitle`, `taskState`, and `warning`. A CSS module is an untyped
 * class map, so the owner's module is passed whole rather than re-declared here.
 */
export type TaskCardStyles = Readonly<Record<string, string>>

/**
 * The card's head: the task's subject and its live state.
 * @param props - the task being drawn, the owner's classes, and the owner's copy.
 * @returns the title row.
 */
export function TaskCardHead({ task, styles, t }: {
  task: TeamTask
  styles: TaskCardStyles
  t: TranslateNS<typeof NS>
}): ReactNode {
  return (
    <div className={styles.taskTitle}>
      <strong>{task.subject}</strong>
      <span className={styles.taskState}>
        <StateDot state={taskDotState(task)} />
        <span>{t(statusKey(task.status))}</span>
      </span>
    </div>
  )
}

/**
 * The card's shared task facts: readiness, blockers, declared write scopes, and
 * any scope warning, in one meta row. The identity and owner spans belong to the
 * owner, which places them around these facts.
 * @param props - the task being drawn, the owner's classes, and the owner's copy.
 * @returns the fact spans.
 */
export function TaskFacts({ task, styles, t }: {
  task: TeamTask
  styles: TaskCardStyles
  t: TranslateNS<typeof NS>
}): ReactNode {
  return (
    <>
      {task.status === 'pending' && <span>{task.ready ? t('ready') : t('blocked')}</span>}
      {task.blockedBy.length > 0 && <span>{t('blockedBy')}: {task.blockedBy.join(', ')}</span>}
      {task.writeScopes.length > 0 && <span>{t('writeScopes')}: {task.writeScopes.join(', ')}</span>}
      {task.writeScopeWarnings.map(warning => <span key={warning} className={styles.warning}>{warning}</span>)}
    </>
  )
}
