import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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

  it('keeps the text box a rounded box (36px with a mouse, 44px on touch), with the paperclip and Send both outside it', () => {
    render(<Composer onSend={vi.fn()} sending={false} attachments />)
    const pill = screen.getByRole('textbox', { name: 'Message' }).parentElement!
    expect(pill).toHaveClass('rounded-xl', 'min-h-9', 'pointer-coarse:min-h-11', 'focus-within:outline-2')
    expect(pill).not.toHaveClass('rounded-full')
    expect(pill).not.toContainElement(screen.getByRole('button', { name: 'Send message' }))
    expect(pill).not.toContainElement(screen.getByRole('button', { name: 'Attach photos or videos' }))
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

  it('warns while the person types offensive language, and hides it when sent', async () => {
    const user = userEvent.setup()
    const onSend = vi.fn()
    render(<Composer onSend={onSend} sending={false} />)
    const field = screen.getByRole('textbox', { name: 'Message' })
    await user.type(field, 'you are stupid')
    expect(screen.getByRole('status')).toHaveTextContent("Please don't use profanity or offensive language")
    expect(field).toHaveAccessibleDescription(/profanity/)
    await user.type(field, '{Enter}')
    expect(onSend).toHaveBeenCalledExactlyOnceWith('you are ******')
  })

  it('shows no warning while the message is clean', async () => {
    const user = userEvent.setup()
    render(<Composer onSend={vi.fn()} sending={false} />)
    await user.type(screen.getByRole('textbox', { name: 'Message' }), 'Is it in stock?')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
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
    expect(field).toHaveAttribute('placeholder', 'Messaging is blocked')
    expect(screen.queryByText(/ \/ 2000/)).not.toBeInTheDocument()
  })
})

describe('Composer attachments', () => {
  beforeEach(() => {
    let n = 0
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => `blob:preview-${n++}`), revokeObjectURL: vi.fn() }))
  })
  afterEach(() => vi.unstubAllGlobals())

  const png = (name = 'a.png') => new File(['x'], name, { type: 'image/png' })
  function withFiles() {
    const onSend = vi.fn()
    render(<Composer onSend={onSend} sending={false} attachments />)
    return { onSend, input: screen.getByLabelText('Choose photos or videos to attach') as HTMLInputElement, send: screen.getByRole('button', { name: 'Send message' }) }
  }

  it('shows no paperclip unless attachments are on', () => {
    render(<Composer onSend={vi.fn()} sending={false} />)
    expect(screen.queryByRole('button', { name: 'Attach photos or videos' })).toBeNull()
  })

  it('enables Send for an attachment alone, previews it, and sends the files with empty text', async () => {
    const user = userEvent.setup()
    const { onSend, input, send } = withFiles()
    expect(send).toBeDisabled()
    const file = png()
    await user.upload(input, file)
    expect(screen.getByAltText('a.png')).toBeInTheDocument()
    expect(send).toBeEnabled()
    await user.click(send)
    expect(onSend).toHaveBeenCalledExactlyOnceWith('', [file])
    expect(screen.queryByAltText('a.png')).toBeNull()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview-0')
  })

  it('removes a file with its button and returns focus to the paperclip', async () => {
    const user = userEvent.setup()
    const { input } = withFiles()
    await user.upload(input, png())
    await user.click(screen.getByRole('button', { name: 'Remove a.png' }))
    expect(screen.queryByAltText('a.png')).toBeNull()
    expect(screen.getByRole('button', { name: 'Attach photos or videos' })).toHaveFocus()
  })

  it('shows a video as a named tile', async () => {
    const user = userEvent.setup()
    const { input } = withFiles()
    await user.upload(input, new File(['x'], 'clip.mp4', { type: 'video/mp4' }))
    expect(screen.getByText('clip.mp4')).toBeInTheDocument()
  })

  it('refuses a wrong type, an oversized file and a sixth file with a note saying why and what to do', async () => {
    const user = userEvent.setup({ applyAccept: false })
    const { input } = withFiles()
    await user.upload(input, new File(['x'], 'doc.pdf', { type: 'application/pdf' }))
    expect(screen.getByRole('status')).toHaveTextContent("doc.pdf wasn't added. Only JPG")
    const big = new File(['x'], 'big.mp4', { type: 'video/mp4' })
    Object.defineProperty(big, 'size', { value: 26 * 1024 * 1024 })
    await user.upload(input, big)
    expect(screen.getByRole('status')).toHaveTextContent('limit is 25 MB')
    await user.upload(input, [1, 2, 3, 4, 5, 6].map((n) => png(`p${n}.png`)))
    expect(screen.getAllByRole('listitem')).toHaveLength(5)
    expect(screen.getByRole('status')).toHaveTextContent("p6.png wasn't added. A message holds 5 files")
  })
})
