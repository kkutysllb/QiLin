import { expect, it } from 'vitest'
import { allowAllAccess } from '../src/index.ts'

it('spreads no access decision until the remote-access Client service is ported', () => {
  expect(Object.keys(allowAllAccess)).toEqual([])
})
