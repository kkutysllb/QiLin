/**
 * The Team page's asynchronous half: every `agentTeams` write, bound to the
 * page store's actions.
 *
 * The component never awaits anything. It calls one of the face's entries and
 * this face performs the mutation and writes the outcome through the store's
 * own actions. Writes always go out under the Team Lead's identity — a
 * teammate conversation resolves to its Lead first, because the gateway's
 * agent lookup cannot resume a subagent-owned Session. One write flies at a
 * time per Session (`busy`); a `stale-revision` refusal records the conflict
 * notice and refreshes the Lead's projections so the board shows the current
 * revisions; every other refusal records the wire failure's message.
 */
import type { ClientRemote, RemoteResult } from '@qilin/api-remotes/client'
import type { BoundActions } from '@qilin/client-store'
import type { SessionTarget } from '@qilin/api-session-controller/client'
import type { SessionId } from '@qilin/session/types'
import type { TeamTaskId, TeamTaskView as TeamTask } from '@qilin/experimental-agent-team/client'
import { sameTeamSet } from './team-model.ts'
import type { createTeamPageStore } from './team-page-store.ts'

/**
 * The slice of the Client Remote face the page calls: the `agentTeams`
 * namespace's two write methods, exactly as the Host's generated client
 * declares them.
 */
export type TeamWriter = Pick<ClientRemote['agentTeams'], 'createTask' | 'updateTask'>

/** One create or edit form's normalized fields, ready for the wire request. */
export interface TeamTaskFormFields {
  /** Task subject, trimmed by the caller. */
  readonly subject: string
  /** Task description, trimmed by the caller. */
  readonly description: string
  /** Blocker task ids in first-occurrence order. */
  readonly blockers: readonly TeamTaskId[]
  /** Write-scope prefixes in first-occurrence order. */
  readonly writeScopes: readonly string[]
}

/** The browser actions the Team page and popover perform. */
export interface TeamPageInjected {
  /**
   * Open a roster Session from the current conversation: the Lead in the main
   * view, a teammate as a continuable child beside it.
   * @param sessionId - the conversation the action runs from.
   * @param childSessionId - the roster Session to open.
   */
  readonly openTeammate: (sessionId: SessionId, childSessionId: SessionId) => void
  /**
   * Re-read the Lead's projections from the Host; the board follows the push.
   * @param sessionId - the conversation the page is attached to.
   */
  readonly refresh: (sessionId: SessionId) => void
  /**
   * Create one shared task on the person's behalf.
   * @param sessionId - the conversation the page is attached to.
   * @param fields - the create form's normalized fields.
   */
  readonly createTask: (sessionId: SessionId, fields: TeamTaskFormFields) => void
  /**
   * Edit one task's subject, description, and write scopes, then — when the
   * dependency set changed — commit the new blockers as a second write. Each
   * list field rides only when it differs from the drawn task, so clearing a
   * list reaches the wire as an empty set instead of an omission.
   * @param sessionId - the conversation the page is attached to.
   * @param task - the task as the edit form drew it.
   * @param fields - the edit form's normalized fields.
   */
  readonly editTask: (sessionId: SessionId, task: TeamTask, fields: TeamTaskFormFields) => void
  /**
   * Commit one button transition: complete, reopen, or delete.
   * @param sessionId - the conversation the page is attached to.
   * @param task - the task as the card drew it.
   * @param action - the transition.
   */
  readonly transitionTask: (sessionId: SessionId, task: TeamTask, action: 'complete' | 'reopen' | 'delete') => void
  /**
   * Reassign one task, or release it to unowned with an undefined owner.
   * @param sessionId - the conversation the page is attached to.
   * @param task - the task as the card drew it.
   * @param owner - the assignee's durable member name, or undefined to release.
   */
  readonly reassignTask: (sessionId: SessionId, task: TeamTask, owner: string | undefined) => void
}

