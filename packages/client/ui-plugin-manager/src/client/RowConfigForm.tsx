/**
 * One bundle row's schemastery configuration form on the row's page: the
 * controls the row module's exported Config describes, edits staged locally
 * until the save writes the complete map back, and the honest absences — no
 * form while the row's module has not been imported, a failure line when the
 * Host refuses the read or the save.
 *
 * The schema and draft operations come from `@qilin-agent/client-schema-form`,
 * the same model layer `ctx.settingsSchema` serves to client plugins:
 * `rehydrateSchema` rebuilds the live node tree from the row's serialized
 * envelope, `setPath`/`deletePath` edit the staged draft immutably by path,
 * and `validateDraft` refuses a draft the row's own schema rejects before any
 * write happens. Controls are the shared `ui-primitives` atoms; a node whose
 * type has no atom — a textarea role, a union's alternative picker — keeps a
 * local control, and a node this form cannot represent (a dict or an
 * extension type) writes through the leaf control only until the validator
 * refuses it, instead of silently storing a wrong value.
 */

import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import {
  deletePath, rehydrateSchema, setPath, validateDraft, type SchemaNode,
} from '@qilin-agent/client-schema-form'
import { Button, Checkbox, Input } from '@qilin-agent/client-ui-primitives'
import type { BundleRowConfig } from '@qilin-agent/api-remotes/client'
import type { Translate } from './presentation.ts'
import css from './RowConfigForm.module.css'

/** The node an array without a declared item type renders its entries with. */
const STRING_NODE = rehydrateSchema({ type: 'string' })

/** What a read answered: nothing to configure, a read failure, or the form's inputs. */
type FormState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'absent' }
  | { readonly kind: 'failed' }
  | { readonly kind: 'ready'; readonly schema: SchemaNode; readonly values: unknown }

export interface RowConfigFormProps {
  readonly t: Translate
  /** Read the row's schema and values from the Host. */
  readonly load: () => Promise<BundleRowConfig | null>
  /** Write the complete configuration map the row should run with. */
  readonly save: (values: Record<string, unknown>) => Promise<void>
  /** The row the form edits; a change restarts the read. */
  readonly subject: string
}

/** Stable DOM id of the control at one schema path. */
function fieldId(formId: string, path: readonly string[]): string {
  return path.length === 0 ? formId : `${formId}-${path.join('-')}`
}

/** One node's label: its declared description, else the field key. */
function labelOf(node: SchemaNode, key: string): string {
  const description = node.meta.description
  return typeof description === 'string' ? description : key
}

/** The text an empty input edits, for values the row has not configured. */
function inputText(value: unknown): string {
  // Only a scalar has a text form; a container keeps its empty control rather
  // than the string "object Object".
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
    ? String(value)
    : ''
}

/** Whether a union alternative describes the kind of value the field carries. */
function matchesValue(node: SchemaNode, value: unknown): boolean {
  switch (node.type) {
    case 'array': return Array.isArray(value)
    case 'object':
    case 'dict': return typeof value === 'object' && value !== null && !Array.isArray(value)
    case 'boolean': return typeof value === 'boolean'
    case 'number': return typeof value === 'number'
    case 'string': return typeof value === 'string'
    // A schema extension's type names no kind this form knows; the field then
    // keeps the first alternative rather than guessing a wrong one.
    default: return false
  }
}

/** One literal a constant-only union offers. */
interface UnionLiteral {
  readonly value: unknown
  readonly label: string
}

/**
 * The literals a union of constants offers. Such a union is one choice among
 * values, so it renders as a single select; a union with any other alternative
 * keeps the picker that edits through the alternative's own control.
 * @param node - a union node from the rehydrated envelope.
 * @returns the literal alternatives in schema order, or `undefined`.
 */
function unionLiterals(node: SchemaNode): UnionLiteral[] | undefined {
  const options = node.list ?? []
  if (options.length === 0) return undefined
  const literals: UnionLiteral[] = []
  for (const option of options) {
    if (option.type !== 'const') return undefined
    literals.push({ value: option.value, label: labelOf(option, String(option.value)) })
  }
  return literals
}

/** The writes and removals one form's root performs on its staged draft. */
interface DraftWriter {
  /** Store one value at a path; an empty path replaces the draft root. */
  set: (path: readonly string[], value: unknown) => void
  /** Remove one path; an empty path leaves the draft alone. */
  remove: (path: readonly string[]) => void
}

