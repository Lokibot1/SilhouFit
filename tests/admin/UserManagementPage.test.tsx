import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { requestPasswordReset } from '../../src/service/requestPasswordReset'
import { clearSession, setSession } from '../../src/service/session'
import { activateAccountApi, countAccounts, deactivateAccountApi, inviteAdminAccountApi, inviteStaffAccountApi, inviteSuperadminAccountApi, listAdminAccounts, listCustomerAccounts, listStaffAccounts, listSuperadminAccounts, StaffApiError } from '../../src/service/staffApi'
import type { AdminAccount, CustomerAccount, StaffAccount, SuperadminAccount } from '../../src/types/accounts'
import { UserManagementPage } from '../../src/views/admin/UserManagementPage'
import { renderAdmin, resetAdminAccounts, setUpAdminDom } from '../shared/adminSession'

// The simulated requests answer at once. The tabs and the summary cards talk to the API, so their calls are mocked here.
vi.mock('../../src/service/simulateRequest', () => ({ simulateRequest: () => Promise.resolve({ ok: true }) }))
const empty = () => Promise.resolve({ data: [], meta: { total: 0, page: 1, limit: 10, totalPages: 0 } })
vi.mock('../../src/service/staffApi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/service/staffApi')>()),
  countAccounts: vi.fn(),
  listCustomerAccounts: vi.fn(),
  listStaffAccounts: vi.fn(),
  listAdminAccounts: vi.fn(),
  listSuperadminAccounts: vi.fn(),
  inviteStaffAccountApi: vi.fn(),
  inviteAdminAccountApi: vi.fn(),
  inviteSuperadminAccountApi: vi.fn(),
  deactivateAccountApi: vi.fn(),
  activateAccountApi: vi.fn(),
}))
vi.mock('../../src/service/requestPasswordReset', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/service/requestPasswordReset')>()),
  requestPasswordReset: vi.fn(),
}))

beforeAll(setUpAdminDom)
beforeEach(() => {
  resetAdminAccounts()
  vi.mocked(countAccounts).mockReset().mockResolvedValue(0)
  for (const list of [listCustomerAccounts, listStaffAccounts, listAdminAccounts, listSuperadminAccounts]) vi.mocked(list).mockReset().mockImplementation(empty)
  for (const call of [inviteStaffAccountApi, inviteAdminAccountApi, inviteSuperadminAccountApi, deactivateAccountApi, activateAccountApi]) vi.mocked(call).mockReset()
  vi.mocked(requestPasswordReset).mockReset().mockResolvedValue({ ok: true })
})
afterEach(() => act(() => clearSession()))

const signInAs = (role: 'admin' | 'superadmin' | 'staff') => act(() => setSession({ name: 'Dev', email: 'dev@silhoufit.dev', role }))
const tabpanel = () => screen.getByRole('tabpanel')
// jsdom loads no CSS, so a tab's table and its card list are both on screen: row buttons come twice, and the first is the table's.
const row = (name: string | RegExp) => screen.getAllByRole('button', { name })[0]

describe('User management', () => {
  it('opens on Customers with a total, and puts the tab in the URL when it changes', async () => {
    vi.mocked(listCustomerAccounts).mockResolvedValue(page([KIM], 1, 10, 25))
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
    expect((await screen.findAllByRole('button', { name: /Add admin account/ })).length).toBeGreaterThan(0)
  })

  it('treats an unknown tab as Customers', () => {
    renderAdmin(<UserManagementPage />, '/admin/users?tab=nope')
    expect(screen.getByRole('tab', { name: 'Customers', selected: true })).toBeInTheDocument()
  })

  it('has no sample-data badge', async () => {
    renderAdmin(<UserManagementPage />, '/admin/users')
    expect(await screen.findByText('No customers yet')).toBeInTheDocument()
    expect(screen.queryByText('Sample data')).not.toBeInTheDocument()
  })
})

const base = { phone: '', createdAt: '2026-03-01T08:00:00.000Z', lastSignInAt: null }
const staff = (id: string, firstName: string, lastName: string, status: StaffAccount['status'] = 'active'): StaffAccount => ({
  ...base,
  id,
  firstName,
  lastName,
  role: 'staff',
  username: `${firstName}.${lastName}`.toLowerCase(),
  email: `${firstName}.${lastName}@example.com`.toLowerCase(),
  status,
})
const admin = (id: string, firstName: string, lastName: string, status: AdminAccount['status'] = 'active'): AdminAccount => ({ ...staff(id, firstName, lastName, status), role: 'admin' })
const superadmin = (id: string, firstName: string, lastName: string): SuperadminAccount => ({ ...staff(id, firstName, lastName), role: 'superadmin', status: 'active' })
const page = <T,>(data: T[], p = 1, limit = 10, total = data.length) => ({ data, meta: { total, page: p, limit, totalPages: Math.ceil(total / limit) } })
const customer = (id: string, firstName: string, lastName: string, status: CustomerAccount['status'] = 'active'): CustomerAccount => ({
  ...base,
  id,
  firstName,
  lastName,
  role: 'customer',
  email: `${firstName}.${lastName}@example.com`.toLowerCase(),
  status,
})
const SAM = staff('s1', 'Sam', 'Reyes')
const ANA = staff('s2', 'Ana', 'Cruz')
const KIM = customer('c1', 'Kim', 'Tan')
const LEO = customer('c2', 'Leo', 'Uy')

