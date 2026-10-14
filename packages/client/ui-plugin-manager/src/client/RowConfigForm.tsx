/**
 * One bundle row's schemastery configuration form on the row's page: the
 * controls the row module's exported Config describes, edits staged locally
 * until the save writes the complete map back, and the honest absences — no
 * form while the row's module has not been imported, a failure line when the
 * Host refuses the read or the save.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react'
import Schema from '@qilin-agent/schemastery'
import type { BundleRowConfig } from '@qilin-agent/api-remotes/client'
import type { Translate } from './presentation.ts'
import css from './RowConfigForm.module.css'

/** The rebuilt schemastery node the renderer walks. */
interface SchemaNode {
  readonly type: string
  readonly dict?: Readonly<Record<string, SchemaNode>>
  readonly inner?: SchemaNode
  readonly list?: readonly SchemaNode[]
  readonly meta?: { readonly description?: string }
  readonly role?: string
}

/** What a read answered: nothing to configure, a read failure, or the form's inputs. */
type FormState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'absent' }
  | { readonly kind: 'failed' }
  | { readonly kind: 'ready'; readonly schema: SchemaNode; readonly values: Record<string, unknown> }

export interface RowConfigFormProps {
  readonly t: Translate
  /** Read the row's schema and values from the Host. */
  readonly load: () => Promise<BundleRowConfig | null>
  /** Write the complete configuration map the row should run with. */
  readonly save: (values: Record<string, unknown>) => Promise<void>
  /** The row the form edits; a change restarts the read. */
  readonly subject: string
}

/** Set the value at a dot-free path inside a copied record, creating missing levels. */
function assign(root: Record<string, unknown>, path: readonly string[], value: unknown): Record<string, unknown> {
  const [head, ...rest] = path
  if (head === undefined) return value as Record<string, unknown>
  const source = (root[head] ?? {}) as Record<string, unknown>
  return { ...root, [head]: rest.length === 0 ? value : assign(source, rest, value) }
}

/** The text an empty input edits, for values the row has not configured. */
function inputText(value: unknown): string {
  return value === undefined || value === null ? '' : String(value)
}

/** One schema node's control, writing its complete value back through the parent. */
function SchemaControl({ node, value, onWrite, t, depth }: {
  readonly node: SchemaNode
  readonly value: unknown
  readonly onWrite: (value: unknown) => void
  readonly t: Translate
  readonly depth: number
}): ReactNode {
  if (node.type === 'object') {
    const record = (value ?? {}) as Record<string, unknown>
    return (
      <div className={depth === 0 ? css.object : css.nested}>
        {Object.entries(node.dict ?? {}).map(([key, child]) => (
          <label key={key} className={css.field}>
            <span className={css.label}>{child.meta?.description ?? key}</span>
            <SchemaControl
              node={child}
              value={record[key]}
              onWrite={next => onWrite({ ...record, [key]: next })}
              t={t}
              depth={depth + 1}
            />
          </label>
        ))}
      </div>
    )
  }
  if (node.type === 'boolean') {
    return <input type="checkbox" className={css.checkbox} checked={value === true} onChange={event => onWrite(event.target.checked)} />
  }
  if (node.type === 'number') {
    return (
      <input
        type="number"
        className={css.input}
        value={inputText(value)}
        onChange={event => onWrite(event.target.value === '' ? undefined : Number(event.target.value))}
      />
    )
  }
  if (node.type === 'array') {
    const items = Array.isArray(value) ? value : []
    const inner = node.inner ?? { type: 'string' }
    return (
      <div className={css.array}>
        {items.map((item, index) => (
          <div key={index} className={css.arrayRow}>
            <SchemaControl
              node={inner}
              value={item}
              onWrite={next => onWrite(items.map((current, at) => at === index ? next : current))}
              t={t}
              depth={depth + 1}
            />
            <button type="button" className={css.mini} onClick={() => onWrite(items.filter((_, at) => at !== index))}>
              {t('rowConfigRemoveItem')}
            </button>
          </div>
        ))}
        <button type="button" className={css.mini} onClick={() => onWrite([...items, undefined])}>{t('rowConfigAddItem')}</button>
      </div>
    )
  }
  if (node.type === 'union') {
    return <UnionControl node={node} value={value} onWrite={onWrite} t={t} depth={depth} />
  }
  return node.role === 'textarea'
    ? <textarea className={css.input} rows={3} value={inputText(value)} onChange={event => onWrite(event.target.value)} />
    : (
      <input
        type="text"
        className={css.input}
        value={inputText(value)}
        onChange={event => onWrite(event.target.value)}
      />
    )
}

