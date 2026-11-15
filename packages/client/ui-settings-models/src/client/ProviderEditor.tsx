/**
 * One provider's editor card, hand-written per adapter family: the primary
 * field is a single write-only **API key** input (the page never asks for an
 * environment-variable name — a typed key stores through `credentials/set`
 * under the profile's reference, deriving `<ROUTE>_API_KEY` when the profile
 * has none. The pi-ai profile records that derivation as `apiKeyEnv` only when
 * a key is entered; a blank key materializes a reference-free profile for
 * provider-native authentication);
 * the collapsed 自定义设置 area carries the per-family extras (`baseURL` for
 * both families, DeepSeek's id/name/context-window model catalog, and the
 * display name and wire protocol of a pi-ai route the adapter does not ship —
 * the two fields the create card asked that route for, editable here for the
 * same reason).
 * There is deliberately no provider-scoped reasoning-effort control, here or
 * on the editor card: effort is a per-MODEL capability, and the models under
 * one provider disagree about it, so a provider-scoped control can only be set
 * to a value some of them reject. Each model row of a hand-declared route
 * declares its own `reasoningEfforts` instead, and the composer's model picker
 * offers each model those levels. Everything else stays
 * owned by `settings.yaml`. Profile edits land as minimal `settings.mutate`
 * path ops against the stored section — the card names only the fields it can
 * see instead of rebuilding the whole subtree from a partial descriptor.
 */

