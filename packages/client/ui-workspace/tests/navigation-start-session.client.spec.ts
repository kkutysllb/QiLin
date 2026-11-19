/** Regression specs for the New Session flow's Workspace targeting. */
import { describe, expect, it } from 'vitest'
import type { SessionListState } from '@qilin-agent/api-session-controller/client'
import { SessionId } from '@qilin-agent/session'
import type { WorkspaceId, WorkspaceView } from '@qilin-agent/api-workspace-controller/client'

import { startSessionTarget } from '../src/client/navigation.ts'

const wid = (id: string) => id as WorkspaceId

function workspace(
  id: string,
  sessionIds: string[],
  path = '/' + id,
): WorkspaceView {
  return {
    workspaceId: wid(id),
    path,
    kind: 'directory',
    title: id,
    sessionIds: sessionIds.map(SessionId),
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

function byId(...entries: { id: string; cwd?: string }[]): SessionListState['byId'] {
  const rows = entries.map(entry => ({
    id: SessionId(entry.id),
    displayTitle: entry.id,
    running: false,
    retainedBy: {},
    blank: true,
    updatedAt: 1,
    ...(entry.cwd === undefined ? {} : { cwd: entry.cwd }),
  }))
  return Object.fromEntries(rows.map(row => [row.id, row])) as SessionListState['byId']
}

describe('startSessionTarget', () => {
  it('prefers an explicit workspace', () => {
    expect(startSessionTarget(wid('a'), [workspace('a', [])], byId(), undefined, wid('b')))
      .toBe(wid('a'))
  })

  it('keeps the workspace that already accounts the current session', () => {
    expect(startSessionTarget(undefined, [workspace('a', ['s1'])], byId({ id: 's1' }), SessionId('s1'), undefined))
      .toBe(wid('a'))
  })

  it('anchors an unaccounted current session to the workspace owning its cwd', () => {
    // Regression: an ungrouped current session used to send the New Session
    // flow to the most recent workspace instead of the session's project.
    expect(startSessionTarget(
      undefined,
      [workspace('alpha', [], '/proj/alpha')],
      byId({ id: 'loose', cwd: '/proj/alpha' }),
      SessionId('loose'),
      wid('beta'),
    )).toBe(wid('alpha'))
  })

  it('falls back to the most recent workspace without a cwd match', () => {
    expect(startSessionTarget(
      undefined,
      [workspace('alpha', [], '/proj/alpha')],
      byId({ id: 'loose', cwd: '/other' }),
      SessionId('loose'),
      wid('beta'),
    )).toBe(wid('beta'))
  })
})
