import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { getAccounts } from '../../src/service/accountStore'
import { createStaffAccountApi, listStaffAccounts, StaffApiError } from '../../src/service/staffApi'
import type { StaffAccount } from '../../src/types/accounts'
import { UserManagementPage } from '../../src/views/admin/UserManagementPage'
import { renderAdmin, resetAdminAccounts, setUpAdminDom } from '../shared/adminSession'

// The simulated requests answer at once. The Staff tab talks to the API, so its two calls are mocked here.
vi.mock('../../src/service/simulateRequest', () => ({ simulateRequest: () => Promise.resolve({ ok: true }) }))
vi.mock('../../src/service/staffApi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/service/staffApi')>()),
  listStaffAccounts: vi.fn(() => Promise.resolve({ data: [], meta: { total: 0, page: 1, limit: 10, totalPages: 0 } })),
  createStaffAccountApi: vi.fn(),
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
  })

  async function openStaff() {
    renderAdmin(<UserManagementPage />, '/admin/users?tab=staff')
    await screen.findAllByText('Sam Reyes')
  }

  it('lists staff with a running number, email and date, without status, sign-in or sample-data badge', async () => {
    await openStaff()
    const table = screen.getAllByRole('table', { hidden: true })[0]
    expect(within(table).getAllByRole('columnheader', { hidden: true }).map((h) => h.textContent)).toEqual(['#', 'Staff', 'Email', 'Added'])
    expect(within(table).getAllByRole('row', { hidden: true })[1]).toHaveTextContent(/^1.*Sam Reyes/)
    expect(within(table).getAllByRole('row', { hidden: true })[2]).toHaveTextContent(/^2.*Ana Cruz/)
    expect(screen.queryByRole('combobox', { name: 'Status' })).not.toBeInTheDocument()
    expect(screen.queryByText('Sample data')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Archive|Reset password|Restore/ })).not.toBeInTheDocument()
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
    expect(within(created).getByText('maria.santos')).toBeInTheDocument()
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
    [new StaffApiError('conflict', undefined, 409), "We couldn't reserve a username."],
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