/** What one node's control reads: the node, its value and path, and the plumbing the form threads through. */
interface SchemaControlProps {
  readonly node: SchemaNode
  readonly value: unknown
  readonly path: readonly string[]
  readonly label: string
  readonly formId: string
  readonly writer: DraftWriter
  readonly t: Translate
  readonly depth: number
}

/** One schema node's control, writing through its own path. */
function SchemaControl({ node, value, path, label, formId, writer, t, depth }: SchemaControlProps): ReactNode {
  const id = fieldId(formId, path)
  if (node.type === 'object') {
    const record = (value ?? {}) as Record<string, unknown>
    return (
      <div className={depth === 0 ? css.object : css.nested}>
        {Object.entries(node.dict ?? {}).map(([key, child]) => {
          const childPath = [...path, key]
          const childLabel = labelOf(child, key)
          return (
            <div key={key} className={css.field}>
              {child.type === 'boolean'
                ? null
                : child.type === 'array'
                  ? <span className={css.label}>{childLabel}</span>
                  : <label className={css.label} htmlFor={fieldId(formId, childPath)}>{childLabel}</label>}
              <SchemaControl
                node={child}
                value={record[key]}
                path={childPath}
                label={childLabel}
                formId={formId}
                writer={writer}
                t={t}
                depth={depth + 1}
              />
            </div>
          )
        })}
      </div>
    )
  }
  if (node.type === 'boolean') {
    return <Checkbox checked={value === true} onChange={(next) => { writer.set(path, next) }} label={label} />
  }
  if (node.type === 'number') {
    return (
      <Input
        id={id}
        type="number"
        className={css.control}
        value={inputText(value)}
        onChange={(event) => { writer.set(path, event.target.value === '' ? undefined : Number(event.target.value)) }}
      />
    )
  }
  if (node.type === 'array') {
    const items: unknown[] = Array.isArray(value) ? value : []
    const inner = node.inner ?? STRING_NODE
    return (
      <div className={css.array}>
        {items.map((item, index) => (
          <div key={index} className={css.arrayRow}>
            <SchemaControl
              node={inner}
              value={item}
              path={[...path, String(index)]}
              label={label}
              formId={formId}
              writer={writer}
              t={t}
              depth={depth + 1}
            />
            <Button variant="ghost" size="sm" onClick={() => { writer.remove([...path, String(index)]) }}>
              {t('rowConfigRemoveItem')}
            </Button>
          </div>
        ))}
        <Button variant="outline" size="sm" onClick={() => { writer.set([...path, String(items.length)], undefined) }}>
          {t('rowConfigAddItem')}
        </Button>
      </div>
    )
  }
  if (node.type === 'union') {
    const literals = unionLiterals(node)
    if (literals !== undefined) {
      return <EnumControl node={node} value={value} path={path} formId={formId} writer={writer} literals={literals} />
    }
    return <UnionControl node={node} value={value} path={path} label={label} formId={formId} writer={writer} t={t} depth={depth} />
  }
  return node.meta.role === 'textarea'
    ? (
      <textarea
        id={id}
        className={css.textarea}
        rows={3}
        value={inputText(value)}
        onChange={(event) => { writer.set(path, event.target.value) }}
      />
    )
    : (
      <Input
        id={id}
        type="text"
        className={css.control}
        value={inputText(value)}
        onChange={(event) => { writer.set(path, event.target.value) }}
      />
    )
}

/** A constant-only union's control: one select over the literals, writing the chosen value. */
function EnumControl({ node, value, path, formId, writer, literals }: {
  readonly node: SchemaNode
  readonly value: unknown
  readonly path: readonly string[]
  readonly formId: string
  readonly writer: DraftWriter
  readonly literals: readonly UnionLiteral[]
}): ReactNode {
  const literalByOption = new Map(literals.map((literal, index) => [String(index), literal.value]))
  const at = literals.findIndex(literal => literal.value === value)
  // An unset value shows the schema's default, so the control states the value
  // the row runs with instead of the first alternative it happens to declare.
  const selected = at === -1 ? literals.findIndex(literal => literal.value === node.meta.default) : at
  return (
    <select
      id={fieldId(formId, path)}
      className={css.select}
      value={selected === -1 ? 0 : selected}
      onChange={(event) => { writer.set(path, literalByOption.get(event.target.value)) }}
    >
      {literals.map((literal, index) => (
        <option key={index} value={index}>{literal.label}</option>
      ))}
    </select>
  )
}

