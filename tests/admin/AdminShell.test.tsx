import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { FirstLoginPasswordGate } from '../../src/components/auth/FirstLoginPasswordGate'
import { StaffNav } from '../../src/components/staff/StaffNav'
import { ToastProvider } from '../../src/components/toast/ToastProvider'
import { ThemeProvider } from '../../src/contexts/ThemeContext'
import { getAccounts } from '../../src/service/accountStore'
import { getPermissions, resetPermissions, setRolePermissions } from '../../src/service/permissionStore'
import { fetchMe, type Me } from '../../src/service/fetchMe'
import { fetchStaffNotifications } from '../../src/service/fetchStaffNotifications'
import { clearSession, getSession, setSession } from '../../src/service/session'
import { AdminDashboardPage } from '../../src/views/admin/AdminDashboardPage'
import { StaffLayout } from '../../src/views/staff/StaffLayout'
import { ADMIN_ME, renderAdmin, resetAdminAccounts, setUpAdminDom, Where } from '../shared/adminSession'

vi.mock('../../src/service/simulateRequest', () => ({ simulateRequest: () => Promise.resolve({ ok: true }) }))
vi.mock('../../src/service/fetchMe', async (importOriginal) => ({ ...(await importOriginal<typeof import('../../src/service/fetchMe')>()), fetchMe: vi.fn() }))
vi.mock('../../src/service/supabase', () => ({ getSupabase: async () => ({ auth: { signOut: vi.fn().mockResolvedValue({ error: null }) } }) }))
vi.mock('../../src/service/fetchStaffNotifications', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/service/fetchStaffNotifications')>()),
  fetchStaffNotifications: vi.fn(),
}))
// The dashboard's sales widgets are covered by their own tests; here only the admin part is under test.
vi.mock('../../src/views/staff/StaffDashboardPage', () => ({
  StaffDashboardWidgets: ({ asideTop }: { asideTop?: ReactNode }) => (
    <>
      <p>sales widgets</p>
      {asideTop}
    </>
  ),
}))

const load = vi.mocked(fetchMe)

beforeAll(setUpAdminDom)
beforeEach(() => {
  resetPermissions()
  resetAdminAccounts()
  sessionStorage.clear()
  vi.mocked(fetchStaffNotifications).mockResolvedValue([])
})
afterEach(() => {
  vi.clearAllMocks()
  act(() => clearSession())
})

describe('admin navigation', () => {
  function nav(area: 'admin' | 'staff', collapsed = false) {
    return render(
      <MemoryRouter initialEntries={[`/${area}`]}>
        <StaffNav area={area} collapsed={collapsed} />
      </MemoryRouter>,
    )
  }

  it('lists every staff page, then the admin tools under their own heading', () => {
    nav('admin')
    // The headings are presentation only, so the list still reads as the ten pages. Profile is in the account menu, not the sidebar.
    expect(within(screen.getByRole('list')).getAllByRole('listitem').map((li) => li.textContent?.replace('Soon', '').trim())).toEqual([
      'Dashboard', 'Inventory', 'Measurements', 'Transactions', 'Online Orders', 'User Management', 'Activity Logs', 'AR Insights', 'Pricing & Promotions', 'Returns & Refunds',
    ])
    const order = [...document.querySelectorAll('li')].map((li) => li.textContent?.replace('Soon', '').trim())
    expect(order.indexOf('Operations')).toBe(0)
    expect(order.indexOf('Admin tools')).toBe(order.indexOf('User Management') - 1)
    expect(screen.getByRole('link', { name: 'Inventory' })).toHaveAttribute('href', '/admin/inventory')
    expect(screen.getByRole('link', { name: 'User Management' })).toHaveAttribute('href', '/admin/users')
    expect(screen.getByRole('link', { name: 'Online Orders' })).toHaveAttribute('href', '/admin/online-orders')
    expect(screen.getByRole('link', { name: 'Activity Logs' })).toHaveAttribute('href', '/admin/activity-logs')
    expect(screen.getByRole('link', { name: 'AR Insights' })).toHaveAttribute('href', '/admin/ar-insights')
    expect(screen.getByRole('link', { name: 'Pricing & Promotions' })).toHaveAttribute('href', '/admin/promotions')
    expect(screen.getByRole('link', { name: 'Returns & Refunds' })).toHaveAttribute('href', '/admin/refunds')
  })

  it('has no headings in the staff list', () => {
    nav('staff')
    expect(screen.queryByText('Operations')).not.toBeInTheDocument()
    expect(screen.queryByText('Admin tools')).not.toBeInTheDocument()
  })

  it('swaps the headings for a divider when collapsed, and keeps every link named', () => {
    nav('admin', true)
    expect(screen.queryByText('Operations')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'User Management' })).toHaveAttribute('href', '/admin/users')
    expect(screen.getAllByRole('link')).toHaveLength(10)
    expect(screen.queryByRole('link', { name: 'Profile' })).not.toBeInTheDocument()
    expect(document.querySelectorAll('li[aria-hidden="true"]')).toHaveLength(1)
  })
})

