import { expect, it } from 'vitest'
import { allowAllAccess } from '../src/index.ts'

it('allows every remote action for hand-built component props', () => {
  expect(allowAllAccess.useRemoteAccess('goals/create')).toBe(true)
})