/** A union's control: the alternative picked in a select, edited by that alternative's own control. */
function UnionControl({ node, value, onWrite, t, depth }: {
  readonly node: SchemaNode
  readonly value: unknown
  readonly onWrite: (value: unknown) => void
  readonly t: Translate
  readonly depth: number
}): ReactNode {
  const options = node.list ?? []
  const [picked, setPicked] = useState(() => {
    const at = options.findIndex(option => option.type === typeof value)
    return at === -1 ? 0 : at
  })
  const chosen = options[picked]
  if (chosen === undefined) return null
  return (
    <div className={css.array}>
      <select
        className={css.input}
        value={picked}
        onChange={(event) => {
          setPicked(Number(event.target.value))
          onWrite(undefined)
        }}
      >
        {options.map((option, at) => (
          <option key={at} value={at}>{option.meta?.description ?? option.type}</option>
        ))}
      </select>
      <SchemaControl node={chosen} value={value} onWrite={onWrite} t={t} depth={depth + 1} />
    </div>
  )
}

/**
 * Render one row's configuration form.
 * @param props - the locale reader, the Host read and write, and the row identity.
 * @returns the form, nothing while the row offers no schema, or the failure line.
 */
export function RowConfigForm(props: RowConfigFormProps): ReactNode {
  const { t, load, save, subject } = props
  const [state, setState] = useState<FormState>({ kind: 'loading' })
  const [draft, setDraft] = useState<Record<string, unknown> | undefined>(undefined)
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)
  const [saved, setSaved] = useState(false)
  const mounted = useRef(true)
  mounted.current = true
  useEffect(() => () => { mounted.current = false }, [])
  useEffect(() => {
    let live = true
    setState({ kind: 'loading' })
    setDraft(undefined)
    setFailed(false)
    setSaved(false)
    load().then((config) => {
      if (!live) return
      if (config === null) setState({ kind: 'absent' })
      else {
        setState({
          kind: 'ready',
          schema: Schema((config.schema ?? {}) as object) as unknown as SchemaNode,
          values: (config.values ?? {}) as Record<string, unknown>,
        })
      }
    }, () => {
      if (live) setState({ kind: 'failed' })
    })
    return () => { live = false }
  }, [load, subject])
  if (state.kind !== 'ready') {
    if (state.kind === 'absent') return null
    return <p className={css.status} role="status">{t(state.kind === 'loading' ? 'rowConfigLoading' : 'rowConfigLoadFailed')}</p>
  }
  const current = draft ?? state.values
  const write = (path: readonly string[], value: unknown): void => {
    setSaved(false)
    setDraft(assign(current, path, value))
  }
  const onSave = (): void => {
    setSaving(true)
    setFailed(false)
    save(current).then(() => {
      if (!mounted.current) return
      setSaving(false)
      setState({ ...state, values: current })
      setDraft(undefined)
      setSaved(true)
    }, () => {
      if (!mounted.current) return
      setSaving(false)
      setFailed(true)
    })
  }
  return (
    <section className={css.form} data-row-config={subject}>
      <SchemaControl node={state.schema} value={current} onWrite={value => write([], value)} t={t} depth={0} />
      <div className={css.saveRow}>
        {failed ? <p className={css.failedLine} role="alert">{t('rowConfigSaveFailed')}</p> : null}
        {!failed && saved ? <p className={css.savedLine} role="status">{t('rowConfigSaved')}</p> : null}
        <button type="button" className={css.save} disabled={saving} onClick={onSave}>
          {t(saving ? 'rowConfigSaving' : 'rowConfigSave')}
        </button>
      </div>
    </section>
  )
}