describe('Customers tab', () => {
  async function openCustomers(role: 'admin' | 'superadmin' = 'admin') {
    signInAs(role)
    vi.mocked(listCustomerAccounts).mockResolvedValue(page([KIM, LEO]))
    renderAdmin(<UserManagementPage />)
    await screen.findAllByText('Kim Tan')
  }

  it('lists customers from the API with a running number, email, Active status and date, and no add button', async () => {
    await openCustomers()
    expect(vi.mocked(listCustomerAccounts).mock.calls[0][0]).toMatchObject({ status: 'active', sort: 'name', page: 1, limit: 10 })
    const table = screen.getAllByRole('table', { hidden: true })[0]
    expect(within(table).getAllByRole('columnheader', { hidden: true }).map((h) => h.textContent)).toEqual(['#', 'Customer', 'Email', 'Status', 'Added', 'Actions'])
    expect(within(table).getAllByRole('row', { hidden: true })[1]).toHaveTextContent(/^1.*Kim Tan.*kim\.tan@example\.com/)
    expect(within(table).getAllByRole('row', { hidden: true })[2]).toHaveTextContent(/^2.*Leo Uy/)
    expect(screen.queryByRole('button', { name: /Add .* account/ })).not.toBeInTheDocument()
    expect(screen.queryByText(/Orders|Lifetime spend/)).not.toBeInTheDocument()
  })

  it('sorts the cards from a Sort by select and a direction button, since the header buttons are hidden below the table breakpoint', async () => {
    await openCustomers()
    const sortBy = screen.getByRole('combobox', { name: 'Sort by' })
    expect(sortBy).toHaveTextContent('Name')
    await userEvent.click(sortBy)
    await userEvent.click(await screen.findByRole('option', { name: 'Added' }))
    await waitFor(() => expect(vi.mocked(listCustomerAccounts).mock.calls.at(-1)![0]).toMatchObject({ sort: 'createdAt', dir: 'asc' }))
    await userEvent.click(screen.getByRole('button', { name: /^Sorted ascending\. Switch to descending$/ }))
    await waitFor(() => expect(vi.mocked(listCustomerAccounts).mock.calls.at(-1)![0]).toMatchObject({ sort: 'createdAt', dir: 'desc' }))
    expect(screen.getByRole('button', { name: /^Sorted descending\. Switch to ascending$/ })).toHaveTextContent('Descending')
  })

  it('numbers rows across pages', async () => {
    signInAs('admin')
    vi.mocked(listCustomerAccounts).mockResolvedValue(page([KIM], 3, 10, 25))
    renderAdmin(<UserManagementPage />)
    await screen.findAllByText('Kim Tan')
    expect(within(screen.getAllByRole('table', { hidden: true })[0]).getAllByRole('row', { hidden: true })[1]).toHaveTextContent(/^21.*Kim Tan/)
  })

  it('offers Active, Inactive and All, searches by name or email, and asks the list for each', async () => {
    await openCustomers()
    expect(screen.getByRole('combobox', { name: 'Status' })).toHaveTextContent('Active')
    await userEvent.click(screen.getByRole('combobox', { name: 'Status' }))
    expect(within(screen.getByRole('listbox', { name: 'Status' })).getAllByRole('option').map((o) => o.textContent)).toEqual(['Active', 'Inactive', 'All'])
    await userEvent.click(screen.getByRole('option', { name: 'Inactive' }))
    await waitFor(() => expect(vi.mocked(listCustomerAccounts).mock.calls.at(-1)![0].status).toBe('inactive'))
    await userEvent.type(screen.getByRole('textbox', { name: 'Search customers by name or email' }), 'kim')
    await waitFor(() => expect(vi.mocked(listCustomerAccounts).mock.calls.at(-1)![0]).toMatchObject({ search: 'kim', status: 'inactive' }))
  })

  it('pages through the list', async () => {
    signInAs('admin')
    vi.mocked(listCustomerAccounts).mockImplementation((query) => Promise.resolve(page([KIM], query.page, 10, 25)))
    renderAdmin(<UserManagementPage />)
    await screen.findByText('Displaying 1–10 of 25')
    await userEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(await screen.findByText('Displaying 11–20 of 25')).toBeInTheDocument()
  })

  it('shows the empty state, the no-match state with a way back, and the inactive one', async () => {
    signInAs('admin')
    renderAdmin(<UserManagementPage />)
    expect(await screen.findByText('No customers yet')).toBeInTheDocument()
    await userEvent.type(screen.getByRole('textbox', { name: /Search customers/ }), 'zzzz')
    expect(await screen.findByText('No customers match')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(await screen.findByText('No customers yet')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('combobox', { name: 'Status' }))
    await userEvent.click(screen.getByRole('option', { name: 'Inactive' }))
    expect(await screen.findByText('No inactive customers')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Show active customers' }))
    expect(await screen.findByText('No customers yet')).toBeInTheDocument()
  })

  it('shows the error and loads again from the retry button', async () => {
    signInAs('admin')
    vi.mocked(listCustomerAccounts).mockRejectedValueOnce(new StaffApiError('server', undefined, 500)).mockResolvedValue(page([KIM]))
    renderAdmin(<UserManagementPage />)
    await userEvent.click(await screen.findByRole('button', { name: /Try again|Retry/ }))
    expect((await screen.findAllByText('Kim Tan')).length).toBeGreaterThan(0)
  })

  it.each(['admin', 'superadmin'] as const)('lets %s deactivate after a question, with Undo, using the customer wording', async (role) => {
    vi.mocked(deactivateAccountApi).mockResolvedValue({ id: 'c1' })
    vi.mocked(activateAccountApi).mockResolvedValue({ id: 'c1' })
    await openCustomers(role)
    expect(screen.queryByRole('button', { name: /reset email/ })).not.toBeInTheDocument()
    await userEvent.click(row('Deactivate Kim Tan'))
    const dialog = await screen.findByRole('dialog', { name: 'Deactivate Kim Tan?' })
    expect(dialog).toHaveTextContent('Are you sure?')
    // Cancel is the safe default.
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus()
    const loads = vi.mocked(listCustomerAccounts).mock.calls.length
    await userEvent.click(within(dialog).getByRole('button', { name: 'Deactivate Customer' }))
    expect(await screen.findByText('Kim Tan deactivated.')).toBeInTheDocument()
    expect(deactivateAccountApi).toHaveBeenCalledWith('c1')
    await waitFor(() => expect(vi.mocked(listCustomerAccounts).mock.calls.length).toBeGreaterThan(loads))
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(await screen.findByText('Deactivation undone. Kim Tan can sign in again.')).toBeInTheDocument()
    expect(activateAccountApi).toHaveBeenCalledWith('c1')
  })

  it('activates an inactive customer at once, with no question', async () => {
    signInAs('superadmin')
    vi.mocked(activateAccountApi).mockResolvedValue({ id: 'c9' })
    vi.mocked(listCustomerAccounts).mockResolvedValue(page([customer('c9', 'Off', 'Line', 'inactive')]))
    renderAdmin(<UserManagementPage />)
    await screen.findAllByText('Off Line')
    await userEvent.click(row('Activate Off Line'))
    expect(await screen.findByText(/Off Line activated\./)).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Deactivate Off Line' })).not.toBeInTheDocument()
  })

  it('explains a 403 for customers in the customer wording', async () => {
    vi.mocked(deactivateAccountApi).mockRejectedValue(new StaffApiError('forbidden', 'insufficient authority', 403))
    await openCustomers()
    await userEvent.click(row('Deactivate Kim Tan'))
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Deactivate Customer' }))
    expect(await screen.findByText(/isn't allowed to deactivate customers/)).toBeInTheDocument()
  })
})

describe('Account summary cards', () => {
  const figures = () => screen.getByRole('region', { name: 'Accounts at a glance' })
  /** What countAccounts answers for each role: [active, inactive]. */
  const COUNTS: Record<string, [number, number]> = { customer: [120, 7], staff: [8, 2], admin: [3, 0], superadmin: [2, 1] }
  const answer = () => vi.mocked(countAccounts).mockImplementation((role, active) => Promise.resolve(COUNTS[role][active ? 0 : 1]))

  it('shows the active count with the inactive count beneath, each card linking to its tab', async () => {
    answer()
    renderAdmin(<UserManagementPage />)
    const link = await within(figures()).findByRole('link', { name: /^Customers: 120 active, 7 inactive/ })
    expect(link).toHaveAttribute('href', '/admin/users?tab=customers')
    expect(within(figures()).getByRole('link', { name: /^Staff: 8 active, 2 inactive/ })).toHaveAttribute('href', '/admin/users?tab=staff')
    expect(within(figures()).getByRole('link', { name: /^Admins: 3 active, 0 inactive/ })).toHaveAttribute('href', '/admin/users?tab=admins')
    expect(within(figures()).queryByRole('link', { name: /^Superadmins/ })).not.toBeInTheDocument()
    expect(within(figures()).queryByText(/archived|Registered shoppers/)).not.toBeInTheDocument()
    expect(within(link).getByText('120')).toHaveClass('tabular-nums')
    expect(within(link).getByText('120')).not.toHaveClass('text-right')
    expect(within(link).getByText('7 inactive')).toBeInTheDocument()
  })

  it('adds the Superadmins card for a superadmin, and asks for two counts per card with one call each', async () => {
    answer()
    signInAs('superadmin')
    renderAdmin(<UserManagementPage />, '/superadmin/users')
    expect(await within(figures()).findByRole('link', { name: /^Superadmins: 2 active, 1 inactive/ })).toHaveAttribute('href', '/superadmin/users?tab=superadmins')
    const calls = vi.mocked(countAccounts).mock.calls.map(([role, active]) => `${role}:${active}`).sort()
    expect(calls).toEqual(['admin:false', 'admin:true', 'customer:false', 'customer:true', 'staff:false', 'staff:true', 'superadmin:false', 'superadmin:true'])
  })

  it('shows a skeleton per card while counting, matching the card size', async () => {
    vi.mocked(countAccounts).mockImplementation(() => new Promise(() => {}))
    renderAdmin(<UserManagementPage />)
    for (const name of ['Loading customers', 'Loading staff', 'Loading admins']) expect(within(figures()).getByRole('status', { name })).toBeInTheDocument()
  })

  it('lets one card fail with its own Retry while the others and the page keep working', async () => {
    answer()
    let staffFails = true
    vi.mocked(countAccounts).mockImplementation((role, active) => (role === 'staff' && staffFails ? Promise.reject(new StaffApiError('server', undefined, 500)) : Promise.resolve(COUNTS[role][active ? 0 : 1])))
    vi.mocked(listCustomerAccounts).mockResolvedValue(page([KIM]))
    renderAdmin(<UserManagementPage />)
    const alert = await within(figures()).findByRole('alert')
    expect(alert).toHaveTextContent("We couldn't load the staff count.")
    expect(within(figures()).getByRole('link', { name: /^Customers: 120 active/ })).toBeInTheDocument()
    expect(within(figures()).getByRole('link', { name: /^Admins: 3 active/ })).toBeInTheDocument()
    expect((await screen.findAllByText('Kim Tan')).length).toBeGreaterThan(0)

    staffFails = false
    await userEvent.click(within(alert).getByRole('button', { name: 'Retry' }))
    expect(await within(figures()).findByRole('link', { name: /^Staff: 8 active, 2 inactive/ })).toBeInTheDocument()
    expect(within(figures()).queryByRole('alert')).not.toBeInTheDocument()
  })
})

describe('Staff tab', () => {
  async function openStaff(role: 'admin' | 'superadmin' = 'admin') {
    signInAs(role)
    vi.mocked(listStaffAccounts).mockResolvedValue(page([SAM, ANA]))
    renderAdmin(<UserManagementPage />, '/admin/users?tab=staff')
    await screen.findAllByText('Sam Reyes')
  }

  it('lists staff with a running number, email, Active status and date', async () => {
    await openStaff()
    const table = screen.getAllByRole('table', { hidden: true })[0]
    expect(within(table).getAllByRole('columnheader', { hidden: true }).map((h) => h.textContent)).toEqual(['#', 'Staff', 'Email', 'Status', 'Added', 'Actions'])
    expect(within(table).getAllByRole('row', { hidden: true })[1]).toHaveTextContent(/^1.*Sam Reyes/)
    expect(within(table).getAllByRole('row', { hidden: true })[2]).toHaveTextContent(/^2.*Ana Cruz/)
    expect(within(table).getAllByText('Active', { selector: 'span' }).length).toBeGreaterThan(0)
  })

  it('opens on Active, offers Active, Inactive and All, and asks the list for each', async () => {
    await openStaff()
    expect(vi.mocked(listStaffAccounts).mock.calls[0][0]).toMatchObject({ status: 'active', sort: 'name' })
    expect(screen.getByRole('combobox', { name: 'Status' })).toHaveTextContent('Active')
    await userEvent.click(screen.getByRole('combobox', { name: 'Status' }))
    expect(within(screen.getByRole('listbox', { name: 'Status' })).getAllByRole('option').map((o) => o.textContent)).toEqual(['Active', 'Inactive', 'All'])
    await userEvent.click(screen.getByRole('option', { name: 'All' }))
    await waitFor(() => expect(vi.mocked(listStaffAccounts).mock.calls.at(-1)![0].status).toBeUndefined())
    await userEvent.click(screen.getByRole('combobox', { name: 'Status' }))
    await userEvent.click(screen.getByRole('option', { name: 'Inactive' }))
    await waitFor(() => expect(vi.mocked(listStaffAccounts).mock.calls.at(-1)![0].status).toBe('inactive'))
  })

  it('shows the first-account empty state, and the inactive one with a way back', async () => {
    signInAs('admin')
    renderAdmin(<UserManagementPage />, '/admin/users?tab=staff')
    expect(await screen.findByText('No staff accounts yet')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('combobox', { name: 'Status' }))
    await userEvent.click(screen.getByRole('option', { name: 'Inactive' }))
    expect(await screen.findByText('No inactive staff accounts')).toBeInTheDocument()
    expect(screen.getByText('Deactivated accounts show up here and can be activated again.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Show active staff' }))
    expect(await screen.findByText('No staff accounts yet')).toBeInTheDocument()
  })

  it('numbers rows across pages', async () => {
    signInAs('admin')
    vi.mocked(listStaffAccounts).mockResolvedValue({ data: [SAM], meta: { total: 11, page: 2, limit: 10, totalPages: 2 } })
    renderAdmin(<UserManagementPage />, '/admin/users?tab=staff')
    await screen.findAllByText('Sam Reyes')
    expect(within(screen.getAllByRole('table', { hidden: true })[0]).getAllByRole('row', { hidden: true })[1]).toHaveTextContent(/^11.*Sam Reyes/)
  })

  it('shows the error and loads again from the retry button', async () => {
    signInAs('admin')
    vi.mocked(listStaffAccounts).mockRejectedValueOnce(new StaffApiError('server', undefined, 500)).mockResolvedValue(page([SAM]))
    renderAdmin(<UserManagementPage />, '/admin/users?tab=staff')
    await userEvent.click(await screen.findByRole('button', { name: /Try again|Retry/ }))
    expect((await screen.findAllByText('Sam Reyes')).length).toBeGreaterThan(0)
  })

  describe('invite', () => {
    async function fillInvite(email = 'maria@example.com') {
      await userEvent.click(screen.getByRole('button', { name: /Add staff account/ }))
      const sheet = await screen.findByRole('dialog', { name: 'Add staff account' })
      await userEvent.type(within(sheet).getByLabelText('First name'), 'Maria')
      await userEvent.type(within(sheet).getByLabelText('Last name'), 'Santos')
      await userEvent.type(within(sheet).getByLabelText('Email'), email)
      return sheet
    }

    it('asks for names and email with no generated-email preview, validates, then sends the lowercased email', async () => {
      vi.mocked(inviteStaffAccountApi).mockResolvedValue({ account: staff('s3', 'Maria', 'Santos'), message: 'Staff invitation sent' })
      await openStaff()
      await userEvent.click(screen.getByRole('button', { name: /Add staff account/ }))
      const sheet = await screen.findByRole('dialog', { name: 'Add staff account' })
      expect(within(sheet).queryByText(/Sign-in email/)).not.toBeInTheDocument()

      await userEvent.click(within(sheet).getByRole('button', { name: 'Send Invitation' }))
      expect(within(sheet).getByText('First name is required.')).toBeInTheDocument()
      expect(within(sheet).getByText('Email is required.')).toBeInTheDocument()
      expect(inviteStaffAccountApi).not.toHaveBeenCalled()

      await userEvent.type(within(sheet).getByLabelText('First name'), 'Mar1ia')
      await userEvent.type(within(sheet).getByLabelText('Last name'), 'Santos')
      await userEvent.type(within(sheet).getByLabelText('Email'), 'not-an-email')
      expect(within(sheet).getByLabelText('First name')).toHaveValue('Maria')
      await userEvent.click(within(sheet).getByRole('button', { name: 'Send Invitation' }))
      expect(within(sheet).getByText(/valid email/)).toBeInTheDocument()
      expect(inviteStaffAccountApi).not.toHaveBeenCalled()

      await userEvent.clear(within(sheet).getByLabelText('Email'))
      await userEvent.type(within(sheet).getByLabelText('Email'), 'Maria.Santos@Example.com')
      const loads = vi.mocked(listStaffAccounts).mock.calls.length
      await userEvent.click(within(sheet).getByRole('button', { name: 'Send Invitation' }))

      const sent = await screen.findByRole('dialog', { name: 'Invitation sent' })
      expect(inviteStaffAccountApi).toHaveBeenCalledTimes(1)
      expect(inviteStaffAccountApi).toHaveBeenCalledWith({ email: 'maria.santos@example.com', firstName: 'Maria', lastName: 'Santos' })
      expect(sent).toHaveTextContent('Invitation sent to maria.santos@example.com. They will set their own password from the email link.')
      expect(within(sent).queryByText(/Temporary password|Copy|Download/)).not.toBeInTheDocument()
      // The toast is short; the sheet already says where the invitation went.
      expect(screen.getAllByRole('status').some((toast) => toast.textContent?.trim() === 'Invitation sent')).toBe(true)
      await waitFor(() => expect(vi.mocked(listStaffAccounts).mock.calls.length).toBeGreaterThan(loads))
      await userEvent.click(within(sent).getByRole('button', { name: 'Done' }))
    })

    it('has the fields in order, with the optional ones marked, and every gender the backend accepts', async () => {
      await openStaff()
      await userEvent.click(screen.getByRole('button', { name: /Add staff account/ }))
      const sheet = await screen.findByRole('dialog', { name: 'Add staff account' })
      const order = ['First name', 'Middle name (optional)', 'Last name', 'Suffix (optional)', 'Email', 'Birthday (optional)']
      const ids = order.map((label) => within(sheet).getByLabelText(label).id)
      const inDom = [...sheet.querySelectorAll('input')].map((el) => el.id)
      expect(inDom).toEqual(ids)
      await userEvent.click(within(sheet).getByRole('combobox', { name: 'Gender (optional)' }))
      expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['Not specified', 'Male', 'Female', 'Other', 'Unisex'])
    })

    it('sends the optional fields when filled, trimmed, and shows the count against the backend limits', async () => {
      vi.mocked(inviteStaffAccountApi).mockResolvedValue({ account: staff('s3', 'Maria', 'Santos'), message: 'ok' })
      await openStaff()
      const sheet = await fillInvite()
      await userEvent.type(within(sheet).getByLabelText('Middle name (optional)'), 'de la Cruz')
      await userEvent.type(within(sheet).getByLabelText('Suffix (optional)'), 'J1r.')
      expect(within(sheet).getByLabelText('Suffix (optional)')).toHaveValue('Jr.')
      expect(within(sheet).getByText('3/5')).toBeInTheDocument()
      fireEvent.change(within(sheet).getByLabelText('Birthday (optional)'), { target: { value: '1998-04-23' } })
      await userEvent.click(within(sheet).getByRole('combobox', { name: 'Gender (optional)' }))
      await userEvent.click(screen.getByRole('option', { name: 'Female' }))
      await userEvent.click(within(sheet).getByRole('button', { name: 'Send Invitation' }))
      await screen.findByRole('dialog', { name: 'Invitation sent' })
      expect(inviteStaffAccountApi).toHaveBeenCalledWith({
        email: 'maria@example.com',
        firstName: 'Maria',
        middleName: 'de la Cruz',
        lastName: 'Santos',
        suffix: 'Jr.',
        birthday: '1998-04-23',
        gender: 'female',
      })
    })

    it('leaves the optional keys out of the request when they are empty', async () => {
      vi.mocked(inviteStaffAccountApi).mockResolvedValue({ account: staff('s3', 'Maria', 'Santos'), message: 'ok' })
      await openStaff()
      const sheet = await fillInvite()
      await userEvent.click(within(sheet).getByRole('button', { name: 'Send Invitation' }))
      await screen.findByRole('dialog', { name: 'Invitation sent' })
      expect(Object.keys(vi.mocked(inviteStaffAccountApi).mock.calls[0][0])).toEqual(['email', 'firstName', 'lastName'])
    })

    it('refuses a birthday of today or later with an inline message, and sends nothing', async () => {
      await openStaff()
      const sheet = await fillInvite()
      const birthday = within(sheet).getByLabelText('Birthday (optional)')
      const now = new Date()
      const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
      expect(birthday).toHaveAttribute('max')
      expect(birthday.getAttribute('max')! < today).toBe(true)
      fireEvent.change(birthday, { target: { value: today } })
      await userEvent.click(within(sheet).getByRole('button', { name: 'Send Invitation' }))
      expect(within(sheet).getByText('Birthday must be a past date. Pick a day before today.')).toBeInTheDocument()
      expect(birthday).toHaveAttribute('aria-invalid', 'true')
      expect(birthday).toHaveFocus()
      expect(inviteStaffAccountApi).not.toHaveBeenCalled()
    })

    it('shows several server validation messages as separate capitalised sentences', async () => {
      vi.mocked(inviteStaffAccountApi).mockRejectedValue(new StaffApiError('validation', 'email must be an email; lastName should not be empty', 400))
      await openStaff()
      const sheet = await fillInvite()
      await userEvent.click(within(sheet).getByRole('button', { name: 'Send Invitation' }))
      expect(await within(sheet).findByRole('alert')).toHaveTextContent('Email must be an email. Last name should not be empty. No invitation was sent.')
    })

    it.each([
      [new StaffApiError('forbidden', undefined, 401), 'Your session has expired.'],
      [new StaffApiError('forbidden', 'insufficient authority', 403), "You can't invite staff accounts."],
      [new StaffApiError('conflict', 'A user with this email address already exists', 409), 'That email already has an account.'],
      [new StaffApiError('validation', 'email must be an email', 400), 'The server rejected the details.'],
      [new StaffApiError('rate-limit', undefined, 429), 'Too many requests.'],
      [new StaffApiError('network'), 'No invitation was sent.'],
      [new StaffApiError('server', undefined, 500), 'No invitation was sent.'],
    ])('explains failure %# in an alert and keeps the form', async (error, title) => {
      vi.mocked(inviteStaffAccountApi).mockRejectedValue(error)
      await openStaff()
      const sheet = await fillInvite()
      await userEvent.click(within(sheet).getByRole('button', { name: 'Send Invitation' }))
      expect(await within(sheet).findByRole('alert')).toHaveTextContent(title)
      expect(within(sheet).getByLabelText('Email')).toHaveValue('maria@example.com')
      expect(within(sheet).getByRole('button', { name: 'Send Invitation' })).toBeEnabled()
    })
  })

  describe('password reset email', () => {
    it('is offered to an admin on each active row, named after the person, and the old reset is gone', async () => {
      await openStaff()
      expect(row('Send password reset email to Sam Reyes')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /Reset password for/ })).not.toBeInTheDocument()
    })

    it('asks first, names the address, and sends nothing on Cancel', async () => {
      await openStaff()
      await userEvent.click(row('Send password reset email to Sam Reyes'))
      const dialog = await screen.findByRole('dialog', { name: 'Send a password reset email to Sam Reyes?' })
      expect(dialog).toHaveTextContent('sam.reyes@example.com')
      expect(dialog).toHaveTextContent('Are you sure?')
      await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
      expect(requestPasswordReset).not.toHaveBeenCalled()
    })

    it('sends one request for the row email and toasts', async () => {
      await openStaff()
      await userEvent.click(row('Send password reset email to Sam Reyes'))
      const dialog = await screen.findByRole('dialog', { name: /Send a password reset email/ })
      await userEvent.click(within(dialog).getByRole('button', { name: 'Send Reset Email' }))
      expect(await screen.findByText('Password reset email sent to sam.reyes@example.com')).toBeInTheDocument()
      expect(requestPasswordReset).toHaveBeenCalledTimes(1)
      expect(requestPasswordReset).toHaveBeenCalledWith({ email: 'sam.reyes@example.com' })
    })

    it.each([
      ['rate-limit', /limits how many emails/, false],
      ['network', /connection dropped/, true],
      ['server', /Retry in a moment/, true],
    ] as const)('explains a %s failure, with Retry only when it can help', async (kind, copy, retry) => {
      vi.mocked(requestPasswordReset).mockRejectedValue(Object.assign(new Error('x'), { kind }))
      await openStaff()
      await userEvent.click(row('Send password reset email to Sam Reyes'))
      await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Send Reset Email' }))
      expect(await screen.findByText(copy)).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Retry' }) !== null).toBe(retry)
    })
  })

  describe('deactivate and activate', () => {
    it('gives an active row Reset email and Deactivate, and an inactive row only Activate, with Inactive shown', async () => {
      signInAs('admin')
      vi.mocked(listStaffAccounts).mockResolvedValue(page([SAM, staff('s9', 'Off', 'Duty', 'inactive')]))
      renderAdmin(<UserManagementPage />, '/admin/users?tab=staff')
      await screen.findAllByText('Sam Reyes')
      expect(row('Deactivate Sam Reyes')).toBeInTheDocument()
      expect(row('Activate Off Duty')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Deactivate Off Duty' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Send password reset email to Off Duty' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /Archive|Restore/ })).not.toBeInTheDocument()
      expect(screen.getAllByText('Inactive', { selector: 'span' }).length).toBeGreaterThan(0)
    })

    it('gives a viewer who is only staff no row actions', async () => {
      signInAs('staff')
      vi.mocked(listStaffAccounts).mockResolvedValue(page([SAM]))
      renderAdmin(<UserManagementPage />, '/admin/users?tab=staff')
      await screen.findAllByText('Sam Reyes')
      expect(screen.queryByRole('button', { name: /Deactivate|Activate|reset email/ })).not.toBeInTheDocument()
    })

    it('asks first, with the consequences, and sends nothing on Cancel', async () => {
      await openStaff()
      await userEvent.click(row('Deactivate Sam Reyes'))
      const dialog = await screen.findByRole('dialog', { name: 'Deactivate Sam Reyes?' })
      expect(dialog).toHaveTextContent(/can't sign in or refresh their session/)
      await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
      expect(deactivateAccountApi).not.toHaveBeenCalled()
    })

    it('deactivates once, reloads the list, toasts with Undo, and Undo activates', async () => {
      vi.mocked(deactivateAccountApi).mockResolvedValue({ id: 's1' })
      vi.mocked(activateAccountApi).mockResolvedValue({ id: 's1' })
      await openStaff()
      const loads = vi.mocked(listStaffAccounts).mock.calls.length
      await userEvent.click(row('Deactivate Sam Reyes'))
      await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Deactivate Staff' }))
      expect(await screen.findByText('Sam Reyes deactivated.')).toBeInTheDocument()
      expect(deactivateAccountApi).toHaveBeenCalledTimes(1)
      expect(deactivateAccountApi).toHaveBeenCalledWith('s1')
      await waitFor(() => expect(vi.mocked(listStaffAccounts).mock.calls.length).toBeGreaterThan(loads))
      await userEvent.click(screen.getByRole('button', { name: 'Undo' }))
      expect(await screen.findByText('Deactivation undone. Sam Reyes can sign in again.')).toBeInTheDocument()
      expect(activateAccountApi).toHaveBeenCalledWith('s1')
    })

    it('activates at once with no question, and toasts', async () => {
      signInAs('admin')
      vi.mocked(activateAccountApi).mockResolvedValue({ id: 's9' })
      vi.mocked(listStaffAccounts).mockResolvedValue(page([staff('s9', 'Off', 'Duty', 'inactive')]))
      renderAdmin(<UserManagementPage />, '/admin/users?tab=staff')
      await screen.findAllByText('Off Duty')
      await userEvent.click(row('Activate Off Duty'))
      expect(await screen.findByText(/Off Duty activated\./)).toBeInTheDocument()
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it.each([
      [new StaffApiError('forbidden', 'You cannot deactivate your own account', 403), /can't deactivate your own account/, false],
      [new StaffApiError('forbidden', 'User account is deactivated', 403), /Your own account has been deactivated/, false],
      [new StaffApiError('forbidden', 'Cannot deactivate a user with role', 403), /isn't allowed to deactivate staff/, false],
      [new StaffApiError('forbidden', undefined, 401), /session expired/, false],
      [new StaffApiError('not-found', undefined, 404), /no longer exists/, false],
      [new StaffApiError('rate-limit', undefined, 429), /Too many requests/, false],
      [new StaffApiError('server', undefined, 500), /couldn't confirm the result/, true],
      [new StaffApiError('network'), /couldn't confirm the result/, true],
    ])('explains failure %# and offers Retry only when it can help', async (error, copy, retry) => {
      vi.mocked(deactivateAccountApi).mockRejectedValue(error)
      await openStaff()
      await userEvent.click(row('Deactivate Sam Reyes'))
      await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Deactivate Staff' }))
      expect(await screen.findByText(copy)).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Retry' }) !== null).toBe(retry)
    })

    it('reloads the list when the account no longer exists', async () => {
      vi.mocked(deactivateAccountApi).mockRejectedValue(new StaffApiError('not-found', undefined, 404))
      await openStaff()
      const loads = vi.mocked(listStaffAccounts).mock.calls.length
      await userEvent.click(row('Deactivate Sam Reyes'))
      await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Deactivate Staff' }))
      await screen.findByText(/no longer exists/)
      await waitFor(() => expect(vi.mocked(listStaffAccounts).mock.calls.length).toBeGreaterThan(loads))
    })
  })
})

describe('Admins tab', () => {
  const JO = admin('a1', 'Jo', 'Lim')

  async function openAdmins(role: 'admin' | 'superadmin') {
    signInAs(role)
    vi.mocked(listAdminAccounts).mockResolvedValue(page([JO]))
    renderAdmin(<UserManagementPage />, '/admin/users?tab=admins')
    await screen.findAllByText('Jo Lim')
  }

  it('lists admins with a running number, and gives an admin viewer no row actions', async () => {
    await openAdmins('admin')
    expect(vi.mocked(listAdminAccounts).mock.calls[0][0]).toMatchObject({ status: 'active', sort: 'name', page: 1, limit: 10 })
    const table = screen.getAllByRole('table', { hidden: true })[0]
    expect(within(table).getAllByRole('columnheader', { hidden: true }).map((h) => h.textContent)).toEqual(['#', 'Admin', 'Email', 'Status', 'Added'])
    expect(screen.queryByRole('button', { name: /Deactivate|Activate|reset email/ })).not.toBeInTheDocument()
  })

  it('gives a superadmin Reset email and Deactivate on an active admin, and only Activate on an inactive one', async () => {
    signInAs('superadmin')
    vi.mocked(listAdminAccounts).mockResolvedValue(page([JO, admin('a2', 'Off', 'Admin', 'inactive')]))
    renderAdmin(<UserManagementPage />, '/admin/users?tab=admins')
    await screen.findAllByText('Jo Lim')
    expect(row('Send password reset email to Jo Lim')).toBeInTheDocument()
    expect(row('Deactivate Jo Lim')).toBeInTheDocument()
    expect(row('Activate Off Admin')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Deactivate Off Admin' })).not.toBeInTheDocument()
  })

  it('deactivates an admin with the admin wording through the same /users/:id route', async () => {
    vi.mocked(deactivateAccountApi).mockResolvedValue({ id: 'a1' })
    await openAdmins('superadmin')
    await userEvent.click(row('Deactivate Jo Lim'))
    const dialog = await screen.findByRole('dialog', { name: 'Deactivate Jo Lim?' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Deactivate Admin' }))
    expect(await screen.findByText('Jo Lim deactivated.')).toBeInTheDocument()
    expect(deactivateAccountApi).toHaveBeenCalledWith('a1')
  })

  it('sends the reset email to the admin address', async () => {
    await openAdmins('superadmin')
    await userEvent.click(row('Send password reset email to Jo Lim'))
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Send Reset Email' }))
    expect(await screen.findByText('Password reset email sent to jo.lim@example.com')).toBeInTheDocument()
  })

  it('invites an admin from the Admins tab', async () => {
    vi.mocked(inviteAdminAccountApi).mockResolvedValue({ account: admin('a3', 'New', 'Admin'), message: 'ok' })
    await openAdmins('admin')
    await userEvent.click(screen.getAllByRole('button', { name: /Add admin account/ })[0])
    const sheet = await screen.findByRole('dialog', { name: 'Add admin account' })
    await userEvent.type(within(sheet).getByLabelText('First name'), 'New')
    await userEvent.type(within(sheet).getByLabelText('Last name'), 'Admin')
    await userEvent.type(within(sheet).getByLabelText('Email'), 'new@example.com')
    await userEvent.click(within(sheet).getByRole('button', { name: 'Send Invitation' }))
    expect(await screen.findByRole('dialog', { name: 'Invitation sent' })).toBeInTheDocument()
    expect(inviteAdminAccountApi).toHaveBeenCalledWith({ email: 'new@example.com', firstName: 'New', lastName: 'Admin' })
  })

  it('shows the empty state when there are none', async () => {
    signInAs('admin')
    renderAdmin(<UserManagementPage />, '/admin/users?tab=admins')
    expect(await screen.findByText('No admin accounts yet')).toBeInTheDocument()
  })
})

describe('Superadmins tab', () => {
  async function openSuperadmins() {
    signInAs('superadmin')
    renderAdmin(<UserManagementPage />, '/admin/users?tab=superadmins')
    await userEvent.click((await screen.findAllByRole('button', { name: /Add superadmin account/ }))[0])
    const sheet = await screen.findByRole('dialog', { name: 'Add superadmin account' })
    await userEvent.type(within(sheet).getByLabelText('First name'), 'Kim')
    await userEvent.type(within(sheet).getByLabelText('Last name'), 'Ng')
    await userEvent.type(within(sheet).getByLabelText('Email'), 'kim@example.com')
    await userEvent.click(within(sheet).getByRole('button', { name: 'Send Invitation' }))
    return sheet
  }

  it('lists superadmins without a status or row actions', async () => {
    signInAs('superadmin')
    vi.mocked(listSuperadminAccounts).mockResolvedValue(page([superadmin('p1', 'Pat', 'Go')]))
    renderAdmin(<UserManagementPage />, '/admin/users?tab=superadmins')
    await screen.findAllByText('Pat Go')
    const table = screen.getAllByRole('table', { hidden: true })[0]
    expect(within(table).getAllByRole('columnheader', { hidden: true }).map((h) => h.textContent)).toEqual(['#', 'Superadmin', 'Email', 'Added'])
    expect(screen.queryByRole('button', { name: /Deactivate|Activate|reset email/ })).not.toBeInTheDocument()
  })

  it('invites with the superadmin role', async () => {
    vi.mocked(inviteSuperadminAccountApi).mockResolvedValue({ account: superadmin('p2', 'Kim', 'Ng'), message: 'ok' })
    await openSuperadmins()
    await screen.findByRole('dialog', { name: 'Invitation sent' })
    expect(inviteSuperadminAccountApi).toHaveBeenCalledWith({ email: 'kim@example.com', firstName: 'Kim', lastName: 'Ng' })
  })

  it('explains the 403 the server gives when the role may not be assigned', async () => {
    vi.mocked(inviteSuperadminAccountApi).mockRejectedValue(new StaffApiError('forbidden', 'insufficient authority', 403))
    const sheet = await openSuperadmins()
    expect(await within(sheet).findByRole('alert')).toHaveTextContent("You can't invite superadmin accounts.")
  })
})