/** A union's control: the alternative picked in a select, edited by that alternative's own control. */
function UnionControl({ node, value, path, label, formId, writer, t, depth }: SchemaControlProps): ReactNode {
  const options = node.list ?? []
  const [picked, setPicked] = useState(() => {
    const at = options.findIndex(option => matchesValue(option, value))
    return at === -1 ? 0 : at
  })
  const chosen = options[picked]
  if (chosen === undefined) return null
  return (
    <div className={css.array}>
      <select
        id={fieldId(formId, path)}
        className={css.select}
        value={picked}
        onChange={(event) => {
          setPicked(Number(event.target.value))
          writer.set(path, undefined)
        }}
      >
        {options.map((option, at) => (
          <option key={at} value={at}>{labelOf(option, option.type)}</option>
        ))}
      </select>
      <SchemaControl
        node={chosen}
        value={value}
        path={path}
        label={label}
        formId={formId}
        writer={writer}
        t={t}
        depth={depth + 1}
      />
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
  const formId = useId()
  const [state, setState] = useState<FormState>({ kind: 'loading' })
  const [draft, setDraft] = useState<unknown>(undefined)
  const [staged, setStaged] = useState(false)
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)
  const [invalid, setInvalid] = useState<string | undefined>(undefined)
  const [saved, setSaved] = useState(false)
  const mounted = useRef(true)
  mounted.current = true
  useEffect(() => () => { mounted.current = false }, [])
  useEffect(() => {
    let live = true
    setState({ kind: 'loading' })
    setDraft(undefined)
    setStaged(false)
    setFailed(false)
    setInvalid(undefined)
    setSaved(false)
    load().then((config) => {
      if (!live) return
      if (config === null) setState({ kind: 'absent' })
      else {
        setState({
          kind: 'ready',
          schema: rehydrateSchema(config.schema ?? {}),
          values: config.values ?? {},
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
  const current = staged ? draft : state.values
  const stage = (next: unknown): void => {
    setSaved(false)
    setInvalid(undefined)
    setDraft(next)
    setStaged(true)
  }
  const writer: DraftWriter = {
    set: (path, value) => {
      stage(path.length === 0
        ? value
        : setPath((current ?? {}) as Record<string, unknown>, path, value))
    },
    remove: (path) => {
      /* v8 ignore next -- every rendered array row names its index; no control removes the draft root. */
      if (path.length === 0) return
      /* v8 ignore next -- a nullish draft root renders no array row, so remove never runs against one. */
      stage(deletePath((current ?? {}) as Record<string, unknown>, path))
    },
  }
  const onSave = (): void => {
    const refusal = validateDraft(state.schema, current)
    if (refusal !== undefined) {
      setSaved(false)
      setInvalid(refusal)
      return
    }
    setSaving(true)
    setFailed(false)
    setInvalid(undefined)
    save(current as Record<string, unknown>).then(() => {
      if (!mounted.current) return
      setSaving(false)
      setState({ ...state, values: current })
      setDraft(undefined)
      setStaged(false)
      setSaved(true)
    }, () => {
      if (!mounted.current) return
      setSaving(false)
      setFailed(true)
    })
  }
  return (
    <section className={css.form} data-row-config={subject}>
      <SchemaControl
        node={state.schema}
        value={current}
        path={[]}
        label={labelOf(state.schema, t('rowConfigValue'))}
        formId={formId}
        writer={writer}
        t={t}
        depth={0}
      />
      <div className={css.saveRow}>
        {failed ? <p className={css.failedLine} role="alert">{t('rowConfigSaveFailed')}</p> : null}
        {!failed && invalid !== undefined
          ? <p className={css.failedLine} role="alert">{t('rowConfigInvalid')}{invalid}</p>
          : null}
        {!failed && invalid === undefined && saved ? <p className={css.savedLine} role="status">{t('rowConfigSaved')}</p> : null}
        <Button variant="primary" disabled={saving} onClick={onSave}>
          {t(saving ? 'rowConfigSaving' : 'rowConfigSave')}
        </Button>
      </div>
    </section>
  )
}
