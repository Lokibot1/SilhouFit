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
})
