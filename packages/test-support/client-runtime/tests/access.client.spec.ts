import { expect, it } from 'vitest'
import { SessionId } from '@qilin-agent/session/types'
import { allowAllAccess } from '../src/index.ts'

it('allows every remote action for hand-built component props', () => {
  expect(allowAllAccess.useRemoteAccess('goals/create')).toBe(true)
})

it('allows every Session action for both Session seats', () => {
  expect(allowAllAccess.useSessionAccess(SessionId('s1'), 'schedule/list')).toBe(true)
  expect(allowAllAccess.useAccess('schedule/list')).toBe(true)
})