/** The browser services the face performs: writes, projection refresh, and roster navigation. */
export interface TeamWriteDeps {
  /** The generated `agentTeams` write namespace. */
  readonly writer: TeamWriter
  /** Re-read one Session's projections from the Host. */
  readonly refreshProjections: (sessionId: SessionId) => Promise<void>
  /** The conversation Session owning a viewed Session's Team. */
  readonly leadSessionId: (sessionId: SessionId) => SessionId
  /** How many main views retain one conversation; zero means it may navigate. */
  readonly mainViewCount: (sessionId: SessionId) => number
  /** Open one conversation as the current view. */
  readonly openSession: (target: SessionTarget) => void
}

/**
 * Bind the roster-opening action shared by the page and the popover.
 * @param deps - the navigation the action performs.
 * @returns the open action.
 */
export function teamOpenTeammate(
  deps: Pick<TeamWriteDeps, 'leadSessionId' | 'mainViewCount' | 'openSession'>,
): (sessionId: SessionId, childSessionId: SessionId) => void {
  return (sessionId, childSessionId) => {
    const parentSessionId = deps.leadSessionId(sessionId)
    if (deps.mainViewCount(sessionId) === 0) return
    if (childSessionId === parentSessionId) {
      deps.openSession(parentSessionId)
      return
    }
    deps.openSession({ parentSessionId, childSessionId, mode: 'continuable' })
  }
}

/**
 * Bind the page's face to one set of browser services.
 * @param deps - the writes, refresh, and navigation the face performs.
 * @returns the Slot `inject` factory: session and bound actions in, face out.
 */
export function teamWritesFace(
  deps: TeamWriteDeps,
): (sessionId: SessionId, actions: BoundActions<ReturnType<typeof createTeamPageStore>>) => TeamPageInjected {
  const { writer, leadSessionId } = deps
  const openTeammate = teamOpenTeammate(deps)
  return (sessionId, actions) => {
    const lead = leadSessionId(sessionId)
    /** Start one write when the Session is idle and route its settlement into the store. */
    const write = (run: () => Promise<RemoteResult<unknown>>): void => {
      actions.busy()
      void run().then((result) => {
        if (result.ok) {
          actions.settled()
          return
        }
        if (result.error.code === 'agent-team/stale-revision') {
          actions.conflict()
          void deps.refreshProjections(lead)
          return
        }
        actions.rejected(result.error.message)
      })
    }
    return {
      openTeammate,
      refresh(sessionId) {
        void deps.refreshProjections(leadSessionId(sessionId))
      },
      createTask(_, fields) {
        write(() => writer.createTask(lead, {
          subject: fields.subject,
          description: fields.description,
          ...(fields.blockers.length > 0 ? { blockedBy: fields.blockers } : {}),
          ...(fields.writeScopes.length > 0 ? { writeScopes: fields.writeScopes } : {}),
        }))
      },
      editTask(_, task, fields) {
        write(async () => {
          const first = await writer.updateTask(lead, {
            taskId: task.id,
            expectedRevision: task.revision,
            action: 'edit',
            subject: fields.subject,
            description: fields.description,
            ...(sameTeamSet(fields.writeScopes, task.writeScopes)
              ? {}
              : { writeScopes: fields.writeScopes }),
          })
          if (!first.ok) return first
          if (sameTeamSet(fields.blockers, task.blockedBy)) return first
          return await writer.updateTask(lead, {
            taskId: first.value.id,
            expectedRevision: first.value.revision,
            action: 'set_dependencies',
            blockedBy: fields.blockers,
          })
        })
      },
      transitionTask(_, task, action) {
        write(() => writer.updateTask(lead, {
          taskId: task.id,
          expectedRevision: task.revision,
          action,
        }))
      },
      reassignTask(_, task, owner) {
        write(() => writer.updateTask(lead, {
          taskId: task.id,
          expectedRevision: task.revision,
          action: 'reassign',
          ...(owner === undefined ? {} : { owner }),
        }))
      },
    }
  }
}
