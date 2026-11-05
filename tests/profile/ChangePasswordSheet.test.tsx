import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MotionGlobalConfig } from 'motion/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { ChangePasswordSheet } from '../../src/components/profile/ChangePasswordSheet'
import { ToastProvider } from '../../src/components/toast/ToastProvider'
import { ChangePasswordError, changePassword } from '../../src/service/changePassword'
import type { Me } from '../../src/service/fetchMe'
import { peekLoginNotice, takeLoginNotice } from '../../src/service/loginNotice'
import { clearSession, getSession, setSession } from '../../src/service/session'

vi.mock('../../src/service/changePassword', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/service/changePassword')>()),
  changePassword: vi.fn(),
}))
vi.mock('../../src/service/supabase', () => ({ getSupabase: async () => ({ auth: { signOut: vi.fn().mockResolvedValue({ error: null }) } }) }))
const change = vi.mocked(changePassword)

const ME: Me = {
  id: 'stf-1',
  email: 'sam@silhoufit.dev',
  role: 'staff',
  firstName: 'Sam',
  middleName: null,
  lastName: 'Reyes',
  suffix: null,
  fullName: 'Sam Reyes',
  avatarUrl: null,
  birthday: null,
  gender: null,
  createdAt: '2026-01-15T08:30:00.000Z',
  updatedAt: '2026-01-15T08:30:00.000Z',
}

beforeAll(() => {
  vi.setConfig({ testTimeout: 15000 })
  MotionGlobalConfig.skipAnimations = true
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} }))
})
beforeEach(() => {
  act(() => setSession({ name: 'Sam Reyes', email: ME.email, role: 'staff' }))
})
afterEach(() => {
  vi.clearAllMocks()
  takeLoginNotice()
  act(() => clearSession())
})

function renderSheet(onClose = vi.fn(), me: Me = ME, onSignOut = vi.fn()) {
  render(
    <ToastProvider>
      <ChangePasswordSheet open onClose={onClose} onSignOut={onSignOut} me={me} />
    </ToastProvider>,
  )
  return { onClose, onSignOut }
}

async function fill(user: ReturnType<typeof userEvent.setup>, current: string, next: string, confirm: string) {
  const dialog = screen.getByRole('dialog', { name: 'Change password' })
  if (current) await user.type(within(dialog).getByLabelText('Current password'), current)
  if (next) await user.type(within(dialog).getByLabelText('New password'), next)
  if (confirm) await user.type(within(dialog).getByLabelText('Confirm password'), confirm)
  return dialog
}

const submit = (user: ReturnType<typeof userEvent.setup>) => user.click(screen.getByRole('button', { name: 'Change password' }))

