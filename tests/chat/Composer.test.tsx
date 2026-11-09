import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Composer } from '../../src/components/chat/Composer'

function setup(props: Partial<{ sending: boolean }> = {}) {
  const onSend = vi.fn()
  render(<Composer onSend={onSend} sending={false} {...props} />)
  return { onSend, field: screen.getByRole('textbox', { name: 'Message' }), send: screen.getByRole('button', { name: 'Send message' }) }
}

describe('Composer', () => {
  it('sends on Enter and clears the box', async () => {
    const user = userEvent.setup()
    const { onSend, field } = setup()
    await user.type(field, '  Hello there  {Enter}')
    expect(onSend).toHaveBeenCalledExactlyOnceWith('Hello there')
    expect(field).toHaveValue('')
  })

  it('starts a new line on Shift+Enter instead of sending', async () => {
    const user = userEvent.setup()
    const { onSend, field } = setup()
    await user.type(field, 'one{Shift>}{Enter}{/Shift}two')
    expect(onSend).not.toHaveBeenCalled()
    expect(field).toHaveValue('one\ntwo')
  })

  it('sends with the button, and shows the count out of 2000', async () => {
    const user = userEvent.setup()
    const { onSend, field, send } = setup()
    expect(send).toBeDisabled()
    await user.type(field, 'Hi!')
    expect(screen.getByText('3 / 2000')).toBeInTheDocument()
    await user.click(send)
    expect(onSend).toHaveBeenCalledWith('Hi!')
  })

  it('never sends only spaces', async () => {
    const user = userEvent.setup()
    const { onSend, field } = setup()
    await user.type(field, '   {Enter}')
    expect(onSend).not.toHaveBeenCalled()
  })

  it('caps the text at 2000 characters', () => {
    const { field } = setup()
    expect(field).toHaveAttribute('maxlength', '2000')
  })

  it('waits while a message is sending, so one press cannot send twice', async () => {
    const user = userEvent.setup()
    const { onSend, field, send } = setup({ sending: true })
    await user.type(field, 'Again{Enter}')
    expect(send).toBeDisabled()
    expect(onSend).not.toHaveBeenCalled()
  })

  it('sends the masked text, reports it, and shows a gentle note', async () => {
    const user = userEvent.setup()
    const onSend = vi.fn()
    const onMasked = vi.fn()
    render(<Composer onSend={onSend} onMasked={onMasked} sending={false} />)
    const field = screen.getByRole('textbox', { name: 'Message' })
    await user.type(field, 'you are a bitch{Enter}')
    expect(onSend).toHaveBeenCalledExactlyOnceWith('you are a *****')
    expect(onMasked).toHaveBeenCalledExactlyOnceWith('you are a *****')
    expect(field).toHaveValue('')
    expect(screen.getByRole('status')).toHaveTextContent('Some words were hidden')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('does not report or note a clean message', async () => {
    const user = userEvent.setup()
    const onMasked = vi.fn()
    const onSend = vi.fn()
    render(<Composer onSend={onSend} onMasked={onMasked} sending={false} />)
    await user.type(screen.getByRole('textbox', { name: 'Message' }), 'Is the black dress in medium?{Enter}')
    expect(onSend).toHaveBeenCalledExactlyOnceWith('Is the black dress in medium?')
    expect(onMasked).not.toHaveBeenCalled()
    expect(screen.queryByText(/hidden/)).not.toBeInTheDocument()
  })

  it('is disabled with the reason when messaging is blocked', () => {
    render(<Composer onSend={vi.fn()} sending={false} disabledReason="Your messaging has been blocked by staff. Contact support to appeal." />)
    const field = screen.getByRole('textbox', { name: 'Message' })
    expect(field).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Send message' })).toBeDisabled()
    expect(field).toHaveAccessibleDescription(/blocked by staff/)
  })
})
