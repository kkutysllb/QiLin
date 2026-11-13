import { describe, expect, it } from 'vitest'
import {
  agentAddress, isAgentName, joinAgentPath, parentAgentPath, ROOT_AGENT_NAME,
} from '../src/names.ts'

describe('agent names', () => {
  it('accepts 1-32 lower-case segments starting with a letter', () => {
    for (const name of ['a', 'agent-1', 'ui-review', 'a'.repeat(32)]) expect(isAgentName(name)).toBe(true)
    for (const name of ['', 'Lead', '1agent', 'agent_1', 'a'.repeat(33), ROOT_AGENT_NAME]) {
      expect(isAgentName(name)).toBe(false)
    }
  })

  it('joins a child name onto the creator path', () => {
    expect(joinAgentPath('', 'reviewer')).toBe('reviewer')
    expect(joinAgentPath('reviewer', 'checker')).toBe('reviewer/checker')
    expect(joinAgentPath(undefined, 'reviewer')).toBeUndefined()
    expect(joinAgentPath('reviewer', undefined)).toBeUndefined()
  })

  it('addresses the root as lead and unnamed members by session id', () => {
    expect(agentAddress('', 'session-1')).toBe(ROOT_AGENT_NAME)
    expect(agentAddress('reviewer/checker', 'session-1')).toBe('reviewer/checker')
    expect(agentAddress(undefined, 'session-1')).toBe('session-1')
  })

  it('removes the last segment from a descendant path', () => {
    expect(parentAgentPath('reviewer')).toBe('')
    expect(parentAgentPath('reviewer/checker')).toBe('reviewer')
    expect(parentAgentPath('a/b/c')).toBe('a/b')
  })
})
