/** Read-only review comments the code host holds on a change request's lines. */

import type { ReactNode } from 'react'
import { Tag } from '@qilin-agent/client-ui-primitives'
import type { PropsLocale } from '@qilin-agent/client-ui-slots'
import type { ForgeReviewThread } from '@qilin-agent/experimental-forge/types'
import type { NS } from './locales.ts'
import css from './ReviewComposer.module.css'

/**
 * Render one host review thread at its lines, without local editing controls.
 * @param props - the thread, the layout it sits in, and localized copy.
 * @returns one compact read-only comment card.
 */
export function RemoteThread({ thread, split, t }: PropsLocale<typeof NS> & {
  readonly thread: ForgeReviewThread
  readonly split: boolean
}): ReactNode {
  const range = `${thread.side}${thread.startLine}${thread.endLine === thread.startLine ? '' : `–${thread.endLine}`}`
  return <section className={css.thread} data-forge-remote-thread={thread.id} data-side={thread.side}
    data-split={split ? '' : undefined} data-resolved={thread.resolved ? '' : undefined}
    aria-label={t('review.range', { range })}>
    <div className={css.threadHeader}>
      <span className={css.author}>{thread.author ?? t('review.remoteAuthor')}</span>
      <span className={css.range}>{range}</span>
      {thread.resolved
        ? <Tag tone="neutral">{t('review.resolved')}</Tag>
        : thread.outdated ? <Tag tone="neutral">{t('review.outdated')}</Tag> : null}
    </div>
    <div className={css.commentBody}>{thread.body}</div>
  </section>
}
