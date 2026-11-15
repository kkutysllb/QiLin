/** The workspace model manager: deployed models as cards with an availability switch. */

import { useEffect } from 'react'
import type { ReactNode } from 'react'
import type { SnapshotStore } from '@qilin-agent/client-store'
import type { ModelCatalogModel } from '@qilin-agent/api-session-controller/types'
import type { InjectFace } from '@qilin-agent/client-ui-slots'
import { Switch } from '@qilin-agent/client-ui-primitives'
import type { ModelCatalogState } from './catalog.ts'
import { modelAvailabilityKey } from './availability.ts'
import type { ModelKey } from './locales.ts'
import css from './ModelManagerPage.module.css'

/** Injected dependencies of the model manager page. */
export interface ModelManagerInjected {
  /** Load the shared Host-generation catalog; safe to call repeatedly. */
  load: () => void
  /** Switch one advertised model on or off for every selector. */
  setEnabled: (provider: string, model: string, enabled: boolean) => void
  hooks: {
    /** Shared catalog lifecycle from `ctx.modelDirectories`. */
    catalog: SnapshotStore<ModelCatalogState>
    /** Persisted disabled pair keys. */
    availability: SnapshotStore<readonly string[]>
  }
  /** Page copy. */
  t: (key: ModelKey) => string
}

/** Props the renderer binds for the page: its inject face plus the main owner share. */
export type ModelManagerPageProps = InjectFace<ModelManagerInjected>

/** Fill the placeholders one copy line carries. */
function fill(copy: string, params: Readonly<Record<string, string>>): string {
  return Object.entries(params).reduce(
    (text, [key, value]) => text.replaceAll('{' + key + '}', value),
    copy,
  )
}

/** Spell a token capacity compactly without dropping its order of magnitude. */
function contextValue(value: number | undefined, unknown: string): string {
  if (value === undefined || !Number.isFinite(value) || value <= 0) return unknown
  if (value >= 1_000_000) return `${String(Number((value / 1_000_000).toFixed(1)))}M`
  if (value >= 1_000) return `${String(Math.round(value / 1_000))}K`
  return String(value)
}

/** Render one model card's input capability line. */
function inputValue(model: ModelCatalogModel, t: ModelManagerInjected['t']): string {
  if (model.inputModalities === undefined) return t('manager.unknown')
  if (model.inputModalities.length === 0) return t('manager.none')
  return model.inputModalities.map(modality => modality === 'text'
    ? t('manager.modality.text')
    : t('manager.modality.image')).join(' · ')
}

/**
 * Render the workspace model manager.
 * @param props - composed main-panel props carrying the shared catalog and availability.
 * @returns the model manager page.
 */
export function ModelManagerPage({
  useCatalog, useAvailability, load, setEnabled, t,
}: ModelManagerPageProps): ReactNode {
  const catalog = useCatalog(state => state)
  const disabled = useAvailability(keys => keys)
  useEffect(() => { load() }, [load])
  const value = catalog.value
  const disabledSet = new Set(disabled)
  const failures = value?.failures ?? []
  const groups = value?.groups ?? []
  const loading = catalog.status === 'loading' || catalog.status === 'idle'
  const empty = catalog.status === 'ready' && groups.length === 0 && failures.length === 0
  return (
    <div className={css.page}>
      <div className={css.column}>
        <header className={css.header}>
          <h1 className={css.title}>{t('manager.title')}</h1>
          <p className={css.intro}>{t('manager.intro')}</p>
        </header>

        {catalog.error !== null ? (
          <div className={css.error} role="alert">
            <span>{fill(t('manager.loadError'), { message: catalog.error })}</span>
            <button type="button" className={css.retry} onClick={() => { load() }}>{t('manager.retry')}</button>
          </div>
        ) : null}
        {loading && value === null ? <p className={css.status}>{t('status.loading')}</p> : null}
        {failures.map(failure => (
          <p className={css.failure} key={failure.id}>
            {fill(t('manager.failure'), { name: failure.name, message: failure.message })}
          </p>
        ))}
        {empty ? <p className={css.status}>{t('manager.empty')}</p> : null}

        {groups.map(group => (
          <section className={css.group} key={group.id} aria-labelledby={`model-manager-${group.id}`}>
            <div className={css.groupHead}>
              <h2 className={css.groupTitle} id={`model-manager-${group.id}`}>{group.name}</h2>
              <span className={css.providerId}>{group.id}</span>
            </div>
            <div className={css.cards}>
              {group.models.map((model) => {
                const enabled = !disabledSet.has(modelAvailabilityKey(group.id, model.id))
                return (
                  <article
                    className={enabled ? css.card : `${css.card} ${css.cardDisabled}`}
                    key={model.id}
                    data-model-enabled={enabled ? 'true' : 'false'}
                  >
                    <div className={css.cardTop}>
                      <span className={css.provider}>{t('manager.provider')} · {group.name}</span>
                      <Switch
                        checked={enabled}
                        label={fill(t('manager.toggle'), { model: model.name })}
                        onChange={(checked) => { setEnabled(group.id, model.id, checked) }}
                      />
                    </div>
                    <h3 className={css.modelName}>{model.name}</h3>
                    <code className={css.modelId}>{model.id}</code>
                    {model.description === undefined ? null : <p className={css.description}>{model.description}</p>}
                    <dl className={css.facts}>
                      <div className={css.fact}>
                        <dt className={css.factLabel}>{t('manager.context')}</dt>
                        <dd className={css.factValue}>{contextValue(model.contextWindow, t('manager.unknown'))}</dd>
                      </div>
                      <div className={css.fact}>
                        <dt className={css.factLabel}>{t('manager.inputs')}</dt>
                        <dd className={css.factValue}>{inputValue(model, t)}</dd>
                      </div>
                    </dl>
                    {enabled ? null : <span className={css.disabledTag}>{t('manager.disabled')}</span>}
                  </article>
                )
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}
