import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { EditProfileForm } from '../../src/components/profile/EditProfileForm'
import { ToastProvider } from '../../src/components/toast/ToastProvider'
import type { Me } from '../../src/service/fetchMe'
import { updateMe, UpdateMeError } from '../../src/service/updateMe'

vi.mock('../../src/service/updateMe', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/service/updateMe')>()),
  updateMe: vi.fn(),
}))
const update = vi.mocked(updateMe)

const ME: Me = {
  id: 'user-1',
  email: 'anne@example.com',
  role: 'customer',
  firstName: 'Anne',
  middleName: null,
  lastName: 'Santos',
  suffix: null,
  fullName: 'Anne Santos',
  avatarUrl: null,
  birthday: '1995-05-15',
  gender: 'female',
  createdAt: '2026-01-15T08:30:00.000Z',
  updatedAt: '2026-01-15T08:30:00.000Z',
}

afterEach(() => vi.clearAllMocks())

function setup() {
  const onSaved = vi.fn()
  const onCancel = vi.fn()
  const onUnauthorized = vi.fn()
  render(
    <ToastProvider>
      <EditProfileForm me={ME} onSaved={onSaved} onCancel={onCancel} onUnauthorized={onUnauthorized} />
    </ToastProvider>,
  )
  return { onSaved, onCancel, onUnauthorized, user: userEvent.setup() }
}
const save = () => screen.getByRole('button', { name: 'Save changes' })

