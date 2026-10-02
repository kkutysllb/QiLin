/**
 * The sidechat panel body: the thread roster on the left rail, the open
 * thread's transcript, and the composer. Everything arrives through the
 * derived props shares; the body writes nothing directly.
 */
import { useEffect, useState, type ReactNode } from 'react'
import clsx from 'clsx'
import type { InjectFace, PropsLocale, PropsRuntime } from '@qilin/client-ui-slots'
import type { SidechatInjected } from './face.ts'
import type { SidechatTranscriptEntry } from './sidechat-model.ts'
import { NS } from './locales.ts'
import styles from './SidechatBody.module.css'

/** The body's composed props: the tab it draws, its face, and its copy. */
export type SidechatBodyProps =
  & PropsRuntime<'sidebar.right.pane.tab'>
  & InjectFace<SidechatInjected>
  & PropsLocale<typeof NS>

/** One transcript row's accent class, by entry kind. */
const ENTRY_CLASS: Record<SidechatTranscriptEntry['kind'], string | undefined> = {
  user: styles.user,
  boundary: styles.boundary,
  assistant: styles.assistant,
}

/**
 * The panel body.
 * @param props - the runtime share (sessionId, useSidechat), the injected face, and the copy.
 * @returns the roster rail and the transcript pane, or the empty line.
 */
export function SidechatBody({
  sessionId, useSidechat, refresh, start, send, cancel, release, openTranscript, t,
}: SidechatBodyProps): ReactNode {
  const state = useSidechat(snapshot => snapshot)
  const [draft, setDraft] = useState('')
  const selected = state.threads.find(row => row.id === state.selectedId)
  const entries = state.selectedId === undefined ? [] : state.entries[state.selectedId] ?? []

  // The roster is the panel's own read; the transcript follows the selection.
  useEffect(() => { void refresh(sessionId) }, [refresh, sessionId])


  const submit = (): void => {
    const text = draft.trim()
    if (text.length === 0 || state.selectedId === undefined || state.busy) return
    setDraft('')
    void send(sessionId, state.selectedId, text)
  }

  if (state.phase === 'failed') {
    return <p className={clsx(styles.panel, styles.failed)}>{t('threads.failed')}</p>
  }

  return (
    <div className={styles.panel}>
      <section className={styles.rail} aria-label={t('threads.title')}>
        <button
          type='button'
          className={styles.newThread}
          disabled={state.busy}
          onClick={() => { void start(sessionId) }}
        >
          {state.busy ? t('threads.starting') : t('threads.new')}
        </button>
        {state.threads.length === 0
          ? <p className={styles.railEmpty}>{t('threads.empty')}</p>
          : (
            <ul className={styles.threadList}>
              {state.threads.map(row => (
                <li key={row.id}>
                  <button
                    type='button'
                    className={clsx(styles.threadRow, row.id === state.selectedId && styles.selected)}
                    aria-label={t('thread.open')}
                    onClick={() => openTranscript(sessionId, row.id)}
                  >
                    <span className={styles.threadLabel}>{row.label}</span>
                    <span className={clsx(styles.threadState, row.running && styles.running)}>
                      {row.running ? t('thread.running') : row.live ? t('thread.live') : ''}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
      </section>
      <section className={styles.transcript} aria-label={t('threads.title')}>
        {selected === undefined
          ? <p className={styles.transcriptEmpty}>{t('panel.empty')}</p>
          : (
            <>
              <div className={styles.entries}>
                {entries.map(entry => (
                  <p key={entry.seq} className={clsx(styles.entry, ENTRY_CLASS[entry.kind])}>
                    {entry.kind === 'boundary' ? `${t('entry.boundary')}\n${entry.text}` : entry.text}
                  </p>
                ))}
              </div>
              <div className={styles.composer}>
                <textarea
                  className={styles.input}
                  value={draft}
                  placeholder={t('prompt.placeholder')}
                  onChange={(event) => { setDraft(event.target.value) }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault()
                      submit()
                    }
                  }}
                />
                <div className={styles.composerActions}>
                  {selected.running
                    ? (
                      <button type='button' className={styles.secondary} onClick={() => { void cancel(selected.id) }}>
                        {t('thread.cancel')}
                      </button>
                    )
                    : (
                      <button type='button' className={styles.secondary} onClick={() => { void release(sessionId, selected.id) }}>
                        {t('thread.release')}
                      </button>
                    )}
                  <button
                    type='button'
                    className={styles.primary}
                    disabled={state.busy || draft.trim().length === 0}
                    onClick={submit}
                  >
                    {state.busy ? t('prompt.sending') : t('prompt.send')}
                  </button>
                </div>
              </div>
            </>
          )}
      </section>
    </div>
  )
}
