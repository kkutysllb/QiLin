// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import Schema from '@qilin-agent/schemastery'
import type { BundleRowConfig } from '@qilin-agent/api-remotes/client'
import { RowConfigForm, type RowConfigFormProps } from '../src/client/RowConfigForm.tsx'
import { en, type PluginManagerLocaleKey } from '../src/client/locales.ts'

afterEach(cleanup)

const t = ((key: PluginManagerLocaleKey): string => en[key]) as RowConfigFormProps['t']

const SCHEMA_JSON = Schema.object({
  name: Schema.string().default('a'),
  count: Schema.number().default(3),
  on: Schema.boolean().default(false),
  tags: Schema.array(Schema.string()).default([]),
  nested: Schema.object({ deep: Schema.string().default('d') }),
}).toJSON()

const VALUES = { name: 'live', count: 5, on: true, tags: ['x'], nested: { deep: 'd' } }

function config(): BundleRowConfig {
  return bundleConfig(SCHEMA_JSON, VALUES)
}

function bundleConfig(schema: unknown, values: unknown): BundleRowConfig {
  return { schema: schema as BundleRowConfig['schema'], values: values as BundleRowConfig['values'] }
}

describe('RowConfigForm', () => {
  it('renders nothing while the row offers no schema', async () => {
    const load = vi.fn(async () => null)
    const { container } = render(<RowConfigForm t={t} load={load} save={vi.fn()} subject="p#r" />)
    await vi.waitFor(() => { expect(container.textContent).toBe('') })
  })

  it('shows the failure line when the Host refuses the read', async () => {
    const load = vi.fn(async () => { throw new Error('refused') })
    render(<RowConfigForm t={t} load={load} save={vi.fn()} subject="p#r" />)
    expect((await screen.findByRole('status')).textContent).toBe(en.rowConfigLoadFailed)
  })

  it('renders the schema controls with the values the row runs with', async () => {
    render(<RowConfigForm t={t} load={vi.fn(async () => config())} save={vi.fn()} subject="p#r" />)
    const name = await screen.findByDisplayValue('live')
    expect(name).toBeDefined()
    expect(screen.getByDisplayValue('5')).toBeDefined()
    expect(screen.getByRole<HTMLInputElement>('checkbox').checked).toBe(true)
    expect(screen.getByDisplayValue('x')).toBeDefined()
    expect(screen.getByDisplayValue('d')).toBeDefined()
  })

  it('stages edits locally and saves the complete merged map', async () => {
    const save = vi.fn(async () => {})
    render(<RowConfigForm t={t} load={vi.fn(async () => config())} save={save} subject="p#r" />)
    fireEvent.change(await screen.findByDisplayValue('live'), { target: { value: 'edit' } })
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(screen.getByText(en.rowConfigAddItem))
    fireEvent.click(screen.getByText(en.rowConfigSave))
    await vi.waitFor(() => {
      expect(save).toHaveBeenCalledWith({
        name: 'edit', count: 5, on: false, tags: ['x', undefined], nested: { deep: 'd' },
      })
    })
    expect((await screen.findByRole('status')).textContent).toBe(en.rowConfigSaved)
  })

  it('removes an array entry through the delete path', async () => {
    const save = vi.fn(async () => {})
    render(<RowConfigForm t={t} load={vi.fn(async () => config())} save={save} subject="p#r" />)
    fireEvent.click(await screen.findByText(en.rowConfigRemoveItem))
    fireEvent.click(screen.getByText(en.rowConfigSave))
    await vi.waitFor(() => { expect(save).toHaveBeenCalledWith({ ...VALUES, tags: [] }) })
  })

  it('refuses a draft the schema rejects and saves it once it is valid again', async () => {
    const save = vi.fn(async () => {})
    const required = Schema.object({ n: Schema.number().required(), label: Schema.string() })
    render(<RowConfigForm
      t={t}
      load={vi.fn(async () => bundleConfig(required, { n: 1, label: 'l' }))}
      save={save}
      subject="p#required"
    />)
    fireEvent.change(await screen.findByDisplayValue('1'), { target: { value: '' } })
    fireEvent.click(screen.getByText(en.rowConfigSave))
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain(en.rowConfigInvalid)
    expect(alert.textContent).toContain('n')
    expect(save).not.toHaveBeenCalled()
    fireEvent.change(screen.getByDisplayValue(''), { target: { value: '2' } })
    fireEvent.click(screen.getByText(en.rowConfigSave))
    await vi.waitFor(() => { expect(save).toHaveBeenCalledWith({ n: 2, label: 'l' }) })
  })

  it('keeps the staged edits and shows the failure line when the save is refused', async () => {
    const save = vi.fn(async (_values: Record<string, unknown>) => { throw new Error('refused') })
    render(<RowConfigForm t={t} load={vi.fn(async () => config())} save={save} subject="p#r" />)
    fireEvent.change(await screen.findByDisplayValue('live'), { target: { value: 'edit' } })
    fireEvent.click(screen.getByText(en.rowConfigSave))
    expect((await screen.findByRole('alert')).textContent).toBe(en.rowConfigSaveFailed)
    fireEvent.click(screen.getByText(en.rowConfigSave))
    await vi.waitFor(() => { expect(save).toHaveBeenCalledTimes(2) })
    expect(save.mock.calls[1]?.[0]).toEqual({ ...VALUES, name: 'edit' })
  })

  it('rereads when the subject changes', async () => {
    const load = vi.fn(async () => config())
    const page = render(<RowConfigForm t={t} load={load} save={vi.fn()} subject="p#one" />)
    await screen.findByDisplayValue('live')
    page.rerender(<RowConfigForm t={t} load={load} save={vi.fn()} subject="p#two" />)
    await vi.waitFor(() => { expect(load).toHaveBeenCalledTimes(2) })
  })

  it('edits numbers, textarea roles, nested leaves, and union alternatives', async () => {
    const save = vi.fn(async () => {})
    const rich = Schema.object({
      n: Schema.number(),
      bio: Schema.string().role('textarea'),
      pick: Schema.union([Schema.string(), Schema.number()]),
      nested: Schema.object({ deep: Schema.object({ leaf: Schema.string().default('l') }) }),
    })
    render(<RowConfigForm
      t={t}
      load={vi.fn(async () => bundleConfig(rich, { n: 1, bio: 'b', pick: 'x', nested: { deep: { leaf: 'l' } } }))}
      save={save}
      subject="p#rich"
    />)
    expect((await screen.findByDisplayValue('b')).tagName).toBe('TEXTAREA')
    fireEvent.change(screen.getByDisplayValue('1'), { target: { value: '' } })
    fireEvent.change(screen.getByDisplayValue('b'), { target: { value: 'writer' } })
    fireEvent.change(screen.getByDisplayValue('l'), { target: { value: 'leaf2' } })
    fireEvent.change(screen.getByDisplayValue('x'), { target: { value: '7' } })
    fireEvent.click(screen.getByText(en.rowConfigSave))
    await vi.waitFor(() => {
      expect(save).toHaveBeenCalledWith({
        n: undefined, bio: 'writer', pick: '7', nested: { deep: { leaf: 'leaf2' } },
      })
    })
  })

  it('keeps editing after the root schema is a leaf', async () => {
    const save = vi.fn(async () => {})
    render(<RowConfigForm
      t={t}
      load={vi.fn(async () => bundleConfig(Schema.string(), 'seed'))}
      save={save}
      subject="p#leaf"
    />)
    fireEvent.change(await screen.findByDisplayValue('seed'), { target: { value: 'solo' } })
    fireEvent.click(screen.getByText(en.rowConfigSave))
    await vi.waitFor(() => { expect(save).toHaveBeenCalledWith('solo') })
  })

  it('picks the union alternative that matches the value kind', async () => {
    const cases: readonly (readonly [string, Schema[], unknown])[] = [
      ['string', [Schema.number(), Schema.string()], 'x'],
      ['array', [Schema.string(), Schema.array(Schema.string())], ['a']],
      ['object', [Schema.string(), Schema.object({ x: Schema.string() })], { x: 'v' }],
      ['dict', [Schema.string(), Schema.dict(Schema.string())], { k: 'v' }],
      ['boolean', [Schema.string(), Schema.boolean()], true],
      ['number', [Schema.string(), Schema.number()], 5],
      ['extension', [Schema.transform(Schema.string(), value => value), Schema.string()], 'x'],
    ]
    for (const [kind, alternatives, value] of cases) {
      const schema = Schema.object({ pick: Schema.union(alternatives) })
      const page = render(<RowConfigForm
        t={t}
        load={vi.fn(async () => bundleConfig(schema, { pick: value }))}
        save={vi.fn()}
        subject={`p#pick-${kind}`}
      />)
      const select = await screen.findByRole<HTMLSelectElement>('combobox')
      expect(select.value, kind).toBe('1')
      page.unmount()
    }
  })

  it('switches a union alternative through the picker', async () => {
    const save = vi.fn(async () => {})
    const schema = Schema.object({ pick: Schema.union([Schema.string(), Schema.number()]) })
    render(<RowConfigForm
      t={t}
      load={vi.fn(async () => bundleConfig(schema, { pick: 'x' }))}
      save={save}
      subject="p#switch"
    />)
    fireEvent.change(await screen.findByRole<HTMLSelectElement>('combobox'), { target: { value: '1' } })
    fireEvent.change(await screen.findByRole<HTMLInputElement>('spinbutton'), { target: { value: '7' } })
    fireEvent.click(screen.getByText(en.rowConfigSave))
    await vi.waitFor(() => { expect(save).toHaveBeenCalledWith({ pick: 7 }) })
  })

  it('labels a field with its declared description', async () => {
    const schema = Schema.object({ named: Schema.string().description('Friendly label') })
    render(<RowConfigForm
      t={t}
      load={vi.fn(async () => bundleConfig(schema, { named: 'v' }))}
      save={vi.fn()}
      subject="p#label"
    />)
    expect(await screen.findByText('Friendly label')).toBeDefined()
  })

  it('renders fields the row never configured', async () => {
    const schema = Schema.object({
      nested: Schema.object({ deep: Schema.string() }),
      tags: Schema.array(Schema.string()),
    })
    render(<RowConfigForm
      t={t}
      load={vi.fn(async () => bundleConfig(schema, {}))}
      save={vi.fn()}
      subject="p#unset"
    />)
    expect((await screen.findByRole<HTMLInputElement>('textbox')).value).toBe('')
    expect(screen.queryByText(en.rowConfigRemoveItem)).toBeNull()
  })

  it('renders an empty control when the read carries no schema or values', async () => {
    render(<RowConfigForm
      t={t}
      load={vi.fn(async () => bundleConfig(undefined, undefined))}
      save={vi.fn()}
      subject="p#empty"
    />)
    expect((await screen.findByRole<HTMLInputElement>('textbox')).value).toBe('')
  })

  it('tolerates structural nodes that carry no relations', async () => {
    const envelope = {
      type: 'object',
      dict: {
        noDict: { type: 'object', meta: {} },
        noInner: { type: 'array', meta: {} },
        noList: { type: 'union', meta: {} },
      },
    }
    render(<RowConfigForm
      t={t}
      load={vi.fn(async () => bundleConfig(envelope, { noDict: { a: 1 }, noInner: ['x'], noList: 'v' }))}
      save={vi.fn()}
      subject="p#loose"
    />)
    expect((await screen.findByDisplayValue<HTMLInputElement>('x')).value).toBe('x')
  })

  it('keeps the first alternative when no union alternative matches the value', async () => {
    const schema = Schema.object({ pick: Schema.union([Schema.number(), Schema.boolean()]) })
    render(<RowConfigForm
      t={t}
      load={vi.fn(async () => bundleConfig(schema, { pick: 'x' }))}
      save={vi.fn()}
      subject="p#nomatch"
    />)
    expect((await screen.findByRole<HTMLSelectElement>('combobox')).value).toBe('0')
  })

  it('edits the object a root union is switched to', async () => {
    const save = vi.fn(async () => {})
    const schema = Schema.union([Schema.string(), Schema.object({ x: Schema.string() })])
    render(<RowConfigForm
      t={t}
      load={vi.fn(async () => bundleConfig(schema, 'seed'))}
      save={save}
      subject="p#root-union"
    />)
    fireEvent.change(await screen.findByRole<HTMLSelectElement>('combobox'), { target: { value: '1' } })
    fireEvent.change(await screen.findByRole<HTMLInputElement>('textbox'), { target: { value: 'v' } })
    fireEvent.click(screen.getByText(en.rowConfigSave))
    await vi.waitFor(() => { expect(save).toHaveBeenCalledWith({ x: 'v' }) })
  })

  it('drops a read that settles after the form is left', async () => {
    let settle: ((config: BundleRowConfig | null) => void) | undefined
    const load = vi.fn(() => new Promise<BundleRowConfig | null>((resolve) => { settle = resolve }))
    const page = render(<RowConfigForm t={t} load={load} save={vi.fn()} subject="p#gone" />)
    page.unmount()
    settle?.(null)
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('drops a failed read that settles after the form is left', async () => {
    let settle: ((error: Error) => void) | undefined
    const load = vi.fn(() => new Promise<BundleRowConfig | null>((_resolve, reject) => { settle = (error) => { reject(error) } }))
    const page = render(<RowConfigForm t={t} load={load} save={vi.fn()} subject="p#gone-failed" />)
    page.unmount()
    settle?.(new Error('late'))
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('drops a save that settles after the form is left', async () => {
    const lateSave = () => {
      let settleSave: ((failed: boolean) => void) | undefined
      const save = vi.fn(() => new Promise<void>((resolve, reject) => {
        settleSave = (failed) => { if (failed) reject(new Error('late')); else resolve() }
      }))
      return { save, settle: (failed: boolean) => { settleSave?.(failed) } }
    }
    const saved = lateSave()
    const page = render(<RowConfigForm t={t} load={vi.fn(async () => config())} save={saved.save} subject="p#late-ok" />)
    await screen.findByDisplayValue('live')
    fireEvent.click(screen.getByText(en.rowConfigSave))
    page.unmount()
    saved.settle(false)
    await new Promise(resolve => setTimeout(resolve, 0))
    const failed = lateSave()
    const failedPage = render(<RowConfigForm t={t} load={vi.fn(async () => config())} save={failed.save} subject="p#late-failed" />)
    await screen.findByDisplayValue('live')
    fireEvent.click(screen.getByText(en.rowConfigSave))
    failedPage.unmount()
    failed.settle(true)
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(saved.save).toHaveBeenCalledTimes(1)
    expect(failed.save).toHaveBeenCalledTimes(1)
  })

  it('renders a constant-only union as one select over its literals', async () => {
    const schema = Schema.object({ pick: Schema.union(['all', 'tab', 'sidebar']).default('all') })
    render(<RowConfigForm
      t={t}
      load={vi.fn(async () => bundleConfig(schema, {}))}
      save={vi.fn()}
      subject="p#enum"
    />)
    const select = await screen.findByRole<HTMLSelectElement>('combobox')
    expect([...select.options].map(option => option.text)).toEqual(['all', 'tab', 'sidebar'])
    expect(select.value).toBe('0')
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  it('writes the literal a constant-only union selects', async () => {
    const save = vi.fn(async () => {})
    const schema = Schema.object({ pick: Schema.union(['all', 'tab', 'sidebar']).default('all') })
    render(<RowConfigForm
      t={t}
      load={vi.fn(async () => bundleConfig(schema, { pick: 'tab' }))}
      save={save}
      subject="p#enum-write"
    />)
    const select = await screen.findByRole<HTMLSelectElement>('combobox')
    expect(select.value).toBe('1')
    fireEvent.change(select, { target: { value: '2' } })
    fireEvent.click(screen.getByText(en.rowConfigSave))
    await vi.waitFor(() => { expect(save).toHaveBeenCalledWith({ pick: 'sidebar' }) })
  })

  it('keeps the first literal when a constant-only union carries no default', async () => {
    const schema = Schema.object({ pick: Schema.union(['size', 'count', 'name']) })
    render(<RowConfigForm
      t={t}
      load={vi.fn(async () => bundleConfig(schema, {}))}
      save={vi.fn()}
      subject="p#enum-first"
    />)
    expect((await screen.findByRole<HTMLSelectElement>('combobox')).value).toBe('0')
  })
})
