/**
 * MCP servers settings page: the servers the user patch layer declares, the
 * recommended set this deployment offers, and one editor card at a time. The
 * page writes only through the store, so every visible fact comes from the
 * last snapshot the Host answered with.
 */

import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Button, Input, Switch, Tag } from '@qilin/client-ui-primitives'
import type { InjectFace, PropsRuntime } from '@qilin/client-ui-slots'
import type { McpServerDraft, McpServerView } from '@qilin/mcp-servers/types'
import type { McpServersStore } from './store.ts'
import type { en } from './locales.ts'
import styles from './McpSection.module.css'

/** Injected dependencies of {@link McpSection} (slot inject). */
export interface McpSectionInjected {
  /** The page store (loaded on mount, mutated through its methods). */
  controller: McpServersStore
  hooks: {
    /** Page snapshot bound by the UI renderer as useSnapshot. */
    snapshot: McpServersStore['store']
  }
  /** Page copy. */
  t: (key: keyof typeof en) => string
}

/** Props the renderer binds for this section. */
export type McpSectionProps = PropsRuntime<'settings.section'> & InjectFace<McpSectionInjected>

/** Which recommended definition owns which description key. */
const BUILTIN_COPY: Readonly<Record<string, keyof typeof en>> = {
  fetch: 'builtinFetch',
  context7: 'builtinContext7',
  'sequential-thinking': 'builtinSequentialThinking',
  playwright: 'builtinPlaywright',
}

/** One editor draft, as the strings the form binds to. */
interface Draft {
  /** Namespace being edited; null while adding, when the name stays editable. */
  readonly original: string | null
  readonly serverName: string
  readonly transport: 'stdio' | 'streamable-http'
  readonly command: string
  readonly args: string
  readonly cwd: string
  readonly url: string
  readonly failOnStartupError: boolean
}

/** The draft that edits one configured server. */
function draftOf(server: McpServerView): Draft {
  return {
    original: server.serverName,
    serverName: server.serverName,
    transport: server.transport,
    command: server.command,
    args: server.args.join('\n'),
    cwd: server.cwd,
    url: server.url,
    failOnStartupError: server.failOnStartupError,
  }
}

/** The draft an empty add form starts from. */
function emptyDraft(): Draft {
  return {
    original: null,
    serverName: '',
    transport: 'stdio',
    command: '',
    args: '',
    cwd: '',
    url: '',
    failOnStartupError: false,
  }
}

/** Fill the placeholders one copy line carries. */
function fill(copy: string, params: Readonly<Record<string, string>>): string {
  return Object.entries(params).reduce(
    (text, [key, value]) => text.replaceAll('{' + key + '}', value),
    copy,
  )
}

/** Fill the one placeholder a name-carrying action uses. */
function named(copy: string, name: string): string {
  return fill(copy, { name })
}

/** The argument lines the editor holds, one argument each, blank lines dropped. */
function argumentLines(text: string): readonly string[] {
  return text.split('\n').map(line => line.trim()).filter(line => line.length > 0)
}

/** The wire draft one editor draft submits. */
function toServerDraft(draft: Draft): McpServerDraft {
  const serverName = draft.serverName.trim()
  if (draft.transport === 'streamable-http') {
    return {
      serverName,
      transport: 'streamable-http',
      url: draft.url.trim(),
      failOnStartupError: draft.failOnStartupError,
    }
  }
  return {
    serverName,
    transport: 'stdio',
    command: draft.command.trim(),
    args: argumentLines(draft.args),
    cwd: draft.cwd.trim(),
    failOnStartupError: draft.failOnStartupError,
  }
}

