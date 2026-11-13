/** Per-Lead transaction queue ownership. */
import { expect, it } from 'vitest'
import type { Context } from '@qilin-agent/kylin'
import { SessionId } from '@qilin-agent/session'
import { TeamJournal } from '../src/journal.ts'

it('keeps a newer queue tail when an earlier transaction settles', async () => {
  const journal = new TeamJournal({} as Context, () => {})
  const rootId = SessionId('journal-root')
  const entered = Promise.withResolvers<undefined>()
  const release = Promise.withResolvers<undefined>()
  const order: string[] = []
  const first = journal.transact(rootId, async () => {
    entered.resolve(undefined)
    await release.promise
    order.push('first')
  })
  await entered.promise
  // The second transaction replaces the queued tail before the first settles,
  // so the first must not delete the queue entry it no longer owns.
  const second = journal.transact(rootId, async () => {
    order.push('second')
  })
  release.resolve(undefined)
  await first
  await second
  expect(order).toEqual(['first', 'second'])
})
