// @vitest-environment jsdom
/** Persistence and toggle behavior of the model availability set. */
import { describe, expect, it, vi } from 'vitest'
import {
  MODEL_AVAILABILITY_STORAGE_KEY, ModelAvailability, modelAvailabilityKey,
} from '../src/client/availability.ts'

interface MemoryStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  raw(): string | null
}

function memory(initial?: string): MemoryStorage {
  let value = initial ?? null
  return {
    getItem: () => value,
    setItem: (_key, next) => { value = next },
    raw: () => value,
  }
}

describe('ModelAvailability', () => {
  it('starts enabled and reads persisted pairs, ignoring malformed entries', () => {
    const storage = memory(JSON.stringify([modelAvailabilityKey('a', 'one'), 3, modelAvailabilityKey('b', 'two')]))
    const availability = new ModelAvailability(storage)
    expect(availability.has('a', 'one')).toBe(false)
    expect(availability.has('b', 'two')).toBe(false)
    expect(availability.has('c', 'three')).toBe(true)
    expect(availability.store.getSnapshot()).toEqual([
      modelAvailabilityKey('a', 'one'), modelAvailabilityKey('b', 'two'),
    ])
  })

  it('treats malformed JSON as an empty set', () => {
    const availability = new ModelAvailability(memory('{'))
    expect(availability.store.getSnapshot()).toEqual([])
    expect(availability.has('a', 'one')).toBe(true)
  })

  it('switches a pair off and on, persisting every change', () => {
    const storage = memory()
    const availability = new ModelAvailability(storage)
    availability.setEnabled('provider', 'model', false)
    expect(availability.has('provider', 'model')).toBe(false)
    expect(JSON.parse(storage.raw()!)).toEqual([modelAvailabilityKey('provider', 'model')])
    availability.setEnabled('provider', 'model', true)
    expect(availability.has('provider', 'model')).toBe(true)
    expect(JSON.parse(storage.raw()!)).toEqual([])
  })

  it('keeps the in-memory switch when storage rejects a write', () => {
    const storage = { getItem: () => null, setItem: vi.fn(() => { throw new Error('quota') }) }
    const availability = new ModelAvailability(storage)
    availability.setEnabled('provider', 'model', false)
    expect(availability.has('provider', 'model')).toBe(false)
    expect(storage.setItem).toHaveBeenCalledOnce()
  })

  it('follows a storage event from another document', () => {
    const storage = memory()
    const availability = new ModelAvailability(storage)
    const detach = availability.attach()
    storage.setItem(MODEL_AVAILABILITY_STORAGE_KEY, JSON.stringify([modelAvailabilityKey('a', 'one')]))
    window.dispatchEvent(new StorageEvent('storage', {
      key: MODEL_AVAILABILITY_STORAGE_KEY,
      newValue: JSON.stringify([modelAvailabilityKey('a', 'one')]),
    }))
    expect(availability.has('a', 'one')).toBe(false)
    detach()
  })
})