/** The MCP servers page body. */
export function McpSection({ controller, useSnapshot, t }: McpSectionProps): ReactNode {
  const state = useSnapshot(snapshot => snapshot)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [confirming, setConfirming] = useState<string | null>(null)

  useEffect(() => { void controller.load() }, [controller])

  const pageBusy = state.busy !== null
  const broken = state.layerError !== null

  /**
   * Submit the open editor and close it only once the write landed.
   * @param current - the draft the open form holds.
   * @returns nothing; a refused draft keeps its editor open with the message.
   */
  const submit = async (current: Draft): Promise<void> => {
    if (await controller.save(toServerDraft(current))) setDraft(null)
  }

  return (
    <section className={styles.page} aria-label={t('title')}>
      <header className={styles.header}>
        <h2 className={styles.title}>{t('title')}</h2>
        <p className={styles.intro}>{t('intro')}</p>
      </header>

      {state.error !== null && (
        <div className={styles.error} role="alert">
          <span className={styles.errorTitle}>{t('errorTitle')}</span>
          <span className={styles.errorDetail}>{state.error}</span>
          <Button variant="outline" onClick={() => { void controller.load() }}>{t('retry')}</Button>
        </div>
      )}

      {broken && (
        <div className={styles.notice} role="status">
          <p className={styles.noticeText}>{t('layerBroken')}</p>
          <p className={styles.noticeReason}>{state.layerError}</p>
          <p className={styles.path}>{t('patchFile')}: {state.patchPath}</p>
        </div>
      )}

      <h3 className={styles.groupTitle}>{t('configured')}</h3>
      {state.servers.length === 0
        ? <p className={styles.empty}>{t('configuredEmpty')}</p>
        : (
          <ul className={styles.list}>
            {state.servers.map((server) => {
              const toggled = named(server.enabled ? t('disableNamed') : t('enableNamed'), server.serverName)
              return (
                <li key={server.serverName} className={styles.row}>
                  <div className={styles.rowMain}>
                    <div className={styles.rowTitle}>
                      <span className={styles.name}>{server.serverName}</span>
                      <Tag>{t(server.transport === 'stdio' ? 'transportStdio' : 'transportHttp')}</Tag>
                      {server.builtin !== null && <Tag>{t('badge')}</Tag>}
                    </div>
                    <span className={styles.detail}>{server.detail}</span>
                  </div>
                  <Switch
                    checked={server.enabled}
                    label={toggled}
                    disabled={pageBusy || broken}
                    onChange={(next: boolean) => { void controller.setEnabled(server.serverName, next) }}
                  />
                  <Button
                    variant="ghost"
                    aria-label={named(t('editNamed'), server.serverName)}
                    disabled={pageBusy || broken}
                    onClick={() => { setDraft(draftOf(server)); setConfirming(null) }}
                  >
                    {t('edit')}
                  </Button>
                  {confirming === server.serverName
                    ? (
                      <div className={styles.confirm} role="group" aria-label={named(t('deleteQuestion'), server.serverName)}>
                        <span>{named(t('deleteQuestion'), server.serverName)}</span>
                        <Button variant="outline" onClick={() => { setConfirming(null) }}>{t('cancel')}</Button>
                        <Button
                          variant="primary"
                          onClick={() => { setConfirming(null); void controller.remove(server.serverName) }}
                        >
                          {t('confirmDelete')}
                        </Button>
                      </div>
                    )
                    : (
                      <Button
                        variant="ghost"
                        aria-label={named(t('deleteNamed'), server.serverName)}
                        disabled={pageBusy || broken}
                        onClick={() => { setConfirming(server.serverName) }}
                      >
                        {t('delete')}
                      </Button>
                    )}
                </li>
              )
            })}
          </ul>
        )}

      <h3 className={styles.groupTitle}>{t('recommended')}</h3>
      <p className={styles.hint}>{t('recommendedHint')}</p>
      <ul className={styles.list}>
        {state.builtins.map((builtin) => {
          const copyKey = BUILTIN_COPY[builtin.id]
          const configured = state.servers.some(server => server.serverName === builtin.name)
          return (
            <li key={builtin.id} className={styles.row}>
              <div className={styles.rowMain}>
                <div className={styles.rowTitle}>
                  <span className={styles.name}>{builtin.name}</span>
                  {!builtin.available && <Tag>{fill(t('unavailable'), { command: builtin.command })}</Tag>}
                </div>
                <span className={styles.detail}>{[builtin.command, ...builtin.args].join(' ')}</span>
                {copyKey !== undefined && <span className={styles.hint}>{t(copyKey)}</span>}
              </div>
              <Button
                variant="outline"
                disabled={configured || !builtin.available || pageBusy || broken}
                onClick={() => { void controller.addBuiltin(builtin.id) }}
              >
                {state.busy === builtin.id ? t('adding') : named(t('addNamed'), builtin.name)}
              </Button>
            </li>
          )
        })}
      </ul>

      {draft === null
        ? (
          <Button
            variant="primary"
            disabled={pageBusy || broken}
            onClick={() => { setDraft(emptyDraft()) }}
          >
            {t('addServer')}
          </Button>
        )
        : (
          <form
            className={styles.editor}
            aria-label={draft.original === null ? t('newServer') : t('editServer')}
            onSubmit={(event) => { event.preventDefault(); void submit(draft) }}
          >
            <h3 className={styles.groupTitle}>
              {draft.original === null ? t('newServer') : t('editServer')}
            </h3>
            <div className={styles.field}>
              <span className={styles.fieldLabel}>{t('serverName')}</span>
              <Input
                aria-label={t('serverName')}
                value={draft.serverName}
                disabled={draft.original !== null}
                onChange={(event) => { setDraft({ ...draft, serverName: event.target.value }) }}
              />
              <span className={styles.hint}>
                {draft.original === null ? t('serverNameHint') : t('serverNameLocked')}
              </span>
            </div>
            <div className={styles.field}>
              <span className={styles.fieldLabel}>{t('transport')}</span>
              <select
                aria-label={t('transport')}
                className={styles.select}
                value={draft.transport}
                onChange={(event) => {
                  const chosen = event.target.value === 'streamable-http' ? 'streamable-http' : 'stdio'
                  setDraft({ ...draft, transport: chosen })
                }}
              >
                <option value="stdio">{t('transportStdio')}</option>
                <option value="streamable-http">{t('transportHttp')}</option>
              </select>
            </div>
            {draft.transport === 'stdio'
              ? (
                <>
                  <div className={styles.field}>
                    <span className={styles.fieldLabel}>{t('command')}</span>
                    <Input
                      aria-label={t('command')}
                      value={draft.command}
                      onChange={(event) => { setDraft({ ...draft, command: event.target.value }) }}
                    />
                    <span className={styles.hint}>{t('commandHint')}</span>
                  </div>
                  <div className={styles.field}>
                    <span className={styles.fieldLabel}>{t('args')}</span>
                    <textarea
                      aria-label={t('args')}
                      className={styles.textarea}
                      value={draft.args}
                      onChange={(event) => { setDraft({ ...draft, args: event.target.value }) }}
                    />
                    <span className={styles.hint}>{t('argsHint')}</span>
                  </div>
                  <div className={styles.field}>
                    <span className={styles.fieldLabel}>{t('cwd')}</span>
                    <Input
                      aria-label={t('cwd')}
                      value={draft.cwd}
                      onChange={(event) => { setDraft({ ...draft, cwd: event.target.value }) }}
                    />
                    <span className={styles.hint}>{t('cwdHint')}</span>
                  </div>
                </>
              )
              : (
                <div className={styles.field}>
                  <span className={styles.fieldLabel}>{t('url')}</span>
                  <Input
                    aria-label={t('url')}
                    value={draft.url}
                    onChange={(event) => { setDraft({ ...draft, url: event.target.value }) }}
                  />
                </div>
              )}
            <label className={styles.checkbox}>
              <input
                type="checkbox"
                checked={draft.failOnStartupError}
                onChange={(event) => { setDraft({ ...draft, failOnStartupError: event.target.checked }) }}
              />
              <span>{t('failOnStartupError')}</span>
            </label>
            <div className={styles.actions}>
              <Button variant="outline" onClick={() => { setDraft(null) }}>{t('cancel')}</Button>
              <Button variant="primary" type="submit" disabled={pageBusy}>
                {state.busy !== null ? t('saving') : t('save')}
              </Button>
            </div>
          </form>
        )}
    </section>
  )
}
