import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { getAccounts } from '../../src/service/accountStore'
import { archiveStaffAccountApi, createStaffAccountApi, listStaffAccounts, resetStaffPasswordApi, restoreStaffAccountApi, StaffApiError } from '../../src/service/staffApi'
import type { StaffAccount } from '../../src/types/accounts'
import { UserManagementPage } from '../../src/views/admin/UserManagementPage'
import { renderAdmin, resetAdminAccounts, setUpAdminDom } from '../shared/adminSession'

// The simulated requests answer at once. The Staff tab talks to the API, so its two calls are mocked here.
vi.mock('../../src/service/simulateRequest', () => ({ simulateRequest: () => Promise.resolve({ ok: true }) }))
vi.mock('../../src/service/staffApi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/service/staffApi')>()),
  listStaffAccounts: vi.fn(() => Promise.resolve({ data: [], meta: { total: 0, page: 1, limit: 10, totalPages: 0 } })),
  createStaffAccountApi: vi.fn(),
  resetStaffPasswordApi: vi.fn(),
  archiveStaffAccountApi: vi.fn(),
  restoreStaffAccountApi: vi.fn(),
}))

beforeAll(setUpAdminDom)
beforeEach(resetAdminAccounts)

const tabpanel = () => screen.getByRole('tabpanel')
// jsdom loads no CSS, so a tab's table and its card list are both on screen: row buttons come twice, and the first is the table's.
const row = (name: string | RegExp) => screen.getAllByRole('button', { name })[0]

describe('User management', () => {
  it('opens on Customers with a total, and puts the tab in the URL when it changes', async () => {
    renderAdmin(<UserManagementPage />)
    expect(screen.getByRole('heading', { level: 1, name: 'User management' })).toBeInTheDocument()
    expect(await screen.findByText('Displaying 1–10 of 25')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Customers', selected: true })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('tab', { name: 'Staff' }))
    expect(screen.getByTestId('where')).toHaveTextContent('/admin/users?tab=staff')
    expect((await within(tabpanel()).findAllByRole('button', { name: /Add staff account/ })).length).toBeGreaterThan(0)
  })

  it('reads the tab from the URL and falls back to Customers for an unknown one', async () => {
    renderAdmin(<UserManagementPage />, '/admin/users?tab=admins')
    expect(await screen.findByRole('button', { name: /Add admin account/ })).toBeInTheDocument()
  })

  it('treats an unknown tab as Customers', () => {
    renderAdmin(<UserManagementPage />, '/admin/users?tab=nope')
    expect(screen.getByRole('tab', { name: 'Customers', selected: true })).toBeInTheDocument()
  })
})

describe('Customers tab', () => {
  it('is read only and opens a drawer with the profile, orders and transactions', async () => {
    renderAdmin(<UserManagementPage />)
    expect(await screen.findByText('Displaying 1–10 of 25')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Add|Archive|Reset/ })).not.toBeInTheDocument()

    // The list opens sorted by last name.
    const [customer] = [...getAccounts().customers].sort((a, b) => `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`))
    await userEvent.click(row(new RegExp(`^${customer.firstName} ${customer.lastName}`)))
    const drawer = await screen.findByRole('dialog', { name: `${customer.firstName} ${customer.lastName}` })
    expect(within(drawer).getByText(customer.email)).toBeInTheDocument()
    expect(await within(drawer).findByRole('list', { name: 'Orders' })).toBeInTheDocument()
    expect(within(drawer).getAllByRole('link', { name: /View order SF-/ })[0]).toHaveAttribute('href', expect.stringMatching(/^\/admin\/transactions\?q=SF-/))

    await userEvent.click(within(drawer).getByRole('tab', { name: 'Transactions' }))
    expect(await within(drawer).findByRole('list', { name: 'Transactions' })).toBeInTheDocument()
  })

  it('says nothing matches, and clears the search', async () => {
    renderAdmin(<UserManagementPage />)
    await screen.findByText('Displaying 1–10 of 25')
    await userEvent.type(screen.getByRole('textbox', { name: /Search customers/ }), 'zzzz')
    expect(await screen.findByText('No customers match')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(await screen.findByText('Displaying 1–10 of 25')).toBeInTheDocument()
  })

  it('pages through the list', async () => {
    renderAdmin(<UserManagementPage />)
    await screen.findByText('Displaying 1–10 of 25')
    await userEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(await screen.findByText('Displaying 11–20 of 25')).toBeInTheDocument()
  })
})

