// @vitest-environment jsdom
/**
 * Masked credential presentation: the masked form is what renders until the
 * reveal control is used, and a value without control copy keeps no control.
 * Queries stay inside the rendered container, the convention of this package's
 * component specs.
 */
import { describe, expect, it } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import { SecretText } from '../src/SecretText.tsx'

const LABELS = { reveal: 'Show secret', hide: 'Hide secret' }
const RAW = 'ghp_' + 'A1'.repeat(18)
const MASKED = 'ghp_A1A1' + '*'.repeat(32)

describe('SecretText', () => {
  it('renders the masked form until the reveal control is used', () => {
    const { container } = render(<SecretText masked={MASKED} raw={RAW} labels={LABELS} />)
    const secret = container.querySelector('[data-secret]')!
    const toggle = container.querySelector('button')!
    expect(secret.textContent).toBe(MASKED)
    expect(toggle.getAttribute('aria-label')).toBe('Show secret')
    expect(toggle.getAttribute('aria-pressed')).toBe('false')

    fireEvent.click(toggle)
    expect(secret.textContent).toBe(RAW)
    expect(toggle.getAttribute('aria-label')).toBe('Hide secret')
    expect(toggle.getAttribute('aria-pressed')).toBe('true')

    fireEvent.click(toggle)
    expect(secret.textContent).toBe(MASKED)
    expect(toggle.getAttribute('aria-pressed')).toBe('false')
  })

  it('keeps a value masked when the text offers no control', () => {
    const { container } = render(<SecretText masked={MASKED} raw={RAW} />)
    expect(container.querySelector('[data-secret]')?.textContent).toBe(MASKED)
    expect(container.querySelector('button')).toBeNull()
  })

  it('starts masked again when a different value takes the same position', () => {
    const { container, rerender } = render(<SecretText masked={MASKED} raw={RAW} labels={LABELS} />)
    fireEvent.click(container.querySelector('button')!)
    expect(container.querySelector('[data-secret]')?.textContent).toBe(RAW)

    const other = 'sk-' + 'b'.repeat(19) + '1'
    rerender(<SecretText masked={'sk-bbbbbbbb' + '*'.repeat(15)} raw={other} labels={LABELS} />)
    expect(container.textContent).toContain('sk-bbbbbbbb')
    expect(container.textContent).not.toContain(other)
  })

  it('renders a form that starts and ends masked', () => {
    const { container } = render(<SecretText masked={'******'} raw={'s3cret'} />)
    expect(container.querySelector('[data-secret]')?.textContent).toBe('******')
  })
})