describe('ChangePasswordSheet', () => {
  it('after a reset cannot be closed (no X, Escape or backdrop) and offers Sign out', async () => {
    const { onClose, onSignOut } = renderSheet(vi.fn(), { ...ME, passwordResetRequired: true })
    expect(screen.queryByRole('button', { name: 'Close Change password' })).not.toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    expect(onClose).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(onSignOut).toHaveBeenCalledTimes(1)
  })

  it('is closable with no Sign out button for a normal first login', () => {
    renderSheet()
    expect(screen.getByRole('button', { name: 'Close Change password' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Sign out' })).not.toBeInTheDocument()
  })

  it.each(['admin', 'superadmin', 'customer'] as const)('is closable with no Sign out button for a %s', (role) => {
    renderSheet(vi.fn(), { ...ME, role })
    expect(screen.getByRole('button', { name: 'Close Change password' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Sign out' })).not.toBeInTheDocument()
  })

  it('lists the fields in order with the requirements checklist, as a dialog', () => {
    renderSheet()
    const dialog = screen.getByRole('dialog', { name: 'Change password' })
    const labels = within(dialog).getAllByLabelText(/password$/i, { selector: 'input' }).map((input) => input.id)
    expect(labels).toEqual(['cp-current', 'cp-password', 'cp-confirm'])
    expect(within(dialog).getByRole('group', { name: 'Password requirements' })).toBeInTheDocument()
  })

  it('ticks the checklist as you type and keeps emoji out', async () => {
    const user = userEvent.setup()
    renderSheet()
    const dialog = await fill(user, '', 'Ab😀cd', '')
    expect(within(dialog).getByLabelText('New password')).toHaveValue('Abcd')
    const group = within(dialog).getByRole('group', { name: 'Password requirements' })
    expect(within(group).getByText('One uppercase letter').parentElement).toHaveTextContent('met')
    expect(within(group).getByText('One number').parentElement).toHaveTextContent('not met')
  })

  it('shows what is wrong inline and sends nothing', async () => {
    const user = userEvent.setup()
    renderSheet()
    const dialog = await fill(user, '', 'abc', 'other')
    await submit(user)
    expect(within(dialog).getByText('Enter your current password.')).toBeInTheDocument()
    expect(within(dialog).getByText('Use at least 8 characters.')).toBeInTheDocument()
    expect(within(dialog).getByText("Passwords don't match.")).toBeInTheDocument()
    expect(change).not.toHaveBeenCalled()
  })

  it('requires the new password to differ from the current one', async () => {
    const user = userEvent.setup()
    renderSheet()
    const dialog = await fill(user, 'Same#Pass1', 'Same#Pass1', 'Same#Pass1')
    await submit(user)
    expect(within(dialog).getByText('Choose a password different from your current one.')).toBeInTheDocument()
    expect(change).not.toHaveBeenCalled()
  })

  it('disables the button with a busy state while pending, ignores Escape and a second submit, then signs out with a notice', async () => {
    const user = userEvent.setup()
    let finish: () => void = () => {}
    change.mockReturnValue(new Promise<void>((resolve) => (finish = resolve)))
    const { onClose } = renderSheet()
    await fill(user, 'Old#Pass1', 'New#Pass1x', 'New#Pass1x')
    await submit(user)
    const button = screen.getByRole('button', { name: 'Change password' })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('aria-busy', 'true')
    await user.keyboard('{Enter}{Escape}')
    await user.click(screen.getByRole('button', { name: 'Close Change password' }))
    expect(onClose).not.toHaveBeenCalled()
    expect(change).toHaveBeenCalledTimes(1)
    expect(change).toHaveBeenCalledWith('Old#Pass1', 'New#Pass1x')

    finish()
    expect(await screen.findByText('Password changed. Sign in with your new password.')).toBeInTheDocument()
    expect(getSession()).toBeNull()
    expect(peekLoginNotice()).toBe('password-changed')
  })

  it('puts a wrong current password under that field, and clears it when the field changes', async () => {
    const user = userEvent.setup()
    change.mockRejectedValue(new ChangePasswordError('wrong-password'))
    renderSheet()
    const dialog = await fill(user, 'Old#Pass1', 'New#Pass1x', 'New#Pass1x')
    await submit(user)
    expect(await within(dialog).findByText('That is not your current password. Check it and try again.')).toBeInTheDocument()
    expect(within(dialog).getByLabelText('Current password')).toHaveFocus()
    expect(getSession()).not.toBeNull()
    await user.type(within(dialog).getByLabelText('Current password'), '2')
    expect(within(dialog).queryByText(/not your current password/)).not.toBeInTheDocument()
  })

  it('puts the same-password answer under the new password field', async () => {
    const user = userEvent.setup()
    change.mockRejectedValue(new ChangePasswordError('same'))
    renderSheet()
    const dialog = await fill(user, 'Old#Pass1', 'New#Pass1x', 'New#Pass1x')
    await submit(user)
    expect(await within(dialog).findByText('This is already your password. Choose a different one.')).toBeInTheDocument()
  })

  it.each([
    ['weak', /too weak/, 'Your password was not changed.'],
    ['rate-limit', /Wait a few minutes/, 'Too many attempts.'],
    ['network', /connection dropped/, 'Your password was not changed.'],
    ['server', /went wrong on our side/, 'Your password was not changed.'],
    ['unavailable', /could not complete the request.*contact an administrator/, 'Password changes are unavailable right now.'],
    ['no-password', /signs in with Google \(or another provider\), so there is no password to change here\./, 'There is no password to change.'],
  ] as const)('explains a %s failure in an alert, keeps the form and lets you retry', async (kind, body, title) => {
    const user = userEvent.setup()
    change.mockRejectedValueOnce(new ChangePasswordError(kind)).mockResolvedValueOnce(undefined)
    renderSheet()
    await fill(user, 'Old#Pass1', 'New#Pass1x', 'New#Pass1x')
    await submit(user)
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(title)
    expect(alert).toHaveTextContent(body)
    expect(alert).not.toHaveTextContent(/stack|Error:/)
    expect(screen.getByLabelText('Current password')).toHaveValue('Old#Pass1')
    expect(screen.getByRole('button', { name: 'Change password' })).toBeEnabled()
    await submit(user)
    await waitFor(() => expect(getSession()).toBeNull())
    expect(change).toHaveBeenCalledTimes(2)
  })

  it('offers Sign in again when the session has expired', async () => {
    const user = userEvent.setup()
    change.mockRejectedValue(new ChangePasswordError('unauthorized'))
    renderSheet()
    await fill(user, 'Old#Pass1', 'New#Pass1x', 'New#Pass1x')
    await submit(user)
    expect(await screen.findByRole('alert')).toHaveTextContent('Your session has expired.')
    await user.click(screen.getByRole('button', { name: 'Sign in again' }))
    expect(getSession()).toBeNull()
    expect(peekLoginNotice()).toBeNull()
  })

  it('closes with Escape when idle', async () => {
    const user = userEvent.setup()
    const { onClose } = renderSheet()
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
