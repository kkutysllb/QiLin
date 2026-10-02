/** Pure Team-page arithmetic: copy keys, dot states, and the draft rules. */
import { describe, expect, it } from 'vitest'
import type { TeamTaskId, TeamTaskView as TeamTask } from '@qilin/experimental-agent-team/client'
import {
  emptyTeamDraft,
  isTeamDraftCommittable,
  memberDotState,
  memberStatusKey,
  sameTeamSet,
  statusKey,
  taskDotState,
  teamDraftOf,
  teamFormFieldsOf,
  teamItems,
} from '../src/client/team-model.ts'

const TASK_ID = 'task-1' as TeamTaskId

function task(overrides: Partial<TeamTask> = {}): TeamTask {
  return {
    id: TASK_ID,
    revision: 1,
    subject: 'Implement runtime',
    description: 'Build the Team runtime',
    status: 'in_progress',

    blockedBy: [],
    writeScopes: [],
    ready: true,
    writeScopeWarnings: [],
    ...overrides,
  }
}

describe('statusKey', () => {
  it('names each status from the dictionary', () => {
    expect(statusKey('pending')).toBe('status.pending')
    expect(statusKey('in_progress')).toBe('status.in_progress')
    expect(statusKey('completed')).toBe('status.completed')
    expect(statusKey('deleted')).toBe('status.completed')
  })
})

describe('memberStatusKey', () => {
  it('names each member status from the dictionary', () => {
    expect(memberStatusKey('running')).toBe('memberStatus.running')
    expect(memberStatusKey('inactive')).toBe('memberStatus.inactive')
    expect(memberStatusKey('provisioning')).toBe('memberStatus.provisioning')
    expect(memberStatusKey('failed')).toBe('memberStatus.failed')
  })
})

describe('memberDotState', () => {
  it('runs live and preparing members as ongoing and failures as errors', () => {
    expect(memberDotState('running')).toBe('ongoing')
    expect(memberDotState('provisioning')).toBe('ongoing')
    expect(memberDotState('failed')).toBe('error')
  })
})

describe('taskDotState', () => {
  it('warns on blocked pending tasks and settles finished ones', () => {
    expect(taskDotState(task({ status: 'pending', ready: true }))).toBe('idle')
    expect(taskDotState(task({ status: 'pending', ready: false }))).toBe('warning')
    expect(taskDotState(task({ status: 'in_progress' }))).toBe('ongoing')
    expect(taskDotState(task({ status: 'completed' }))).toBe('done')
    expect(taskDotState(task({ status: 'deleted' }))).toBe('idle')
  })
})

describe('drafts', () => {
  it('starts empty and pre-fills from one task', () => {
    expect(emptyTeamDraft()).toEqual({ subject: '', description: '', blockers: '', scopes: '' })
    expect(teamDraftOf(task({ blockedBy: [TASK_ID], writeScopes: ['src'] }))).toEqual({
      subject: 'Implement runtime',
      description: 'Build the Team runtime',
      blockers: 'task-1',
      scopes: 'src',
    })
  })

  it('commits only with a subject and a description', () => {
    expect(isTeamDraftCommittable({ subject: ' x ', description: 'y', blockers: '', scopes: '' })).toBe(true)
    expect(isTeamDraftCommittable({ subject: ' ', description: 'y', blockers: '', scopes: '' })).toBe(false)
    expect(isTeamDraftCommittable({ subject: 'x', description: '', blockers: '', scopes: '' })).toBe(false)
  })

  it('normalizes one draft into the wire fields', () => {
    expect(teamFormFieldsOf({
      subject: ' x ', description: ' y ', blockers: ' b, a , b ,, ', scopes: ' src ,, src , docs ',
    })).toEqual({
      subject: 'x',
      description: 'y',
      blockers: ['b', 'a'],
      writeScopes: ['src', 'docs'],
    })
  })
})

describe('teamItems', () => {
  it('splits, trims, and de-duplicates in first-occurrence order', () => {
    expect(teamItems('b, a , b ,, c')).toEqual(['b', 'a', 'c'])
    expect(teamItems('  ')).toEqual([])
  })
})

describe('sameTeamSet', () => {
  it('ignores order and distinguishes different sets', () => {
    expect(sameTeamSet(['a', 'b'], ['b', 'a'])).toBe(true)
    expect(sameTeamSet(['a'], ['a', 'a'])).toBe(false)
    expect(sameTeamSet(['a', 'b'], ['a', 'c'])).toBe(false)
  })
})
