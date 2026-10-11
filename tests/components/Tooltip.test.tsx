import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MotionGlobalConfig } from 'motion/react'
import { beforeAll, describe, expect, it } from 'vitest'
import { Tooltip } from '../../src/components/ui/Tooltip'

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true
})

function setup(describe = false) {
  render(
    <Tooltip label="Wishlist (2 saved)" describe={describe}>
      <button type="button">Wishlist</button>
    </Tooltip>,
  )
  return screen.getByRole('button', { name: 'Wishlist' })
}

describe('Tooltip', () => {
  it('shows after a short delay on mouse hover and hides on leave', async () => {
    const user = userEvent.setup()
    const button = setup()
    await user.hover(button)
    expect(screen.queryByRole('tooltip')).toBeNull() // not at once
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Wishlist (2 saved)')

    await user.unhover(button)
    await waitFor(() => expect(screen.queryByRole('tooltip')).toBeNull())
  })

  it('shows at once on keyboard focus and hides on blur', async () => {
    const user = userEvent.setup()
    setup()
    await user.tab()
    expect(screen.getByRole('tooltip')).toHaveTextContent('Wishlist (2 saved)')
    await user.tab()
    await waitFor(() => expect(screen.queryByRole('tooltip')).toBeNull())
  })

  it('hides on Escape', async () => {
    const user = userEvent.setup()
    setup()
    await user.tab()
    expect(screen.getByRole('tooltip')).toBeInTheDocument()
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('tooltip')).toBeNull())
  })

  it('never opens for a touch pointer or a click focus', async () => {
    const user = userEvent.setup()
    const button = setup()
    fireEvent.pointerOver(button, { pointerType: 'touch' })
    fireEvent.pointerEnter(button, { pointerType: 'touch' })
    await new Promise((resolve) => setTimeout(resolve, 450))
    expect(screen.queryByRole('tooltip')).toBeNull()

    await user.click(button) // a pointer click is not keyboard focus
    expect(screen.queryByRole('tooltip')).toBeNull()
  })

  it('is not the accessible name, and describes the control only when asked', async () => {
    const user = userEvent.setup()
    const { unmount } = render(<span />)
    unmount()
    const button = setup()
    await user.tab()
    expect(screen.getByRole('button', { name: 'Wishlist' })).toBe(button)
    expect(button.parentElement).not.toHaveAttribute('aria-describedby')
  })

  it('sets aria-describedby on the wrapper with describe', async () => {
    const user = userEvent.setup()
    const button = setup(true)
    await user.tab()
    expect(button.parentElement).toHaveAttribute('aria-describedby', screen.getByRole('tooltip').id)
  })
})
