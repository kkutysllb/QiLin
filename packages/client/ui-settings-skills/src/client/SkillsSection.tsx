/**
 * Skills settings page: the catalog one Session's composition resolves, read
 * through the `skills` Remote and grouped by discovery source. The page owns
 * no mutations — a skill is enabled by being present in a discovered root.
 */

import { useEffect, useMemo } from 'react'
import type { ReactNode } from 'react'
import { Button, Tag } from '@qilin/client-ui-primitives'
import type { InjectFace, PropsRuntime } from '@qilin/client-ui-slots'
import type { SkillEntry } from '@qilin/api-remotes/client'
import type { SkillsStore } from './store.ts'
import type { en } from './locales.ts'
import styles from './SkillsSection.module.css'

/** Injected dependencies of {@link SkillsSection} (slot inject). */
export interface SkillsSectionInjected {
  /** The page store (loaded on mount and when the current Session changes). */
  controller: SkillsStore
  hooks: {
    /** Page snapshot bound by the UI renderer as useSnapshot. */
    snapshot: SkillsStore['store']
  }
  /** Page copy. */
  t: (key: keyof typeof en) => string
}

/** Props the renderer binds for this section. */
export type SkillsSectionProps = PropsRuntime<'settings.section'> & InjectFace<SkillsSectionInjected>

/** One rendered group: the dictionary key it shows and the sources it owns. */
interface SkillGroup {
  readonly id: string
  readonly labelKey: keyof typeof en
  readonly sources: readonly string[]
}

// Sources a deployment may add fall into the custom group rather than
// disappearing: the page reports what the composition resolved, not a
// whitelist of root names it happens to know.
const CUSTOM_GROUP: SkillGroup = { id: 'custom', labelKey: 'groupCustom', sources: ['custom'] }

const GROUPS: readonly SkillGroup[] = [
  { id: 'plugin', labelKey: 'groupPlugin', sources: ['runtime', 'bundled'] },
  { id: 'project', labelKey: 'groupProject', sources: ['project-qilin', 'project-agents'] },
  { id: 'user', labelKey: 'groupUser', sources: ['user-qilin', 'user-agents'] },
  CUSTOM_GROUP,
]

/** Bucket one skill into its display group. */
function groupOf(skill: SkillEntry): SkillGroup {
  return GROUPS.find(group => group.sources.includes(skill.source)) ?? CUSTOM_GROUP
}

/** The detail line: which root discovered the skill and which provider owns its body. */
function detailOf(skill: SkillEntry): string {
  return `${skill.source} · ${skill.provider}`
}

/**
 * Render the skills page.
 * @param props - composed slot props (inject face + the global Session hooks).
 * @returns the settings section body.
 */
export function SkillsSection(props: SkillsSectionProps): ReactNode {
  const { controller, useSnapshot, useSessions, t } = props
  const state = useSnapshot(snapshot => snapshot)
  // The catalog is the Session's own composition, so an unready Session list
  // reads as "no Session" rather than an error.
  const sessionId = useSessions(snapshot => snapshot.phase === 'ready' ? snapshot.current : undefined)

  useEffect(() => {
    void controller.load(sessionId)
  }, [controller, sessionId])

  const buckets = useMemo(() => GROUPS.map(group => ({
    group,
    skills: state.skills.filter(skill => groupOf(skill).id === group.id),
  })).filter(bucket => bucket.skills.length > 0), [state.skills])

  return (
    <section className={styles.page} aria-label={t('title')}>
      <div className={styles.header}>
        <h2 className={styles.title}>{t('title')}</h2>
        <p className={styles.intro}>{t('intro')}</p>
      </div>

      <div className={styles.toolbar}>
        <Button
          type="button"
          variant="outline"
          onClick={() => { void controller.load(sessionId) }}
          disabled={state.status === 'loading' || sessionId === undefined}
        >
          {state.status === 'loading' ? t('refreshing') : t('refresh')}
        </Button>
      </div>

      {state.error === null ? null : (
        <div className={styles.error} role="alert">
          <span className={styles.errorTitle}>{t('errorTitle')}</span>
          <span className={styles.errorDetail}>{state.error}</span>
        </div>
      )}

      {state.status === 'ready' && state.sessionId === null ? (
        <p className={styles.empty}>{t('noSession')}</p>
      ) : null}

      {state.status === 'ready' && state.sessionId !== null && state.skills.length === 0 ? (
        <p className={styles.empty}>{t('empty')}</p>
      ) : null}

      {buckets.map(bucket => (
        <div className={styles.group} key={bucket.group.id}>
          <h3 className={styles.groupTitle}>{t(bucket.group.labelKey)}</h3>
          <ul className={styles.list}>
            {bucket.skills.map(skill => (
              <li className={styles.row} key={skill.name}>
                <div className={styles.rowMain}>
                  <div className={styles.rowTitle}>
                    <span className={styles.name}>{skill.name}</span>
                    <Tag tone={skill.modelInvocable ? 'neutral' : 'quiet'}>
                      {skill.modelInvocable ? t('modelInvocable') : t('userOnly')}
                    </Tag>
                  </div>
                  <span className={styles.description}>{skill.description}</span>
                  {skill.whenToUse === undefined
                    ? null
                    : <span className={styles.whenToUse}>{skill.whenToUse}</span>}
                  <span className={styles.detail}>{detailOf(skill)}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  )
}
