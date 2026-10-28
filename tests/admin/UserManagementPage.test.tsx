import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { getAccounts } from '../../src/service/accountStore'
import { listStaff } from '../../src/service/accountService'
import { UserManagementPage } from '../../src/views/admin/UserManagementPage'
import { renderAdmin, resetAdminAccounts, setUpAdminDom } from '../shared/adminSession'

// The simulated requests answer at once; a test that needs a failure sets it on the wrapped listStaff.
vi.mock('../../src/service/simulateRequest', () => ({ simulateRequest: () => Promise.resolve({ ok: true }) }))
vi.mock('../../src/service/accountService', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../src/service/accountService')>()
  return { ...real, listStaff: vi.fn(real.listStaff) }
})

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
    expect(await within(tabpanel()).findByRole('button', { name: /Add staff account/ })).toBeInTheDocument()
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
  async function openStaff() {
    renderAdmin(<UserManagementPage />, '/admin/users?tab=staff')
    await screen.findAllByRole('button', { name: /Reset password for Sam Reyes/ })
  }

  it('creates an account, shows the credentials once and lists the new person', async () => {
    await openStaff()
    await userEvent.click(screen.getByRole('button', { name: /Add staff account/ }))
    const sheet = await screen.findByRole('dialog', { name: 'Add staff account' })

    await userEvent.click(within(sheet).getByRole('button', { name: 'Create account' }))
    expect(within(sheet).getByText('First name is required.')).toBeInTheDocument()
    expect(within(sheet).getByText('Last name is required.')).toBeInTheDocument()

    await userEvent.type(within(sheet).getByLabelText('First name'), 'Mar1')
    await userEvent.type(within(sheet).getByLabelText('Last name'), 'Santos')
    expect(within(sheet).getByLabelText('First name')).toHaveValue('Mar')
    await userEvent.type(within(sheet).getByLabelText('First name'), 'ia')
    expect(within(sheet).getByText('maria.santos')).toBeInTheDocument()
    await userEvent.click(within(sheet).getByRole('button', { name: 'Create account' }))

    const created = await screen.findByRole('dialog', { name: 'Staff account created' })
    expect(within(created).getByText('Username')).toBeInTheDocument()
    expect(within(created).getByText('maria.santos')).toBeInTheDocument()
    expect(within(created).getByText('maria.santos@silhoufit.dev')).toBeInTheDocument()
    expect(within(created).getByText('Temporary password')).toBeInTheDocument()
    expect(within(created).getByText(/Demo only, not secure/)).toBeInTheDocument()
    expect(within(created).getByRole('button', { name: 'Copy both' })).toBeInTheDocument()
    expect(within(created).getByRole('button', { name: 'Download image' })).toBeInTheDocument()
    expect(within(created).getByRole('button', { name: 'Print' })).toBeInTheDocument()
    expect(screen.getByText('Staff account created for Maria Santos')).toBeInTheDocument()

    await userEvent.click(within(created).getByRole('button', { name: 'Done' }))
    expect((await screen.findAllByText('maria.santos')).length).toBeGreaterThan(0)
    expect(getAccounts().staff[0]).toMatchObject({ username: 'maria.santos', mustChangePassword: true })
  })

  it('shows a new username and an error when the one shown was taken meanwhile', async () => {
    await openStaff()
    await userEvent.click(screen.getByRole('button', { name: /Add staff account/ }))
    const sheet = await screen.findByRole('dialog', { name: 'Add staff account' })
    await userEvent.type(within(sheet).getByLabelText('First name'), 'Sam')
    await userEvent.type(within(sheet).getByLabelText('Last name'), 'Reyes')
    // sam.reyes is taken already, so the sheet offers sam.reyes2.
    expect(within(sheet).getByText('sam.reyes2')).toBeInTheDocument()
  })

  it('asks before archiving, then archives with an undo, and restores from the Archived filter', async () => {
    await openStaff()
    await userEvent.click(row('Archive Sam Reyes'))
    const dialog = await screen.findByRole('dialog', { name: 'Archive Sam Reyes?' })
    expect(within(dialog).getByText('Are you sure?')).toBeInTheDocument()
    expect(getAccounts().staff.find((a) => a.username === 'sam.reyes')!.status).toBe('active')

    await userEvent.click(within(dialog).getByRole('button', { name: 'Archive account' }))
    expect(await screen.findByText('Sam Reyes archived')).toBeInTheDocument()
    expect(getAccounts().staff.find((a) => a.username === 'sam.reyes')!.status).toBe('archived')

    await userEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(await screen.findByText(/Archive undone/)).toBeInTheDocument()
    expect(getAccounts().staff.find((a) => a.username === 'sam.reyes')!.status).toBe('active')
  })

  it('cancels an archive without changing anything', async () => {
    await openStaff()
    await userEvent.click(row('Archive Sam Reyes'))
    const dialog = await screen.findByRole('dialog', { name: 'Archive Sam Reyes?' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(getAccounts().staff.find((a) => a.username === 'sam.reyes')!.status).toBe('active')
  })

  it('marks archived staff, offers Restore instead of Archive, and restores', async () => {
    await openStaff()
    expect(row('Restore Erwin Salazar')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Archive Erwin Salazar' })).not.toBeInTheDocument()
    await userEvent.click(row('Restore Erwin Salazar'))
    expect(await screen.findByText('Erwin Salazar restored')).toBeInTheDocument()
    expect(getAccounts().staff.find((a) => a.firstName === 'Erwin')!.status).toBe('active')
  })

  it('resets a password after asking, and shows the new credentials', async () => {
    await openStaff()
    await userEvent.click(row('Reset password for Sam Reyes'))
    const dialog = await screen.findByRole('dialog', { name: 'Reset password for Sam Reyes?' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Reset password' }))
    const credentials = await screen.findByRole('dialog', { name: 'Password reset' })
    expect(within(credentials).getByText('sam.reyes')).toBeInTheDocument()
    expect(getAccounts().staff.find((a) => a.username === 'sam.reyes')!.mustChangePassword).toBe(true)
  })

  it('shows the error with a retry when the list fails to load', async () => {
    vi.mocked(listStaff).mockRejectedValueOnce(Object.assign(new Error('x'), { kind: 'network' }))
    renderAdmin(<UserManagementPage />, '/admin/users?tab=staff')
    expect(await screen.findByText("We couldn't load the staff accounts.")).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect((await screen.findAllByRole('button', { name: /Reset password for Sam Reyes/ })).length).toBeGreaterThan(0)
  })
})

describe('Admins tab', () => {
  it('adds, but has no reset, archive or restore action and no archived filter anywhere', async () => {
    renderAdmin(<UserManagementPage />, '/admin/users?tab=admins')
    expect((await screen.findAllByText('Brian Dijamco')).length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: /Reset password|Archive|Restore/ })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('combobox', { name: 'Status' }))
    const options = within(screen.getByRole('listbox', { name: 'Status' })).getAllByRole('option')
    expect(options.map((o) => o.textContent)).toEqual(['All statuses', 'Active', 'Inactive'])
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
