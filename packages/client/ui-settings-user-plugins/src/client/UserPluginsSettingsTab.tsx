import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import type { CommunityPluginSnapshot, PluginManagerSnapshot, PluginMutationReceipt, PluginUpdateSnapshot } from '@qilin/api-remotes/client'
import { Button } from '@qilin/client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@qilin/client-ui-slots'
import type { UserPluginsLocaleKey } from './locales.ts'
import css from './UserPluginsSettingsTab.module.css'

export interface UserPluginsSettingsTabInjected {
  list: () => Promise<PluginManagerSnapshot>
  install: (spec: string) => Promise<PluginMutationReceipt>
  update: (name: string) => Promise<PluginMutationReceipt>
  remove: (name: string) => Promise<PluginMutationReceipt>
  checkUpdates: () => Promise<PluginUpdateSnapshot>
  catalog: (query: string, page: number) => Promise<CommunityPluginSnapshot>
}

export type UserPluginsSettingsTabProps = PropsRuntime<'settings.plugins.tab'>
  & PropsLocale<'settings.userPlugins'>
  & InjectFace<UserPluginsSettingsTabInjected>

type T = UserPluginsSettingsTabProps['t']

function text(t: T, key: UserPluginsLocaleKey, values?: Record<string, string | number>): string {
  return t(key, values)
}

/** Render profile plugin inventory and mutation controls. */
export function UserPluginsSettingsTab(
  { t, list, install, update, remove, checkUpdates, catalog }: UserPluginsSettingsTabProps,
): ReactNode {
  const [snapshot, setSnapshot] = useState<PluginManagerSnapshot | null>(null)
  const [updates, setUpdates] = useState<PluginUpdateSnapshot | null>(null)
  const [community, setCommunity] = useState<CommunityPluginSnapshot | null>(null)
  const [spec, setSpec] = useState('')
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [restart, setRestart] = useState(false)
  const [output, setOutput] = useState<readonly string[]>([])

  /** Failure text for the alert: the Remote's own reason, or the localized fallback. */
  const reason = (failure: unknown): string =>
    failure instanceof Error && failure.message !== '' ? failure.message : text(t, 'installFailed')

  const refresh = async (): Promise<void> => {
    try { setSnapshot(await list()); setError(null) } catch (failure) { setError(reason(failure)) }
  }
  useEffect(() => { void refresh() }, [list])

  const mutate = async (key: string, operation: () => Promise<PluginMutationReceipt>): Promise<void> => {
    setBusy(key); setError(null)
    try {
      const receipt = await operation()
      setRestart(receipt.restartRequired)
      setOutput(receipt.outputTail)
      await refresh()
    } catch (failure) { setError(reason(failure)) } finally { setBusy(null) }
  }
  const submitInstall = (event: FormEvent): void => {
    event.preventDefault()
    const value = spec.trim()
    if (value === '') return
    void mutate('install', async () => { const result = await install(value); setSpec(''); return result })
  }
  const runUpdateCheck = (): void => {
    setBusy('check')
    void checkUpdates().then(setUpdates, (failure: unknown) => { setError(reason(failure)) }).finally(() => { setBusy(null) })
  }
  const searchCommunity = (): void => {
    setBusy('search')
    void catalog(query, 1).then(setCommunity, (failure: unknown) => { setError(reason(failure)) }).finally(() => { setBusy(null) })
  }

  return <section className={css.page} aria-label={text(t, 'title')}>
    <header className={css.header}><h2 className={css.title}>{text(t, 'title')}</h2><div className={css.subtitle}>{text(t, 'subtitle')}</div></header>
    {restart ? <div className={css.notice} role="status">{text(t, 'restart')}</div> : null}
    {error === null ? null : <div className={css.status} role="alert"><span>{error}</span><Button variant="outline" onClick={() => { void refresh() }}>{text(t, 'retry')}</Button></div>}
    <section className={css.section} aria-labelledby="user-plugin-installed">
      <div className={css.sectionHeader}><h3 className={css.sectionTitle} id="user-plugin-installed">{text(t, 'installed')}</h3><Button variant="outline" disabled={busy !== null} onClick={runUpdateCheck}>{busy === 'check' ? text(t, 'checking') : text(t, 'checkUpdates')}</Button></div>
      {snapshot === null ? <div className={css.status}>{text(t, 'loading')}</div> : snapshot.entries.length === 0 ? <div className={css.status}>{text(t, 'empty')}</div> : snapshot.entries.map((entry) => {
        const updateInfo = updates?.entries.find(item => item.name === entry.name)
        return <div className={css.row} key={entry.name}><div className={css.name}>{entry.name}<div className={css.meta}>{entry.source === 'builtin' ? text(t, 'builtin') : text(t, 'user')} · {entry.version ?? text(t, 'versionUnknown')}{entry.updatable && updateInfo?.latestVersion !== undefined && updateInfo.latestVersion !== null && updateInfo.latestVersion !== entry.version ? ' → ' + updateInfo.latestVersion : ''}</div></div><div className={css.actions}><Button variant="outline" disabled={!entry.updatable || busy !== null} onClick={() => { void mutate('update:' + entry.name, () => update(entry.name)) }}>{busy === 'update:' + entry.name ? text(t, 'updating') : text(t, 'update')}</Button><Button variant="outline" disabled={!entry.removable || busy !== null} onClick={() => { void mutate('remove:' + entry.name, () => remove(entry.name)) }}>{busy === 'remove:' + entry.name ? text(t, 'uninstalling') : text(t, 'uninstall')}</Button></div></div>
      })}
    </section>
    <section className={css.section} aria-labelledby="user-plugin-install"><h3 className={css.sectionTitle} id="user-plugin-install">{text(t, 'installTitle')}</h3><form className={css.form} onSubmit={submitInstall}><input className={css.input} aria-label={text(t, 'packageSpec')} placeholder={text(t, 'packageSpec')} value={spec} onChange={(event) => { setSpec(event.target.value) }} /><Button variant="primary" type="submit" disabled={busy !== null || spec.trim() === ''}>{busy === 'install' ? text(t, 'installing') : text(t, 'install')}</Button></form></section>
    <section className={css.section} aria-labelledby="user-plugin-community"><div className={css.sectionHeader}><h3 className={css.sectionTitle} id="user-plugin-community">{text(t, 'community')}</h3></div><form className={css.form} onSubmit={(event) => { event.preventDefault(); searchCommunity() }}><input className={css.input} aria-label={text(t, 'communityQuery')} placeholder={text(t, 'communityQuery')} value={query} onChange={(event) => { setQuery(event.target.value) }} /><Button variant="outline" type="submit" disabled={busy !== null}>{busy === 'search' ? text(t, 'searching') : text(t, 'search')}</Button></form>{community === null ? null : community.entries.length === 0 ? <div className={css.status}>{text(t, 'noCommunity')}</div> : community.entries.map(item => <div className={css.communityRow} key={item.fullName}><div className={css.communityTop}><strong>{item.fullName}</strong><span className={css.meta}>{text(t, 'stars', { count: item.stars })}</span></div><div className={css.meta}>{item.description ?? ''}</div><Button variant="outline" disabled={busy !== null} onClick={() => { void mutate('install:' + item.fullName, () => install(item.fullName)) }}>{text(t, 'installCommunity')}</Button></div>)}</section>
    {output.length > 0 ? <section className={css.section} aria-label={text(t, 'output')}><h3 className={css.sectionTitle}>{text(t, 'output')}</h3><pre className={css.output}>{output.join('\n')}</pre></section> : null}
  </section>
}