import { useEffect, useMemo, useReducer, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type {
  CredentialInfo, LlmNativeAuth, SettingsNamespaceView, SettingsPathOpView,
} from '@qilin-agent/api-remotes/client'
import {
  SecretInput, SettingsForm, SettingsFormModel, settingsTextField, Tooltip,
} from '@qilin-agent/client-ui-primitives'
import type {
  SettingsFormLabels, SettingsFormScope, SettingsFormShell,
} from '@qilin-agent/client-ui-primitives'
import {
  DeepSeekModelsEditor, modelDrafts, validateDeepSeekModels,
} from './DeepSeekModelsEditor.tsx'
import type { DeepSeekModelsValidationFailure } from './DeepSeekModelsEditor.tsx'
import { apiKeyFailure } from './apiKey.ts'
import { ModelListEditor } from './ModelListEditor.tsx'
import { validateReasoningEfforts } from './ModelReasoningEfforts.tsx'
import type { ReasoningEffortsFailure } from './ModelReasoningEfforts.tsx'
import { deriveKeyRef, protocolChoices, reasoningLevelChoices } from './store.ts'
import { protocolLabel } from './protocol-label.ts'
import type { ModelsOperations } from './operations.ts'
import type { SettingsSchemaOperations } from './schema-operations.ts'
import type { en } from './locales.ts'

import styles from './ModelsSection.module.css'

/** Per-adapter-family curated field sets (unknown namespaces get the hint alone). */
type EditorLayout = 'deepseek' | 'pi-ai' | 'unknown'



/** Props of {@link ProviderEditor}. */
export interface ProviderEditorProps {
  /** Provider route id. */
  provider: string
  /** Display name for the card title. */
  displayName: string
  /** Hide the title row (the add card renders its own provider select). */
  hideTitle?: boolean
  /**
   * Whether the adapter reports this route as hand-declared — absent from its
   * installed catalog. Such a route carries its own wire protocol, chosen when
   * it was created and editable here for the same reason; a catalog route's
   * models each carry theirs, so a route-level protocol there could only
   * override every one of them and the card does not offer it.
   */
  declared?: boolean
  /** The owning namespace view (schema, layers, secrets). */
  namespace: SettingsNamespaceView
  /** Settings-owned synchronous schema and immutable path operations. */
  schema: SettingsSchemaOperations
  /** Endpoint the route uses when its profile sets no `baseURL`; absent when the adapter reports none. */
  defaultBaseURL?: string
  /** Environment variables used by the provider to construct its endpoint. */
  baseURLEnv?: readonly string[]
  /** Authentication the route performs when its profile names no credential reference; absent when the adapter reports none. */
  nativeAuth?: LlmNativeAuth
  /** Redacted state of the profile's named credential reference, from the page snapshot. */
  credential?: CredentialInfo
  /** Redacted checks for the profile's named reference or the provider's native variables. */
  credentialChecks?: Readonly<Record<string, CredentialInfo>>
  /** Path from the section root to this provider's profile. */
  settingsPath: readonly string[]
  /** The Host operations this card writes and interrogates through. */
  operations: ModelsOperations
  /** Section copy. */
  t: (key: keyof typeof en) => string
  /** Disable writes (read-only settings provider). */
  readOnly: boolean
  /** Render only the credential field and actions, without provider settings. */
  credentialOnly?: boolean
  /** Require a newly entered credential before this editor can submit. */
  credentialRequired?: boolean
  /** Give the credential field initial focus when this editor mounts. */
  autoFocusCredential?: boolean
  /** Override the dismiss action copy. */
  cancelLabelKey?: keyof typeof en
  /** Override the idle commit action copy. */
  submitLabelKey?: keyof typeof en
  /** Override the in-flight commit action copy. */
  submitBusyLabelKey?: keyof typeof en
  /** Close the editor; `changed` reports whether an Apply committed. */
  onClose: (changed: boolean) => void
  /** Called on a credential form submission before the save starts. */
  onSubmitCredential?: () => void
  /**
   * Called once per change with whether the apply or the model list's
   * endpoint interrogation is in flight, so the owner can hold its surface
   * still.
   */
  onBusyChange?: (busy: boolean) => void
}

/** The editor layout the owning namespace selects. */
function layoutOf(ns: string): EditorLayout {
  if (ns === 'llm-deepseek') return 'deepseek'
  if (ns === 'llm-pi-ai') return 'pi-ai'
  return 'unknown'
}

/** The credential reference this profile resolves keys through. */
function refFor(
  schema: SettingsSchemaOperations,
  namespace: SettingsNamespaceView,
  path: readonly string[],
  provider: string,
): string {
  const profile = schema.getPath(namespace.value, path)
  const named = typeof profile === 'object' && profile !== null
    ? (profile as { apiKeyEnv?: unknown }).apiKeyEnv
    : undefined
  return typeof named === 'string' && named.length > 0 ? named : deriveKeyRef(provider)
}

/**
 * Render one provider's editing card.
 * @param props - the addressed profile plus wire faces and copy.
 * @returns the editor card.
 */
export function ProviderEditor(props: ProviderEditorProps): ReactNode {
  const { namespace, schema, settingsPath, operations, t } = props
  const [keyDraft, setKeyDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [listBusy, setListBusy] = useState(false)
  const { onBusyChange } = props
  useEffect(() => { onBusyChange?.(busy || listBusy) }, [busy, listBusy, onBusyChange])
  const [failure, setFailure] = useState<string | undefined>(undefined)
  // The shared staged form owns the draft: every control stages a field or the
  // model list, and one save plans the path ops against the stored section.
  // Reads happen during render; each staging action bumps this counter so the
  // card repaints without the component carrying a store subscription.
  const [, bump] = useReducer((version: number) => version + 1, 0)
  const viewRef = useRef({ namespace, readOnly: props.readOnly, t })
  viewRef.current = { namespace, readOnly: props.readOnly, t }
  const writeFailure = useRef<unknown>(undefined)
  const keyRef = refFor(schema, namespace, settingsPath, props.provider)
  const form = useMemo(() => {
    const scope: SettingsFormScope<unknown> = {
      // The page publishes namespace views as props; the form never pushes, so
      // its subscription is the no-op and renders read this snapshot.
      getSnapshot: () => {
        const view = viewRef.current.namespace
        return {
          status: 'ready', value: view.value, base: view.base, user: view.user,
          writable: !viewRef.current.readOnly, revision: view.revision,
        }
      },
      subscribe: () => () => {},
      mutate: async (ops, expectedRevision) => {
        const result = await operations.writeSettings(
          viewRef.current.namespace.ns, ops as SettingsPathOpView[], expectedRevision,
        )
        if (result.kind === 'written') return true
        writeFailure.current = result.kind === 'conflict' ? viewRef.current.t('conflict') : result.message
        return false
      },
    }
    return new SettingsFormModel<unknown>(
      scope,
      [settingsTextField('displayName'), settingsTextField('baseURL'), settingsTextField('api'), settingsTextField('apiKeyEnv')],
      [{ field: 'apiKey', write: async (text) => {
        const message = await operations.storeCredential(keyRef, text)
        if (message !== undefined) { writeFailure.current = message; return false }
        return true
      } }],
      { prefix: settingsPath },
    )
  }, [keyRef, operations, settingsPath])
  const root = useMemo(() => schema.rehydrate(namespace.schema), [namespace.schema, schema])
  const node = useMemo(() => schema.nodeAtPath(root, settingsPath), [root, schema, settingsPath])
  const fallback = schema.getPath(namespace.value, settingsPath)
  const disabled = props.readOnly || busy
  const layout = layoutOf(namespace.ns)
  // The same schema read the create card makes, so the choices offered here
  // and there cannot drift apart: both come from the adapter's own `Config`.
  // Only the pi-ai layout has a per-route protocol for the read to find, and
  // it rehydrates the whole section schema, so the other layouts skip it.
  const protocols = useMemo(
    () => layout === 'pi-ai' ? protocolChoices(namespace, schema) : [],
    [layout, namespace, schema],
  )

  const stringAt = (source: unknown, key: string): string | undefined => {
    const value = schema.getPath(source, [key])
    return typeof value === 'string' && value.trim().length > 0 ? value : undefined
  }
  /**
   * The user-layer draft of one field: an inherited value is not a draft, so
   * the control renders it as its placeholder instead of as its text.
   */
  const fieldDraft = (key: string): string => {
    const field = form.field(key)
    return field.overridden ? field.text : ''
  }
  /** The staged text of one field, with a blank draft reading as absent. */
  const fieldAt = (key: string): string | undefined => {
    const text = fieldDraft(key)
    return text.trim().length > 0 ? text : undefined
  }
  const setField = (key: string, next: string | undefined): void => {
    // The field specs treat a blank draft as a clear, so whitespace-only input
    // stages a clear instead of a value both adapters would accept.
    form.actions().edit(key, next ?? '')
    bump()
  }

  // The model list is validated by the same per-row checker for both families,
  // so a bad row is named by its position rather than by a blanket message.
  // Only a hand-declared pi-ai route's rows edit reasoning levels — the one
  // model list with no installed catalog behind it — so only there are the
  // levels read and the declarations checked.
  const reasoningLevels = useMemo(
    () => layout === 'pi-ai' && props.declared === true ? reasoningLevelChoices(namespace, schema) : [],
    [layout, props.declared, namespace, schema],
  )
  const editsReasoning = reasoningLevels.length > 0
  const validateModels = (value: unknown): DeepSeekModelsValidationFailure | ReasoningEffortsFailure | undefined =>
    validateDeepSeekModels(value) ?? (editsReasoning ? validateReasoningEfforts(value) : undefined)
  const modelsField = form.structuredField('models')
  const modelFailure = validateModels(modelsField.value)
  const keyFailure = apiKeyFailure(keyDraft)
  // What a probe or a write must carry: the typed key with paste whitespace
  // removed. A blank field yields an empty string, which both call sites read
  // as "no key supplied" rather than as a key — that is how a card whose
  // provider already has a stored key is edited without re-entering it.
  const keyValue = keyDraft.trim()
  const credentialRequiredFailure = props.credentialRequired === true
    && keyDraft.length > 0 && keyValue.length === 0
    ? 'keyRequired' as const
    : undefined
  const shownKeyFailure = credentialRequiredFailure ?? keyFailure
  // What the form currently shows, which is what an interrogation must ask:
  // an edited-but-unsaved endpoint, and a key typed but not yet stored.
  const probeApi = fieldAt('api') ?? stringAt(fallback, 'api')
  const probeBaseURL = fieldAt('baseURL') ?? stringAt(fallback, 'baseURL')
  const probe = {
    settingsNs: namespace.ns,
    // Naming the route lets an adapter that already describes it answer from
    // its own registry — better metadata, no network call, no endpoint needed.
    provider: props.provider,
    ...probeBaseURL === undefined ? {} : { baseURL: probeBaseURL },
    ...probeApi === undefined ? {} : { api: probeApi },
    ...keyValue.length === 0 ? {} : { apiKey: keyValue },
  }
  // A pi-ai profile materializes its profile node even when nothing was edited:
  // writing the empty object is what makes the route exist in settings.yaml.
  const materializesNativeProfile = layout === 'pi-ai'
    && fallback === undefined
    && schema.getPath(namespace.user, settingsPath) === undefined

  const apply = async (): Promise<void> => {
    if (submitInvalid) return
    setBusy(true)
    setFailure(undefined)
    writeFailure.current = undefined
    try {
      // A pi-ai profile names the conventional reference only when this page is
      // about to store a key; the model save carries it with the other ops.
      if (layout === 'pi-ai' && fieldAt('apiKeyEnv') === undefined
        && stringAt(fallback, 'apiKeyEnv') === undefined && keyValue.length > 0) {
        form.actions().edit('apiKeyEnv', keyRef)
      }
      // A whole-section profile is validated before any write, so a bad draft
      // names its field instead of surfacing the Host's path diagnostic.
      if (props.credentialOnly !== true && settingsPath.length === 0) {
        const draft: Record<string, unknown> = (() => {
          const stored = schema.getPath(namespace.user, settingsPath)
          return typeof stored === 'object' && stored !== null && !Array.isArray(stored)
            ? structuredClone(stored) as Record<string, unknown>
            : {}
        })()
        for (const field of ['displayName', 'baseURL', 'api', 'apiKeyEnv'] as const) {
          const staged = form.field(field)
          if (!staged.overridden) {
            if (!Object.hasOwn(draft, field)) continue
            const current = form.field(field)
            if (current.text.trim().length === 0) Reflect.deleteProperty(draft, field)
            else draft[field] = current.text
            continue
          }
          if (staged.text.trim().length === 0) Reflect.deleteProperty(draft, field)
          else draft[field] = staged.text
        }
        const models = form.structuredField('models')
        if (models.overridden && models.value !== undefined) draft.models = structuredClone(models.value)
        else if (models.overridden) Reflect.deleteProperty(draft, 'models')
        /* v8 ignore next -- apply is only reachable from the rendered card, which required a resolved node */
        if (node !== undefined) {
          const sectionError = schema.validate(node, draft)
          if (sectionError !== undefined) { setFailure(sectionError); return }
        }
      }
      const dirty = form.shell().dirty
      if (props.credentialOnly !== true && !dirty && materializesNativeProfile) {
        const written = await operations.writeSettings(
          namespace.ns, [{ op: 'set', path: [...settingsPath], value: {} }], namespace.revision,
        )
        if (written.kind !== 'written') {
          setFailure(written.kind === 'conflict' ? t('conflict') : written.message)
          return
        }
      } else if (dirty) {
        await form.save()
        if (form.shell().failed) {
          setFailure(typeof writeFailure.current === 'string' ? writeFailure.current : t('saveFailed'))
          return
        }
      }
      setKeyDraft('')
      props.onClose(true)
    } finally {
      setBusy(false)
      bump()
    }
  }

  // The card's chrome comes from the shared staged form: one save/cancel row,
  // the read-only line, and the refusal text, so this editor states its
  // outcome the same way every other settings card does.
  const submitInvalid = disabled || layout === 'unknown'
    || (props.credentialOnly !== true && modelFailure !== undefined)
    || shownKeyFailure !== undefined
    || (props.credentialRequired === true && keyValue.length === 0)
  const formState: SettingsFormShell = {
    available: true,
    writable: !props.readOnly,
    // Apply is meaningful with no staged edit: it materializes a native-auth
    // profile and stores a typed key, so dirtiness never gates this card.
    dirty: true,
    invalid: submitInvalid,
    saving: busy,
    failed: failure !== undefined,
  }
  const formLabels: SettingsFormLabels = {
    // The card only renders for a served namespace, so the frame
    // never shows its unavailable line; the read-only line still applies.
    unavailable: t('readOnly'),
    readOnly: t('readOnly'),
    saveFailed: failure ?? t('saveFailed'),
    save: t(props.submitLabelKey ?? 'apply'),
    saving: t(props.submitBusyLabelKey ?? 'applying'),
    cancel: t(props.cancelLabelKey ?? 'cancel'),
  }

  if (node === undefined) {
    // A directory entry addressing a position its schema cannot resolve is a
    // host-side inconsistency; showing it beats a blank card.
    return <p className={styles['error']}>{props.provider}: {props.t('settingsPathUnresolvable')}</p>
  }

  /**
   * The catalog beneath the user layer: what the composition entry pinned, or
   * else the schema default that `resolve` would supply. The effective value
   * cannot answer this — it still carries the stored override until the unset
   * is applied, so reading it would echo that override straight back the
   * moment reset drops it, leaving the rows unchanged until a reload.
   */
  const inheritedModels = (): unknown => {
    const pinned = schema.getPath(namespace.base, [...settingsPath, 'models'])
    return pinned ?? schema.nodeAtPath(root, [...settingsPath, 'models'])?.meta.default
  }

  /**
   * The curated fields of one known adapter family. The family arrives
   * narrowed so the per-family branches below are total: an unknown namespace
   * renders the hint instead and never reaches this body.
   */
  const curatedFields = (family: 'deepseek' | 'pi-ai'): ReactNode => {
    // What a hand-declared route names for itself and nothing else can supply.
    // A whole-section `llm-deepseek` profile is a composition fact with no
    // per-route identity for its schema to carry, hence the family test.
    const ownsIdentity = family === 'pi-ai' && props.declared === true
    const customModels = modelsField.value
    const modelsOverridden = modelsField.overridden
    const models = modelDrafts(modelsOverridden ? customModels : inheritedModels())
    const defaultContextWindow = schema.getPath(fallback, ['defaultContextWindow'])
    const defaultMaxTokens = schema.getPath(fallback, ['maxTokens'])
    const defaultInput = schema.getPath(fallback, ['defaultInput'])
    const baseURL = stringAt(fallback, 'baseURL') ?? props.defaultBaseURL
    const endpointEnv = props.baseURLEnv ?? []
    const endpointHint = family === 'deepseek' ? t('deepSeekEndpointHint')
      : baseURL === undefined && endpointEnv.length > 0 ? t('baseUrlEnvironment').replace('{env}', () => endpointEnv.join(', ')) : undefined
    // A named reference is the only credential the adapter reads for this
    // route. Without one, a catalog route authenticates the way the directory
    // reports, and a declared route sends no key at all.
    const namedRef = stringAt(fallback, 'apiKeyEnv')
    const nativeAuth = namedRef === undefined ? props.nativeAuth : undefined
    // Display method-neutral references without changing the adapter's lookup.
    const authRefs = namedRef === undefined
      ? (nativeAuth?.env ?? []).filter(ref => !endpointEnv.includes(ref)) : [namedRef]
    const visibleRefs = authRefs.filter(ref => !ref.toLowerCase().includes('oauth'))
    const keyHint = visibleRefs[0]
    const checkedRefs = authRefs.map(ref => [
      ref, props.credentialChecks?.[ref] ?? (ref === namedRef ? props.credential : undefined),
    ] as const)
    const detected = checkedRefs.find(([, info]) => info?.configured === true)
    const detectedRef = detected?.[0]
    const detectedVisibleRef = detectedRef === undefined || !visibleRefs.includes(detectedRef) ? undefined : detectedRef
    const missingRefs = checkedRefs.length > 0 && checkedRefs.every(([, info]) => info?.configured === false)
    const savedCredential = detected?.[1]?.source === 'file'
    // What the blank field says: a detected source names it, an all-missing or
    // unchecked set asks for a key. A typed draft hides every hint.
    const credentialHint = keyDraft.length > 0 || savedCredential || keyHint === undefined || props.credentialRequired === true
      ? undefined
      : t(detectedRef === undefined ? missingRefs ? 'keyFallbackMissing' : 'keyFallbackUnchecked'
        : detectedVisibleRef === undefined ? 'keyFallbackDetectedHidden' : 'keyFallbackDetected')
        .replace('{hint}', () => detectedVisibleRef ?? keyHint)
    const keyHelp = visibleRefs.length === 0
      ? undefined
      : t('keyHelp').replace('{env}', () => visibleRefs.join(' / '))
    const authHelp = keyHelp === undefined ? null : (
      <Tooltip label={keyHelp} side="right" delayMs={0} focusDelayMs={0} portal openOnClick>
        <button type="button" className={styles['helpButton']} aria-label={t('authHelp')}>?</button>
      </Tooltip>
    )
    // A provider with no native key authentication has no key for this field to store.
    const keylessNativeAuth = nativeAuth?.env.length === 0 && nativeAuth.oauth
    const keyPlaceholder = keyHint === undefined || props.credentialRequired === true
      ? t('keyPlaceholder')
      : t(savedCredential ? 'keyPlaceholderSaved' : 'keyPlaceholderFallback').replace('{hint}', () => keyHint)
    /** What both family editors take: the rows, whose layer owns them, and the two writes. */
    const catalogProps = {
      models,
      overridden: modelsOverridden,
      t,
      disabled,
      onChange: (next: Record<string, unknown>[]) => {
        form.stageValue('models', next)
        bump()
      },
      onReset: () => {
        form.stageValue('models', undefined)
        bump()
      },
    }
    return (
      <>
        {keylessNativeAuth
          ? null
          : <div className={styles['field']}>
            <span className={styles['fieldLabel']}>
              {t('keyInput')}
              {authHelp}
            </span>
            <SecretInput
              labels={{ reveal: t('keyReveal'), hide: t('keyHide') }}
              wrapperClassName={styles['keyInput']}
              inputClassName={`${styles['input']} ${keyDraft.length > 0 ? styles['keyInputFilled'] : ''}`}
              value={keyDraft}
              placeholder={keyPlaceholder}
              aria-label={t('keyInput')}
              aria-invalid={shownKeyFailure !== undefined}
              aria-describedby={credentialHint === undefined ? undefined : `${props.provider}-credential-hint`}
              required={props.credentialRequired === true}
              autoFocus={props.autoFocusCredential === true}
              disabled={disabled}
              onChange={(event) => {
                setKeyDraft(event.target.value)
                form.actions().edit('apiKey', event.target.value)
                bump()
              }}
            />
            {credentialHint === undefined ? null : <p id={`${props.provider}-credential-hint`} className={styles[missingRefs ? 'notice' : detectedRef === undefined ? 'advancedHint' : 'savedNotice']}>{credentialHint}</p>}
            {shownKeyFailure === undefined ? null : <p className={styles['error']}>{t(shownKeyFailure)}</p>}
          </div>}
        {props.credentialOnly === true ? null : <details className={styles['customized']}>
          <summary className={styles['customizedSummary']}>{t('customized')}</summary>
          <div className={styles['customizedBody']}>
            {/* The name and the protocol are the create card's two remaining
                profile fields; a route the adapter ships defaults both from
                its catalog entry and neither belongs on its card. */}
            {ownsIdentity
              ? (
                <div className={styles['field']}>
                  <span className={styles['fieldLabel']}>{t('customDisplayName')}</span>
                  <input
                    className={styles['input']}
                    type="text"
                    value={fieldDraft('displayName')}
                    // What this route is called the moment the field is
                    // cleared, which is the layer beneath the one this field
                    // edits: a `cordis.yml` may pin a name for a route the
                    // catalog does not ship, and only when nothing does is
                    // the answer the route id. Reading the effective value
                    // instead would echo the stored override back as the
                    // thing clearing restores.
                    placeholder={stringAt(schema.getPath(namespace.base, settingsPath), 'displayName')
                      ?? props.provider}
                    aria-label={t('customDisplayName')}
                    disabled={disabled}
                    onChange={(event) => { setField('displayName', event.target.value) }}
                  />
                </div>
              )
              : null}
            <div className={styles['field']}>
              <span className={styles['fieldLabel']}>{t('baseUrl')}</span>
              <input
                className={styles['input']}
                type="text"
                value={fieldDraft('baseURL')}
                placeholder={family === 'deepseek'
                  ? t('deepSeekBaseUrl')
                  : baseURL === undefined ? t(endpointEnv.length > 0 ? 'baseUrlConfigured' : 'baseUrlDefault')
                    : t('baseUrlPlaceholder').replace('{url}', () => baseURL)}
                aria-describedby={endpointHint === undefined ? undefined : `${props.provider}-endpoint-hint`}
                aria-label={t('baseUrl')}
                disabled={disabled}
                onChange={(event) => {
                  setField('baseURL', event.target.value === '' ? undefined : event.target.value)
                }}
              />
              {endpointHint === undefined ? null : <span id={`${props.provider}-endpoint-hint`} className={styles['advancedHint']}>{endpointHint}</span>}
            </div>
            {/* The protocol sits beside the endpoint it describes, as it does
                on the create card. */}
            {ownsIdentity
              ? (
                <div className={styles['field']}>
                  <span className={styles['fieldLabel']}>{t('customApi')}</span>
                  <select
                    className={`${styles['input']} ${styles['selectInput']}`}
                    value={probeApi ?? ''}
                    aria-label={t('customApi')}
                    disabled={disabled}
                    onChange={(event) => { setField('api', event.target.value) }}
                  >
                    {/* A profile naming no protocol — hand-written into
                        settings.yaml with no model to need one — selects
                        nothing rather than reading as if it had picked the
                        first choice. The option is named because a screen
                        reader announces it either way, and an empty one is
                        announced as a choice with no identity. */}
                    {probeApi === undefined ? <option value="">{t('customApiUnset')}</option> : null}
                    {protocols.map(choice => <option key={choice} value={choice}>{protocolLabel(t, choice)}</option>)}
                  </select>
                </div>
              )
              : null}
            {/* Both families edit the same rows through the same contract; only
                the extras differ — DeepSeek's inherited capacities, pi-ai's
                endpoint interrogation. */}
            {family === 'deepseek'
              ? (
                <DeepSeekModelsEditor
                  {...catalogProps}
                  defaultContextWindow={typeof defaultContextWindow === 'number'
                    ? defaultContextWindow
                    : undefined}
                  defaultMaxTokens={typeof defaultMaxTokens === 'number' ? defaultMaxTokens : undefined}
                />
              )
              : (
                <ModelListEditor
                  {...catalogProps}
                  catalogProvider={props.declared === true ? undefined : props.provider}
                  reasoningLevels={reasoningLevels}
                  defaultInput={Array.isArray(defaultInput) ? defaultInput : undefined}
                  probe={probe}
                  probeBlocked={keyFailure}
                  operations={operations}
                  onBusyChange={setListBusy}
                />
              )}
          </div>
        </details>}
      </>
    )
  }

  return (
    <div className={props.credentialOnly === true ? styles['addBlock'] : styles['editor']}>
      {props.hideTitle === true
        ? null
        : (
          <div className={styles['editorHeader']}>
            <span className={styles['editorTitle']}>{props.displayName}</span>
            {props.provider !== props.displayName
              ? <span className={styles['editorRoute']}>{props.provider}</span>
              : null}
          </div>
        )}
      {layout === 'unknown'
        ? <p className={styles['advancedHint']}>{`${t('advancedHint')} (${namespace.ns})`}</p>
        : curatedFields(layout)}
      {props.credentialOnly === true || modelFailure === undefined
        ? null
        : (
          <p className={styles['advancedHint']}>
            {`${t('model')} ${String(modelFailure.index + 1)}: ${t(modelFailure.key)}`}
          </p>
        )}
      <SettingsForm
        labels={formLabels}
        state={formState}
        onSave={() => { props.onSubmitCredential?.(); void apply() }}
        onDiscard={() => {}}
        onCancel={() => { props.onClose(false) }}
      >{null}</SettingsForm>
    </div>
  )
}