describe('admin dashboard', () => {
  it('shows the account figures and the shared widgets', async () => {
    load.mockResolvedValue(ADMIN_ME)
    act(() => setSession({ name: 'Dev Admin', email: ADMIN_ME.email, role: 'admin' }))
    render(
      <MemoryRouter initialEntries={['/admin']}>
        <ThemeProvider>
          <ToastProvider>
            <Routes>
              <Route path="admin" element={<StaffLayout area="admin" />}>
                <Route index element={<AdminDashboardPage />} />
              </Route>
            </Routes>
          </ToastProvider>
        </ThemeProvider>
      </MemoryRouter>,
    )
    expect(await screen.findByRole('heading', { level: 1, name: 'Hello, Dev' })).toBeInTheDocument()
    const accounts = getAccounts()
    const figures = await screen.findByRole('region', { name: 'Accounts at a glance' })
    await within(figures).findByText('Customers')
    expect(within(figures).getByText('Customers').nextSibling).toHaveTextContent(String(accounts.customers.length))
    expect(within(figures).getByText('Staff').nextSibling).toHaveTextContent(String(accounts.staff.length))
    // The operations figures come from the sample orders and products.
    for (const label of ['Refunds', 'AR-ready products', 'Low or out of stock']) expect(await within(figures).findByText(label)).toBeInTheDocument()
    expect(within(figures).getByText('AR-ready products').nextSibling).toHaveTextContent('8')
    expect(within(figures).getByText('Low or out of stock').nextSibling).toHaveTextContent('2')
    for (const gone of ['Active accounts', 'Archived staff', 'First sign-in due']) expect(within(figures).queryByText(gone)).toBeNull()
    const hrefOf = (name: RegExp) => within(figures).getByRole('link', { name }).getAttribute('href')
    expect(hrefOf(/^Customers: \d+, open customer list$/)).toBe('/admin/users?tab=customers')
    expect(hrefOf(/^Staff: \d+, open staff list$/)).toBe('/admin/users?tab=staff')
    expect(hrefOf(/^Admins: \d+, open admin list$/)).toBe('/admin/users?tab=admins')
    expect(hrefOf(/^Refunds: .*open returned transactions$/)).toBe('/admin/transactions?status=returned')
    expect(hrefOf(/^AR-ready products: 8, /)).toBe('/admin/inventory?ar=yes')
    expect(hrefOf(/^Low or out of stock: 2, /)).toBe('/admin/inventory')
    expect(screen.getByText('sales widgets')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Manage users' })).toHaveAttribute('href', '/admin/users')
    expect(await screen.findByRole('heading', { name: 'Activity Logs' })).toBeInTheDocument()
    // Sample orders, transactions and product changes are listed next to the account changes.
    expect(await screen.findByText('Order placed: SF-10231')).toBeInTheDocument()
    expect(screen.queryByText('Recent activity')).toBeNull()
  })
})

describe('StaffLayout for a simulated account', () => {
  function renderLayout(path: string) {
    return render(
      <MemoryRouter initialEntries={[path]}>
        <ThemeProvider>
          <ToastProvider>
            <Where />
            <Routes>
              <Route path="admin" element={<StaffLayout area="admin" />}>
                <Route path="users" element={<p>users page</p>} />
              </Route>
              <Route path="staff" element={<p>staff dashboard</p>} />
              <Route path="login" element={<p>login page</p>} />
            </Routes>
          </ToastProvider>
        </ThemeProvider>
      </MemoryRouter>,
    )
  }

  it('sends a staff member who opens /admin/users to their own dashboard, with a notice that a superadmin turned it off', async () => {
    act(() => setSession({ name: 'Sam Reyes', email: 'sam.reyes@silhoufit.dev', role: 'staff' }))
    load.mockResolvedValue({ ...ADMIN_ME, role: 'staff' })
    renderLayout('/admin/users')
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/staff'))
    expect(screen.getByText('That page is turned off for your role. Ask a superadmin if you need it.')).toBeInTheDocument()
  })

  it('lets staff open an admin page once a superadmin turns it on', async () => {
    act(() => setSession({ name: 'Sam Reyes', email: 'sam.reyes@silhoufit.dev', role: 'staff' }))
    load.mockResolvedValue({ ...ADMIN_ME, role: 'staff' })
    setRolePermissions('staff', [...getPermissions().staff, 'user-management'])
    renderLayout('/admin/users')
    expect(await screen.findByText('users page')).toBeInTheDocument()
  })

  it('sends staff who open /admin itself to their own dashboard', async () => {
    act(() => setSession({ name: 'Sam Reyes', email: 'sam.reyes@silhoufit.dev', role: 'staff' }))
    load.mockResolvedValue({ ...ADMIN_ME, role: 'staff' })
    renderLayout('/admin')
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/staff'))
    expect(screen.getByText('That page is for another role. This is your dashboard.')).toBeInTheDocument()
  })

  it('signs out an archived account and says why on the way to sign in', async () => {
    act(() => setSession({ name: 'Dev Admin', email: ADMIN_ME.email, role: 'admin' }))
    load.mockResolvedValue({ ...ADMIN_ME, status: 'archived' })
    renderLayout('/admin/users')
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/login'))
    expect(getSession()).toBeNull()
    expect(screen.getByText('This account has been archived. Contact an administrator.')).toBeInTheDocument()
  })

  it('asks for a new password over the page when the account must change it, and hides the screen once saved', async () => {
    act(() => setSession({ name: 'Dev Admin', email: ADMIN_ME.email, role: 'admin' }))
    load.mockResolvedValue({ ...ADMIN_ME, mustChangePassword: true })
    renderLayout('/admin/users')
    expect(await screen.findByText('users page')).toBeInTheDocument()
    const dialog = await screen.findByRole('dialog', { name: 'Choose a new password' })
    await userEvent.type(within(dialog).getByLabelText('New password'), 'Fresh#Pass1')
    await userEvent.type(within(dialog).getByLabelText('Confirm new password'), 'Fresh#Pass1')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save password' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Choose a new password' })).not.toBeInTheDocument())
    expect(getAccounts().passwords['adm-001']).toBe('Fresh#Pass1')
    expect(getAccounts().admins[0].mustChangePassword).toBe(false)
  })
})

