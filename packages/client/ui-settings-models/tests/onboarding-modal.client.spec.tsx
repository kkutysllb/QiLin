// @vitest-environment jsdom
/**
 * The shared onboarding chrome every step registers into: the application root
 * stays inert while the blocking step is open, and a step without a form
 * control lands focus on its own title.
 */
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { OnboardingModal } from '../src/client/OnboardingModal.tsx'

afterEach(() => {
  cleanup()
  document.getElementById('root')?.remove()
})

/** Mount the application root the modal keeps inert, as the shell does. */
function appRoot(): HTMLElement {
  const root = document.createElement('div')
  root.id = 'root'
  document.body.append(root)
  return root
}

describe('OnboardingModal', () => {
  it('keeps the application root inert only while the step is open', () => {
    const root = appRoot()
    const view = render(<OnboardingModal title="Welcome"><p>step body</p></OnboardingModal>)

    expect(root.inert).toBe(true)
    expect(screen.getByText('step body')).toBeTruthy()

    view.unmount()
    // The step restores whatever the root carried before it opened.
    expect(root.inert).not.toBe(true)
  })

  it('lands focus on the title for a step that has no form control', () => {
    const view = render(
      <OnboardingModal title="Choose a model" focusTitle><p>No field yet</p></OnboardingModal>,
    )
    const title = screen.getByRole('heading', { name: 'Choose a model' })

    expect(document.activeElement).toBe(title)
    // A programmatic focus target must not join the tab order.
    expect(title.getAttribute('tabindex')).toBe('-1')

    view.unmount()
  })

  it('leaves the first control to take focus when the step supplies one', () => {
    render(<OnboardingModal title="Choose a model"><input aria-label="API key" /></OnboardingModal>)

    expect(document.activeElement).toBe(screen.getByLabelText('API key'))
    // Without the title-focus request the heading stays out of the focus order.
    expect(screen.getByRole('heading', { name: 'Choose a model' }).getAttribute('tabindex')).toBeNull()
  })
})