describe('EditProfileForm', () => {
  it('pre-fills from the profile and keeps Save off until something changes', () => {
    setup()
    expect(screen.getByLabelText('First name')).toHaveValue('Anne')
    expect(screen.getByLabelText('Last name')).toHaveValue('Santos')
    expect(screen.getByLabelText('Birthday (optional)')).toHaveValue('1995-05-15')
    expect(screen.getByRole('combobox', { name: /gender/i })).toHaveTextContent('Female')
    expect(save()).toBeDisabled()
  })

  it('sends only the changed fields and hands the saved profile to onSaved', async () => {
    const saved = { ...ME, lastName: 'Reyes', fullName: 'Anne Reyes' }
    update.mockResolvedValue(saved)
    const { user, onSaved } = setup()
    const last = screen.getByLabelText('Last name')
    await user.clear(last)
    await user.type(last, '  Reyes ')
    await user.click(save())
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(saved))
    expect(update).toHaveBeenCalledWith({ lastName: 'Reyes' })
  })

  it('sends null for a cleared optional field', async () => {
    update.mockResolvedValue(ME)
    const { user } = setup()
    await user.clear(screen.getByLabelText('Birthday (optional)'))
    await user.click(save())
    await waitFor(() => expect(update).toHaveBeenCalledWith({ birthday: null }))
  })

  it('shows inline errors for a missing or malformed name and sends nothing', async () => {
    const { user } = setup()
    const first = screen.getByLabelText('First name')
    await user.clear(first)
    await user.tab()
    expect(await screen.findByText('First name is required.')).toBeInTheDocument()
    expect(first).toHaveAttribute('aria-invalid', 'true')

    await user.type(first, 'A1')
    expect(screen.getByText(/can only contain letters/i)).toBeInTheDocument()
    await user.click(save())
    expect(update).not.toHaveBeenCalled()
    expect(first).toHaveFocus()
  })

  it('rejects a word longer than 30 letters', async () => {
    const { user } = setup()
    const first = screen.getByLabelText('First name')
    await user.clear(first)
    await user.type(first, 'A'.repeat(31))
    await user.tab()
    expect(screen.getByText(/at most 30 letters/i)).toBeInTheDocument()
  })

  it('rejects emoji in the name and suffix fields inline and sends nothing', async () => {
    const { user } = setup()
    const middle = screen.getByLabelText('Middle name (optional)')
    await user.type(middle, 'Mae😀')
    await user.type(screen.getByLabelText('Suffix (optional)'), 'Jr😀')
    await user.click(save())
    expect(screen.getAllByText("Emoji aren't allowed in this field.")).toHaveLength(2)
    expect(middle).toHaveFocus()
    expect(update).not.toHaveBeenCalled()
  })

  it('counts the suffix and caps it at 20', async () => {
    const { user } = setup()
    const suffix = screen.getByLabelText('Suffix (optional)')
    await user.type(suffix, 'x'.repeat(25))
    expect(suffix).toHaveValue('x'.repeat(20))
    expect(screen.getByText('20/20')).toBeInTheDocument()
  })

  it('flags a future birthday', async () => {
    const { user } = setup()
    const birthday = screen.getByLabelText('Birthday (optional)')
    expect(birthday).toHaveAttribute('max')
    await user.clear(birthday)
    await user.type(birthday, '2999-01-01')
    await user.tab()
    expect(await screen.findByText(/can’t be in the future/i)).toBeInTheDocument()
  })

  it('disables Save while the request is pending, so it cannot be sent twice', async () => {
    let finish: (me: Me) => void = () => {}
    update.mockReturnValue(new Promise((resolve) => (finish = resolve)))
    const { user } = setup()
    await user.type(screen.getByLabelText('Suffix (optional)'), 'Jr')
    await user.click(save())
    expect(save()).toBeDisabled()
    await user.click(save())
    expect(update).toHaveBeenCalledTimes(1)
    finish(ME)
  })

  it('shows the server message inline when the profile is rejected', async () => {
    update.mockRejectedValue(new UpdateMeError('invalid', 'suffix must be shorter'))
    const { user, onSaved } = setup()
    await user.type(screen.getByLabelText('Suffix (optional)'), 'Jr')
    await user.click(save())
    expect(await screen.findByRole('alert')).toHaveTextContent('suffix must be shorter')
    expect(onSaved).not.toHaveBeenCalled()
    expect(save()).toBeEnabled()
  })

  it('hands an expired session to the page', async () => {
    update.mockRejectedValue(new UpdateMeError('unauthorized'))
    const { user, onUnauthorized } = setup()
    await user.type(screen.getByLabelText('Suffix (optional)'), 'Jr')
    await user.click(save())
    await waitFor(() => expect(onUnauthorized).toHaveBeenCalled())
  })

  it('clears the server message as soon as a field is edited', async () => {
    update.mockRejectedValue(new UpdateMeError('invalid', 'suffix must be shorter'))
    const { user } = setup()
    await user.type(screen.getByLabelText('Suffix (optional)'), 'Jr')
    await user.click(save())
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    await user.type(screen.getByLabelText('Suffix (optional)'), 'x')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows a network failure inline with a Try again that sends the save again', async () => {
    update.mockRejectedValueOnce(new UpdateMeError('network')).mockResolvedValueOnce(ME)
    const { user, onSaved } = setup()
    await user.type(screen.getByLabelText('Suffix (optional)'), 'Jr')
    await user.click(save())
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/connection dropped/i)
    await user.click(within(alert).getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(update).toHaveBeenCalledTimes(2)
  })

  it('offers no Try again when no profile is saved for the account', async () => {
    update.mockRejectedValue(new UpdateMeError('not-found'))
    const { user } = setup()
    await user.type(screen.getByLabelText('Suffix (optional)'), 'Jr')
    await user.click(save())
    expect(await screen.findByRole('alert')).toHaveTextContent(/No profile is saved/i)
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument()
  })

  it('disables Cancel and reports the pending state while a save is in flight', async () => {
    let finish: (me: Me) => void = () => {}
    update.mockReturnValue(new Promise((resolve) => (finish = resolve)))
    const onPendingChange = vi.fn()
    render(
      <ToastProvider>
        <EditProfileForm me={ME} onSaved={vi.fn()} onCancel={vi.fn()} onUnauthorized={vi.fn()} onPendingChange={onPendingChange} />
      </ToastProvider>,
    )
    const user = userEvent.setup()
    await user.type(screen.getByLabelText('Suffix (optional)'), 'Jr')
    await user.click(save())
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
    expect(onPendingChange).toHaveBeenLastCalledWith(true)
    finish(ME)
  })

  it('makes the gender select at least 44px tall', () => {
    setup()
    expect(screen.getByRole('combobox', { name: /gender/i })).toHaveClass('min-h-11!')
  })

  it('cancels without saving', async () => {
    const { user, onCancel } = setup()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalled()
    expect(update).not.toHaveBeenCalled()
  })
})