describe('FirstLoginPasswordGate', () => {
  const pending = { ...ADMIN_ME, mustChangePassword: true }

  function gate(me: Me = pending, onChanged = vi.fn()) {
    renderAdmin(<FirstLoginPasswordGate me={me} onChanged={onChanged} />, '/admin')
    return { onChanged }
  }

  it('shows the requirements as you type and checks the two passwords match', async () => {
    gate()
    const dialog = await screen.findByRole('dialog', { name: 'Choose a new password' })
    const password = within(dialog).getByLabelText('New password')
    await userEvent.type(password, 'abc')
    expect(within(dialog).getByRole('group', { name: 'Password requirements' })).toHaveTextContent('At least 8 characters')
    await userEvent.type(within(dialog).getByLabelText('Confirm new password'), 'other')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save password' }))
    expect(within(dialog).getByText('Use at least 8 characters.')).toBeInTheDocument()
    expect(within(dialog).getByText('The two passwords do not match.')).toBeInTheDocument()
    expect(getAccounts().admins[0].mustChangePassword).toBe(false)
  })

  it('keeps emoji out of the password', async () => {
    gate()
    const dialog = await screen.findByRole('dialog', { name: 'Choose a new password' })
    await userEvent.type(within(dialog).getByLabelText('New password'), 'Ab😀cd')
    expect(within(dialog).getByLabelText('New password')).toHaveValue('Abcd')
  })

  it('can be skipped for now, comes back in a new session, and leaves the account flagged', async () => {
    const { onChanged } = gate()
    await userEvent.click(await screen.findByRole('button', { name: 'Skip for now' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Choose a new password' })).not.toBeInTheDocument())
    expect(onChanged).not.toHaveBeenCalled()
    expect(sessionStorage.getItem('silhoufit.password-gate.skipped.adm-001')).toBe('1')
  })

  it('does not offer Skip when the account cannot skip', async () => {
    gate({ ...pending, passwordChangeSkippable: false })
    await screen.findByRole('dialog', { name: 'Choose a new password' })
    expect(screen.queryByRole('button', { name: 'Skip for now' })).not.toBeInTheDocument()
  })

  it('is not shown when no change is due', () => {
    gate(ADMIN_ME)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
