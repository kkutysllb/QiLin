// @vitest-environment jsdom
/** The workspace model manager renders deployed model cards and drives availability. */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createSnapshotStore } from '@qilin-agent/client-store'
import type { ModelCatalogState } from '../src/client/catalog.ts'
import { modelAvailabilityKey } from '../src/client/availability.ts'
import { ModelManagerPage } from '../src/client/ModelManagerPage.tsx'
import { zh } from '../src/client/locales.ts'

afterEach(() => { cleanup() })

function catalogState(): ModelCatalogState {
  return {
    status: 'ready',
    error: null,
    value: {
      default: { provider: 'deepseek-official', model: 'deepseek-flash' },
      routableProviders: ['deepseek-official'],
      failures: [],
      groups: [{
        id: 'deepseek-official',
        name: 'DeepSeek',
        models: [
          {
            id: 'deepseek-flash',
            name: 'DeepSeek-V4-Flash',
            description: 'Fast and economical.',
            contextWindow: 128_000,
            inputModalities: ['text'],
          },
          {
            id: 'deepseek-v4-pro',
            name: 'DeepSeek-V4-Pro',
            contextWindow: 1_000_000,
            inputModalities: ['text', 'image'],
          },
        ],
      }],
    },
  }
}

function bench(state: ModelCatalogState = catalogState(), disabled: readonly string[] = []) {
  const catalog = createSnapshotStore<ModelCatalogState>(state)
  const availability = createSnapshotStore<readonly string[]>(disabled)
  const load = vi.fn()
  const setEnabled = vi.fn()
  const pageProps = {
    t: (key: keyof typeof zh) => zh[key],
    load,
    setEnabled,
    useCatalog: <S,>(selector: (state: ModelCatalogState) => S): S => selector(catalog.getSnapshot()),
    useAvailability: <S,>(selector: (keys: readonly string[]) => S): S => selector(availability.getSnapshot()),
  }
  const view = render(<ModelManagerPage {...pageProps} />)
  return { view, catalog, availability, load, setEnabled }
}

describe('ModelManagerPage', () => {
  it('renders deployed model cards with provider, ids, context, and input capability', () => {
    const { load } = bench()
    expect(load).toHaveBeenCalled()
    expect(screen.getByRole('heading', { name: '模型管理' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'DeepSeek' })).toBeTruthy()
    expect(screen.getByText('deepseek-flash')).toBeTruthy()
    expect(screen.getByText('128K')).toBeTruthy()
    expect(screen.getByText('1M')).toBeTruthy()
    expect(screen.getByText('文本 · 图像')).toBeTruthy()
    expect(screen.getAllByRole('switch')).toHaveLength(2)
  })

  it('switches a model off through the shared availability callback', () => {
    const { setEnabled } = bench()
    const [flash] = screen.getAllByRole('switch')
    fireEvent.click(flash!)
    expect(setEnabled).toHaveBeenCalledWith('deepseek-official', 'deepseek-flash', false)
  })

  it('renders a persisted disabled model as off without hiding its card', () => {
    const key = modelAvailabilityKey('deepseek-official', 'deepseek-flash')
    const { view } = bench(catalogState(), [key])
    expect(view.container.querySelector('[data-model-enabled="false"]')).not.toBeNull()
    expect(screen.getByText('已停用')).toBeTruthy()
    expect(screen.getAllByRole('switch')[0]?.getAttribute('aria-checked')).toBe('false')
  })

  it('renders the empty and error states', () => {
    bench({ ...catalogState(), status: 'ready', value: {
      default: { provider: 'deepseek-official', model: 'deepseek-flash' },
      routableProviders: [], failures: [], groups: [],
    } })
    expect(screen.getByText('暂无已部署模型。')).toBeTruthy()
    cleanup()
    bench({ ...catalogState(), status: 'error', error: 'catalog offline' })
    expect(screen.getByRole('alert').textContent).toContain('catalog offline')
  })
})
