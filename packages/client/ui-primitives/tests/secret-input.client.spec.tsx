// @vitest-environment jsdom
/**
 * Editable masked credential: the draft stays masked until the reveal control
 * is used, a changed draft starts masked again, and an empty draft carries no
 * control. Queries stay inside the rendered container.
 */
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import { SecretInput } from '../src/SecretInput.tsx'

const LABELS = { reveal: 'Show secret', hide: 'Hide secret' }
const DRAFT = 'sk-live-1234'

describe('SecretInput', () => {
  it('keeps the draft masked until the reveal control is used', () => {
    const { container } = render(
      <SecretInput value={DRAFT} labels={LABELS} onChange={() => {}} />,
    )
    const input = container.querySelector('input')!
    const toggle = container.querySelector('button')!
    expect(input.type).toBe('password')
    expect(input.value).toBe(DRAFT)
    expect(toggle.getAttribute('aria-label')).toBe('Show secret')
    expect(toggle.getAttribute('aria-pressed')).toBe('false')

    fireEvent.click(toggle)
    expect(input.type).toBe('text')
    expect(toggle.getAttribute('aria-label')).toBe('Hide secret')
    expect(toggle.getAttribute('aria-pressed')).toBe('true')

    fireEvent.click(toggle)
    expect(input.type).toBe('password')
  })

  it('drops the reveal control on an empty draft and re-masks an edited one', () => {
    const onChange = vi.fn()
    const { container, rerender } = render(
      <SecretInput value={DRAFT} labels={LABELS} onChange={onChange} />,
    )
    fireEvent.click(container.querySelector('button')!)
    expect(container.querySelector('input')!.type).toBe('text')

    fireEvent.change(container.querySelector('input')!, { target: { value: 'sk-live-5678' } })
    expect(onChange).toHaveBeenCalledOnce()
    rerender(<SecretInput value="sk-live-5678" labels={LABELS} onChange={onChange} />)
    expect(container.querySelector('input')!.type).toBe('password')

    rerender(<SecretInput value="" labels={LABELS} onChange={onChange} />)
    expect(container.querySelector('button')).toBeNull()
  })

  it('takes a draft without a change handler', () => {
    const { container } = render(<SecretInput value={DRAFT} labels={LABELS} readOnly />)
    fireEvent.change(container.querySelector('input')!, { target: { value: 'other' } })
    expect(container.querySelector('input')!.value).toBe(DRAFT)
  })

  it('disables the control with the input and passes the render site classes through', () => {
    const { container } = render(
      <SecretInput
        value={DRAFT}
        labels={LABELS}
        disabled
        inputClassName="field-input"
        wrapperClassName="field-wrapper"
        onChange={() => {}}
      />,
    )
    expect(container.querySelector('span')!.className).toContain('field-wrapper')
    expect(container.querySelector('input')!.className).toBe('field-input')
    expect(container.querySelector('button')!.hasAttribute('disabled')).toBe(true)
  })
})