describe('Staff tab', () => {
  const person = (id: string, firstName: string, lastName: string): StaffAccount => ({
    id,
    firstName,
    lastName,
    username: `${firstName}.${lastName}`.toLowerCase(),
    email: `${firstName}.${lastName}@silhoufit.dev`.toLowerCase(),
    role: 'staff',
    phone: '',
    status: 'active',
    createdAt: '2026-03-01T08:00:00.000Z',
    lastSignInAt: null,
    mustChangePassword: false,
  })
  const SAM = person('s1', 'Sam', 'Reyes')
  const page = (data: StaffAccount[], p = 1, limit = 10) => ({ data, meta: { total: data.length, page: p, limit, totalPages: 1 } })
  const CREDENTIALS = { username: 'maria.santos', email: 'maria.santos@silhoufit.dev', password: 'Xk9#mQ2!', mustChangePassword: true as const }

  beforeEach(() => {
    vi.mocked(listStaffAccounts).mockReset().mockResolvedValue(page([SAM, person('s2', 'Ana', 'Cruz')]))
    vi.mocked(createStaffAccountApi).mockReset()
    vi.mocked(resetStaffPasswordApi).mockReset()
    vi.mocked(archiveStaffAccountApi).mockReset()
    vi.mocked(restoreStaffAccountApi).mockReset()
  })

  async function openStaff() {
    renderAdmin(<UserManagementPage />, '/admin/users?tab=staff')
    await screen.findAllByText('Sam Reyes')
  }

  it('lists staff with a running number, email, status and date, without a sign-in or sample-data badge', async () => {
    await openStaff()
    const table = screen.getAllByRole('table', { hidden: true })[0]
    expect(within(table).getAllByRole('columnheader', { hidden: true }).map((h) => h.textContent)).toEqual(['#', 'Staff', 'Email', 'Status', 'Added', 'Actions'])
    expect(within(table).getAllByRole('row', { hidden: true })[1]).toHaveTextContent(/^1.*Sam Reyes/)
    expect(within(table).getAllByRole('row', { hidden: true })[2]).toHaveTextContent(/^2.*Ana Cruz/)
    expect(within(table).getAllByText('Active', { selector: 'span' }).length).toBeGreaterThan(0)
    expect(screen.queryByText('Sample data')).not.toBeInTheDocument()
  })

  it('opens on Active, offers Active, Archived and All, and asks the list for each', async () => {
    await openStaff()
    expect(vi.mocked(listStaffAccounts).mock.calls[0][0]).toMatchObject({ status: 'active' })
    expect(screen.getByRole('combobox', { name: 'Status' })).toHaveTextContent('Active')
    await userEvent.click(screen.getByRole('combobox', { name: 'Status' }))
    expect(within(screen.getByRole('listbox', { name: 'Status' })).getAllByRole('option').map((o) => o.textContent)).toEqual(['Active', 'Archived', 'All'])
    await userEvent.click(screen.getByRole('option', { name: 'All' }))
    await waitFor(() => expect(vi.mocked(listStaffAccounts).mock.calls.at(-1)![0].status).toBeUndefined())
    await userEvent.click(screen.getByRole('combobox', { name: 'Status' }))
    await userEvent.click(screen.getByRole('option', { name: 'Archived' }))
    await waitFor(() => expect(vi.mocked(listStaffAccounts).mock.calls.at(-1)![0].status).toBe('archived'))
  })

  it('shows "No staff accounts yet" with Add when Active is empty, and the archived copy when Archived is', async () => {
    vi.mocked(listStaffAccounts).mockResolvedValue(page([]))
    renderAdmin(<UserManagementPage />, '/admin/users?tab=staff')
    expect(await screen.findByText('No staff accounts yet')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /Add staff account/ }).length).toBeGreaterThan(0)
    await userEvent.click(screen.getByRole('combobox', { name: 'Status' }))
    await userEvent.click(screen.getByRole('option', { name: 'Archived' }))
    expect(await screen.findByText('No archived staff accounts')).toBeInTheDocument()
    expect(screen.getByText('Archived accounts show up here and can be restored.')).toBeInTheDocument()
    expect(screen.queryByText('No staff accounts yet')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Show active staff' }))
    expect(await screen.findByText('No staff accounts yet')).toBeInTheDocument()
  })

  it('numbers rows across pages', async () => {
    vi.mocked(listStaffAccounts).mockResolvedValue({ data: [SAM], meta: { total: 11, page: 2, limit: 10, totalPages: 2 } })
    await openStaff()
    expect(within(screen.getAllByRole('table', { hidden: true })[0]).getAllByRole('row', { hidden: true })[1]).toHaveTextContent(/^11.*Sam Reyes/)
  })

  it('creates an account, shows the credentials once and loads the list again', async () => {
    vi.mocked(createStaffAccountApi).mockResolvedValue({ account: person('s3', 'Maria', 'Santos'), credentials: CREDENTIALS })
    await openStaff()
    await userEvent.click(screen.getByRole('button', { name: /Add staff account/ }))
    const sheet = await screen.findByRole('dialog', { name: 'Add staff account' })
    expect(within(sheet).queryByLabelText(/Phone/)).not.toBeInTheDocument()
    expect(within(sheet).getByText(/generated when the account is created/)).toBeInTheDocument()

    await userEvent.click(within(sheet).getByRole('button', { name: 'Create Account' }))
    expect(within(sheet).getByText('First name is required.')).toBeInTheDocument()
    expect(createStaffAccountApi).not.toHaveBeenCalled()

    await userEvent.type(within(sheet).getByLabelText('First name'), 'Mar1ia')
    await userEvent.type(within(sheet).getByLabelText('Last name'), 'Santos')
    expect(within(sheet).getByLabelText('First name')).toHaveValue('Maria')
    const loads = vi.mocked(listStaffAccounts).mock.calls.length
    await userEvent.click(within(sheet).getByRole('button', { name: 'Create Account' }))

    const created = await screen.findByRole('dialog', { name: 'Staff account created' })
    expect(createStaffAccountApi).toHaveBeenCalledWith({ firstName: 'Maria', lastName: 'Santos' })
    expect(within(created).queryByText('maria.santos')).not.toBeInTheDocument()
    expect(within(created).queryByText('Username')).not.toBeInTheDocument()
    expect(within(created).getByText('maria.santos@silhoufit.dev')).toBeInTheDocument()
    expect(within(created).getByText('Xk9#mQ2!')).toBeInTheDocument()
    expect(within(created).getByRole('button', { name: 'Copy sign-in email' })).toBeInTheDocument()
    expect(within(created).getByRole('button', { name: 'Download as PNG' })).toBeInTheDocument()
    expect(within(created).queryByText(/Demo only/)).not.toBeInTheDocument()
    expect(within(created).getByText(/only time the password is shown/)).toBeInTheDocument()
    await waitFor(() => expect(vi.mocked(listStaffAccounts).mock.calls.length).toBeGreaterThan(loads))
  })

  it.each([
    [new StaffApiError('forbidden', undefined, 401), 'Your session has expired.'],
    [new StaffApiError('forbidden', undefined, 403), "You can't create staff accounts."],
    [new StaffApiError('conflict', undefined, 409), "We couldn't reserve that email."],
    [new StaffApiError('validation', 'firstName must contain letters only', 400), 'The server rejected the names.'],
    [new StaffApiError('rate-limit', undefined, 429), 'Too many requests.'],
    [new StaffApiError('network'), 'Nothing was created.'],
    [new StaffApiError('server', undefined, 503), 'No account was made.'],
  ])('explains a failed create (%#) and keeps the form', async (error, title) => {
    vi.mocked(createStaffAccountApi).mockRejectedValue(error)
    await openStaff()
    await userEvent.click(screen.getByRole('button', { name: /Add staff account/ }))
    const sheet = await screen.findByRole('dialog', { name: 'Add staff account' })
    await userEvent.type(within(sheet).getByLabelText('First name'), 'Maria')
    await userEvent.type(within(sheet).getByLabelText('Last name'), 'Santos')
    await userEvent.click(within(sheet).getByRole('button', { name: 'Create Account' }))
    expect(await within(sheet).findByText(title)).toBeInTheDocument()
    expect(within(sheet).getByLabelText('First name')).toHaveValue('Maria')
    expect(within(sheet).getByRole('button', { name: 'Create Account' })).toBeEnabled()
  })

  describe('reset password', () => {
    // jsdom loads no CSS, so the table and the card list both render: the first button is the table's.
    const resetButton = (name: string) => screen.getAllByRole('button', { name: `Reset password for ${name}` })[0]
    const confirmButton = async () => within(await screen.findByRole('dialog', { name: /Reset password for/ })).getByRole('button', { name: 'Reset Password' })

    it('offers the action on every row, named after the person', async () => {
      await openStaff()
      expect(resetButton('Sam Reyes')).toBeInTheDocument()
      expect(resetButton('Ana Cruz')).toBeInTheDocument()
    })

    it('asks first, names the default password and the sign-out, and sends nothing on Cancel', async () => {
      await openStaff()
      await userEvent.click(resetButton('Sam Reyes'))
      const dialog = await screen.findByRole('dialog', { name: 'Reset password for Sam Reyes?' })
      expect(within(dialog).getByText('Are you sure?')).toBeInTheDocument()
      expect(within(dialog).getByText(/default password 1234567a and they will be signed out everywhere/)).toBeInTheDocument()
      await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
      await waitFor(() => expect(screen.queryByRole('dialog', { name: /Reset password for/ })).not.toBeInTheDocument())
      expect(resetStaffPasswordApi).not.toHaveBeenCalled()
    })

    it('waits while the request is pending, then confirms with a toast and no credentials sheet', async () => {
      let finish: () => void = () => {}
      vi.mocked(resetStaffPasswordApi).mockReturnValue(new Promise((resolve) => (finish = () => resolve({ id: 's1' }))))
      await openStaff()
      await userEvent.click(resetButton('Sam Reyes'))
      const confirm = await confirmButton()
      await userEvent.click(confirm)
      expect(resetStaffPasswordApi).toHaveBeenCalledWith('s1')
      expect(confirm).toBeDisabled()
      expect(confirm).toHaveAttribute('aria-busy', 'true')
      expect(resetButton('Sam Reyes')).toBeDisabled()
      finish()
      expect(await screen.findByText('Password reset for Sam Reyes. They are signed out and must sign in with the default password.')).toBeInTheDocument()
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
      expect(resetStaffPasswordApi).toHaveBeenCalledTimes(1)
    })

    const CLEAR = /nothing changed/
    const UNSURE = /couldn't confirm the result.*may or may not have been reset.*Retry is safe/
    const PARTIAL = /may already be reset to the default, but the account wasn't fully secured.*safe to repeat/
    it.each([
      // [error, copy, Retry offered, "Couldn't reset ..." head shown, list reloaded]
      [new StaffApiError('forbidden', undefined, 403, 'not_a_staff_account'), /Sam Reyes is not a staff account, so it can't be reset here\. Refresh the list\./, false, false, true],
      [new StaffApiError('forbidden', undefined, 403), /isn't allowed to reset staff passwords/, false, true, false],
      [new StaffApiError('forbidden', undefined, 401), /Your session expired\. Sign in again, then retry\./, false, true, false],
      [new StaffApiError('not-found', undefined, 404, 'staff_not_found'), /no longer exists.*Refresh the list/, false, true, true],
      [new StaffApiError('server', undefined, 422, 'weak_password'), /rejected the default password.*project owner/, false, true, false],
      [new StaffApiError('rate-limit', undefined, 429), /Wait a few minutes/, false, true, false],
      [new StaffApiError('server', undefined, 503), CLEAR, true, true, false],
      [new StaffApiError('server', undefined, 502, 'reset_not_applied'), CLEAR, true, true, false],
      [new StaffApiError('server', undefined, 502, 'reset_incomplete'), PARTIAL, true, false, false],
      [new StaffApiError('server', undefined, 502), PARTIAL, true, false, false],
      [new StaffApiError('server', undefined, 500), UNSURE, true, false, false],
      [new StaffApiError('network'), UNSURE, true, false, false],
    ])('explains a failed reset (%#)', async (error, copy, retry, head, reloads) => {
      vi.mocked(resetStaffPasswordApi).mockRejectedValue(error)
      await openStaff()
      const loads = vi.mocked(listStaffAccounts).mock.calls.length
      await userEvent.click(resetButton('Sam Reyes'))
      await userEvent.click(await confirmButton())
      expect(await screen.findByText(copy)).toBeInTheDocument()
      expect(screen.queryByText(/Couldn't reset the password for Sam Reyes\./) !== null).toBe(head)
      expect(screen.queryByText(/before anything changed/)).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Retry' }) !== null).toBe(retry)
      if (reloads) await waitFor(() => expect(vi.mocked(listStaffAccounts).mock.calls.length).toBeGreaterThan(loads))
      expect(resetButton('Sam Reyes')).toBeEnabled()
    })

    it('asks again from Retry', async () => {
      vi.mocked(resetStaffPasswordApi).mockRejectedValueOnce(new StaffApiError('network'))
      await openStaff()
      await userEvent.click(resetButton('Sam Reyes'))
      await userEvent.click(await confirmButton())
      await userEvent.click(await screen.findByRole('button', { name: 'Retry' }))
      expect(await screen.findByRole('dialog', { name: 'Reset password for Sam Reyes?' })).toBeInTheDocument()
    })
  })

  describe('archive and restore', () => {
    const ANA = person('s2', 'Ana', 'Cruz')
    const OLD: StaffAccount = { ...ANA, status: 'archived', archivedAt: '2026-04-01T08:00:00.000Z' }
    // jsdom loads no CSS, so the table and the card list both render: the first button is the table's.
    const button = (name: string) => screen.getAllByRole('button', { name })[0]
    const confirmButton = async () => within(await screen.findByRole('dialog', { name: /^Archive / })).getByRole('button', { name: 'Archive Staff' })

    it('gives an active row Reset and Archive, and an archived row only Restore, all named after the person', async () => {
      vi.mocked(listStaffAccounts).mockResolvedValue(page([SAM, OLD]))
      await openStaff()
      expect(button('Reset password for Sam Reyes')).toBeInTheDocument()
      expect(button('Archive Sam Reyes')).toBeInTheDocument()
      expect(button('Restore Ana Cruz')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Reset password for Ana Cruz' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Archive Ana Cruz' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Restore Sam Reyes' })).not.toBeInTheDocument()
      expect(screen.getAllByText('Archived', { selector: 'span' }).length).toBeGreaterThan(0)
    })

    it('asks first, with the consequences, and sends nothing on Cancel', async () => {
      await openStaff()
      await userEvent.click(button('Archive Sam Reyes'))
      const dialog = await screen.findByRole('dialog', { name: 'Archive Sam Reyes?' })
      expect(within(dialog).getByText('Are you sure?')).toBeInTheDocument()
      expect(
        within(dialog).getByText("Sam Reyes will be signed out everywhere and won't be able to sign in. Their account is hidden from the staff list but kept, and you can restore it from the Archived filter."),
      ).toBeInTheDocument()
      await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
      expect(archiveStaffAccountApi).not.toHaveBeenCalled()
    })

    it('waits while pending, then reloads the list and toasts with Undo', async () => {
      let finish: () => void = () => {}
      vi.mocked(archiveStaffAccountApi).mockReturnValue(new Promise((resolve) => (finish = () => resolve({ id: 's1' }))))
      await openStaff()
      await userEvent.click(button('Archive Sam Reyes'))
      const confirm = await confirmButton()
      const loads = vi.mocked(listStaffAccounts).mock.calls.length
      await userEvent.click(confirm)
      expect(archiveStaffAccountApi).toHaveBeenCalledWith('s1')
      expect(confirm).toBeDisabled()
      expect(confirm).toHaveAttribute('aria-busy', 'true')
      expect(button('Archive Sam Reyes')).toBeDisabled()
      expect(button('Archive Ana Cruz')).toBeEnabled()
      finish()
      expect(await screen.findByText('Sam Reyes archived.')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Undo' })).toBeInTheDocument()
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
      await waitFor(() => expect(vi.mocked(listStaffAccounts).mock.calls.length).toBeGreaterThan(loads))
      expect(archiveStaffAccountApi).toHaveBeenCalledTimes(1)
    })

    it('Undo restores the account and says so', async () => {
      vi.mocked(archiveStaffAccountApi).mockResolvedValue({ id: 's1' })
      vi.mocked(restoreStaffAccountApi).mockResolvedValue({ id: 's1' })
      await openStaff()
      await userEvent.click(button('Archive Sam Reyes'))
      await userEvent.click(await confirmButton())
      await userEvent.click(await screen.findByRole('button', { name: 'Undo' }))
      expect(restoreStaffAccountApi).toHaveBeenCalledWith('s1')
      expect(await screen.findByText('Archive undone. Sam Reyes can sign in again.')).toBeInTheDocument()
    })

    it('restores at once with no question, and toasts', async () => {
      vi.mocked(listStaffAccounts).mockResolvedValue(page([SAM, OLD]))
      vi.mocked(restoreStaffAccountApi).mockResolvedValue({ id: 's2' })
      await openStaff()
      const loads = vi.mocked(listStaffAccounts).mock.calls.length
      await userEvent.click(button('Restore Ana Cruz'))
      expect(restoreStaffAccountApi).toHaveBeenCalledWith('s2')
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(await screen.findByText('Ana Cruz restored. They can sign in with their current password.')).toBeInTheDocument()
      await waitFor(() => expect(vi.mocked(listStaffAccounts).mock.calls.length).toBeGreaterThan(loads))
    })

    const NOTHING = /Nothing changed\./
    const UNSURE = /couldn't confirm the result\. Retry is safe, or check the list after a minute\./
    it.each([
      // [error, copy, Retry offered, list reloaded]
      [new StaffApiError('forbidden', undefined, 401), /Your session expired\. Sign in again, then retry\./, false, false],
      [new StaffApiError('forbidden', undefined, 403, 'not_a_staff_account'), /Sam Reyes is not a staff account, so it can't be archived here/, false, true],
      [new StaffApiError('forbidden', undefined, 403, 'forbidden'), /isn't allowed to archive staff/, false, false],
      [new StaffApiError('not-found', undefined, 404, 'staff_not_found'), /no longer exists/, false, true],
      [new StaffApiError('conflict', undefined, 409, 'already_archived'), /Sam Reyes is already archived\. The list was out of date/, false, true],
      [new StaffApiError('rate-limit', undefined, 429), /Wait a few minutes/, false, false],
      [new StaffApiError('server', undefined, 502, 'archive_incomplete'), /blocked from signing in, but the archive did not finish\. Retry now to finish; it is safe to repeat\./, true, false],
      [new StaffApiError('server', undefined, 502, 'archive_not_applied'), NOTHING, true, false],
      [new StaffApiError('server', undefined, 502, 'other'), NOTHING, true, false],
      [new StaffApiError('server', undefined, 503), NOTHING, true, false],
      [new StaffApiError('server', undefined, 500), UNSURE, true, false],
      [new StaffApiError('network'), UNSURE, true, false],
    ])('explains a failed archive (%#)', async (error, copy, retry, reloads) => {
      vi.mocked(archiveStaffAccountApi).mockRejectedValue(error)
      await openStaff()
      const loads = vi.mocked(listStaffAccounts).mock.calls.length
      await userEvent.click(button('Archive Sam Reyes'))
      await userEvent.click(await confirmButton())
      expect(await screen.findByText(copy)).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Retry' }) !== null).toBe(retry)
      if (reloads) await waitFor(() => expect(vi.mocked(listStaffAccounts).mock.calls.length).toBeGreaterThan(loads))
      else expect(vi.mocked(listStaffAccounts).mock.calls.length).toBe(loads)
      expect(button('Archive Sam Reyes')).toBeEnabled()
    })

    it.each([
      [new StaffApiError('conflict', undefined, 409, 'not_archived'), /Ana Cruz is already active\. The list was out of date/, false, true],
      [new StaffApiError('server', undefined, 502, 'restore_incomplete'), /restore for Ana Cruz was only partly applied.*safe to repeat/, true, false],
      [new StaffApiError('server', undefined, 502, 'restore_not_applied'), NOTHING, true, false],
      [new StaffApiError('network'), UNSURE, true, false],
    ])('explains a failed restore (%#)', async (error, copy, retry, reloads) => {
      vi.mocked(listStaffAccounts).mockResolvedValue(page([SAM, OLD]))
      vi.mocked(restoreStaffAccountApi).mockRejectedValue(error)
      await openStaff()
      const loads = vi.mocked(listStaffAccounts).mock.calls.length
      await userEvent.click(button('Restore Ana Cruz'))
      expect(await screen.findByText(copy)).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Retry' }) !== null).toBe(retry)
      if (reloads) await waitFor(() => expect(vi.mocked(listStaffAccounts).mock.calls.length).toBeGreaterThan(loads))
      expect(button('Restore Ana Cruz')).toBeEnabled()
    })

    it('runs the archive again from Retry, without asking', async () => {
      vi.mocked(archiveStaffAccountApi).mockRejectedValueOnce(new StaffApiError('server', undefined, 502, 'archive_incomplete')).mockResolvedValue({ id: 's1' })
      await openStaff()
      await userEvent.click(button('Archive Sam Reyes'))
      await userEvent.click(await confirmButton())
      await userEvent.click(await screen.findByRole('button', { name: 'Retry' }))
      expect(await screen.findByText('Sam Reyes archived.')).toBeInTheDocument()
      expect(archiveStaffAccountApi).toHaveBeenCalledTimes(2)
    })
  })

  it('shows the error with a retry when the list fails to load', async () => {
    vi.mocked(listStaffAccounts).mockRejectedValueOnce(new StaffApiError('network'))
    renderAdmin(<UserManagementPage />, '/admin/users?tab=staff')
    expect(await screen.findByText("We couldn't load the staff accounts.")).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect((await screen.findAllByText('Sam Reyes')).length).toBeGreaterThan(0)
  })

  it('shows the empty state with a way to add the first account', async () => {
    vi.mocked(listStaffAccounts).mockResolvedValue(page([]))
    renderAdmin(<UserManagementPage />, '/admin/users?tab=staff')
    expect(await screen.findByText('No staff accounts yet')).toBeInTheDocument()
  })
})

describe('Admins tab', () => {
  it('adds, but an admin has no reset, archive or restore action on admins', async () => {
    renderAdmin(<UserManagementPage />, '/admin/users?tab=admins')
    expect((await screen.findAllByText('Brian Dijamco')).length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: /Reset password|Archive|Restore/ })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('combobox', { name: 'Status' }))
    const options = within(screen.getByRole('listbox', { name: 'Status' })).getAllByRole('option')
    expect(options.map((o) => o.textContent)).toEqual(['All statuses', 'Active', 'Inactive', 'Archived'])
  })

  it('creates an admin account', async () => {
    renderAdmin(<UserManagementPage />, '/admin/users?tab=admins')
    await userEvent.click(await screen.findByRole('button', { name: /Add admin account/ }))
    const sheet = await screen.findByRole('dialog', { name: 'Add admin account' })
    await userEvent.type(within(sheet).getByLabelText('First name'), 'Ivy')
    await userEvent.type(within(sheet).getByLabelText('Last name'), 'Lim')
    await userEvent.click(within(sheet).getByRole('button', { name: 'Create account' }))
    await waitFor(() => expect(screen.getByRole('dialog', { name: 'Admin account created' })).toBeInTheDocument())
    expect(getAccounts().admins[0]).toMatchObject({ username: 'ivy.lim', role: 'admin', mustChangePassword: true })
  })
})
