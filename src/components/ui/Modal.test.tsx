import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MotionGlobalConfig } from 'motion/react'
import { useState } from 'react'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { Modal } from './Modal'

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    addEventListener() {},
    removeEventListener() {},
  }))
})

function Harness() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button onClick={() => setOpen(true)}>Open it</button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Test dialog"
        footer={
          <>
            <button>First</button>
            <button>Last</button>
          </>
        }
      >
        <p>Body text</p>
      </Modal>
    </>
  )
}

async function openModal(user: ReturnType<typeof userEvent.setup>) {
  render(<Harness />)
  const opener = screen.getByRole('button', { name: 'Open it' })
  await user.click(opener)
  return { opener, dialog: await screen.findByRole('dialog', { name: 'Test dialog' }) }
}

describe('Modal', () => {
  it('is a labelled modal dialog and moves focus into it', async () => {
    const { dialog } = await openModal(userEvent.setup())
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveAccessibleName('Test dialog')
    expect(dialog).toHaveFocus()
  })

  it('traps Tab and Shift+Tab inside the dialog', async () => {
    const user = userEvent.setup()
    await openModal(user)
    const close = screen.getByRole('button', { name: 'Close Test dialog' })
    const region = screen.getByRole('region', { name: 'Test dialog text' })
    const first = screen.getByRole('button', { name: 'First' })
    const last = screen.getByRole('button', { name: 'Last' })

    await user.tab()
    expect(close).toHaveFocus()
    await user.tab()
    expect(region).toHaveFocus()
    await user.tab()
    expect(first).toHaveFocus()
    await user.tab()
    expect(last).toHaveFocus()
    await user.tab()
    expect(close).toHaveFocus()
    await user.tab({ shift: true })
    expect(last).toHaveFocus()
  })

  it('closes on Escape and returns focus to the opener', async () => {
    const user = userEvent.setup()
    const { opener } = await openModal(user)
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(opener).toHaveFocus()
  })

  it('closes from the close button and the backdrop but not from inside the panel', async () => {
    const user = userEvent.setup()
    const { dialog } = await openModal(user)
    await user.click(screen.getByText('Body text'))
    expect(dialog).toBeInTheDocument()

    fireEvent.pointerDown(dialog.previousElementSibling as Element)
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: 'Open it' }))
    await user.click(await screen.findByRole('button', { name: 'Close Test dialog' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('locks body scroll while open and restores it on close', async () => {
    const user = userEvent.setup()
    document.body.style.overflow = 'auto'
    await openModal(user)
    expect(document.body.style.overflow).toBe('hidden')
    await user.keyboard('{Escape}')
    await waitFor(() => expect(document.body.style.overflow).toBe('auto'))
    document.body.style.overflow = ''
  })
})
