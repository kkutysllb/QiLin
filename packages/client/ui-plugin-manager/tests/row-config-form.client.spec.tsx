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
}).toJSON() as unknown as BundleRowConfig['schema']

const VALUES = { name: 'live', count: 5, on: true, tags: ['x'], nested: { deep: 'd' } }

function config(): BundleRowConfig {
  return { schema: SCHEMA_JSON, values: VALUES as unknown as BundleRowConfig['values'] }
}

function bundleConfig(schema: unknown, values: unknown): BundleRowConfig {
  return { schema: schema as BundleRowConfig['schema'], values: values as BundleRowConfig['values'] }
}

describe('RowConfigForm', () => {
  it('renders nothing while the row offers no schema', async () => {
    const load = vi.fn(async () => null)
    const { container } = render(<RowConfigForm t={t} load={load} save={vi.fn()} subject="p#r" />)
    await vi.waitFor(() => expect(container.textContent).toBe(''))
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
    expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(true)
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
    await vi.waitFor(() => expect(save).toHaveBeenCalledWith({
      name: 'edit', count: 5, on: false, tags: ['x', undefined], nested: { deep: 'd' },
    }))
    expect((await screen.findByRole('status')).textContent).toBe(en.rowConfigSaved)
  })

  it('keeps the staged edits and shows the failure line when the save is refused', async () => {
    const save = vi.fn(async (_values: Record<string, unknown>) => { throw new Error('refused') })
    render(<RowConfigForm t={t} load={vi.fn(async () => config())} save={save} subject="p#r" />)
    fireEvent.change(await screen.findByDisplayValue('live'), { target: { value: 'edit' } })
    fireEvent.click(screen.getByText(en.rowConfigSave))
    expect((await screen.findByRole('alert')).textContent).toBe(en.rowConfigSaveFailed)
    fireEvent.click(screen.getByText(en.rowConfigSave))
    await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(2))
    expect(save.mock.calls[1]?.[0]).toEqual({ ...VALUES, name: 'edit' })
  })

  it('rereads when the subject changes', async () => {
    const load = vi.fn(async () => config())
    const page = render(<RowConfigForm t={t} load={load} save={vi.fn()} subject="p#one" />)
    await screen.findByDisplayValue('live')
    page.rerender(<RowConfigForm t={t} load={load} save={vi.fn()} subject="p#two" />)
    await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(2))
  })

  it('edits numbers, textarea strings, nested leaves, and union alternatives', async () => {
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
    fireEvent.change(await screen.findByDisplayValue('1'), { target: { value: '' } })
    fireEvent.change(screen.getByDisplayValue('b'), { target: { value: 'writer' } })
    fireEvent.change(screen.getByDisplayValue('l'), { target: { value: 'leaf2' } })
    fireEvent.change(screen.getByDisplayValue('x'), { target: { value: '7' } })
    fireEvent.click(screen.getByText(en.rowConfigSave))
    await vi.waitFor(() => expect(save).toHaveBeenCalledWith({
      n: undefined, bio: 'writer', pick: '7', nested: { deep: { leaf: 'leaf2' } },
    }))
  })

  it('keeps editing after the root schema is a leaf', async () => {
    const save = vi.fn(async () => {})
    render(<RowConfigForm
      t={t}
      load={vi.fn(async () => bundleConfig(Schema.string(), {}))}
      save={save}
      subject="p#leaf"
    />)
    fireEvent.change(await screen.findByRole('textbox'), { target: { value: 'solo' } })
    fireEvent.click(screen.getByText(en.rowConfigSave))
    await vi.waitFor(() => expect(save).toHaveBeenCalledWith('solo' as unknown as Record<string, unknown>))
  })
})
