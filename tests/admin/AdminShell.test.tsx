import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { FirstLoginPasswordGate } from '../../src/components/auth/FirstLoginPasswordGate'
import { StaffNav } from '../../src/components/staff/StaffNav'
import { ToastProvider } from '../../src/components/toast/ToastProvider'
import { ThemeProvider } from '../../src/contexts/ThemeContext'
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
      'Dashboard', 'Inventory', 'Measurements', 'Transactions', 'Online Orders', 'Messages', 'User Management', 'Activity Logs', 'AR Insights', 'Pricing & Promotions', 'Returns & Refunds',
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
    expect(screen.getAllByRole('link')).toHaveLength(11)
    expect(screen.queryByRole('link', { name: 'Profile' })).not.toBeInTheDocument()
    expect(document.querySelectorAll('li[aria-hidden="true"]')).toHaveLength(1)
  })
})

describe('admin dashboard', () => {
  it('shows the operations figures and the shared widgets, with the account figures left to user management', async () => {
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
    const figures = await screen.findByRole('region', { name: 'Refunds, AR and stock at a glance' })
    for (const gone of ['Customers', 'Staff', 'Admins']) expect(within(figures).queryByText(gone)).toBeNull()
    // The operations figures come from the sample orders and products.
    for (const label of ['Refunds', 'AR-ready products', 'Low or out of stock']) expect(await within(figures).findByText(label)).toBeInTheDocument()
    expect(within(figures).getByText('AR-ready products').nextSibling).toHaveTextContent('8')
    expect(within(figures).getByText('Low or out of stock').nextSibling).toHaveTextContent('2')
    for (const gone of ['Active accounts', 'Archived staff', 'First sign-in due']) expect(within(figures).queryByText(gone)).toBeNull()
    const hrefOf = (name: RegExp) => within(figures).getByRole('link', { name }).getAttribute('href')
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

  it('never asks an admin to change the password over the page, even when the account is flagged', async () => {
    act(() => setSession({ name: 'Dev Admin', email: ADMIN_ME.email, role: 'admin' }))
    load.mockResolvedValue({ ...ADMIN_ME, mustChangePassword: true })
    renderLayout('/admin/users')
    expect(await screen.findByText('users page')).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Change your temporary password' })).not.toBeInTheDocument()
  })
})

describe('FirstLoginPasswordGate', () => {
  const pending = { ...ADMIN_ME, id: 'stf-001', role: 'staff' as const, mustChangePassword: true }
  const TITLE = 'Change your temporary password'

  const onSignOut = vi.fn()
  function gate(me: Me = pending, sheetOpen = false) {
    renderAdmin(<FirstLoginPasswordGate me={me} sheetOpen={sheetOpen} onSignOut={onSignOut} />, '/staff')
  }

  it('tells a staff member on the temporary password to change it, with no form in it', async () => {
    gate()
    const dialog = await screen.findByRole('dialog', { name: TITLE })
    expect(within(dialog).getByRole('button', { name: 'Change password' })).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Remind me later' })).toBeInTheDocument()
    expect(within(dialog).queryByLabelText('New password')).not.toBeInTheDocument()
  })

  it('sends them to the staff profile with the change sheet open and stays hidden for the session', async () => {
    gate()
    await userEvent.click(await screen.findByRole('button', { name: 'Change password' }))
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/staff/profile'))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: TITLE })).not.toBeInTheDocument())
    expect(sessionStorage.getItem('silhoufit.password-gate.skipped.stf-001')).toBe('1')
  })

  it('can be put off with Remind me later, and Escape does the same', async () => {
    gate()
    await userEvent.click(await screen.findByRole('button', { name: 'Remind me later' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: TITLE })).not.toBeInTheDocument())
    expect(screen.getByTestId('where')).toHaveTextContent('/staff')
    expect(screen.getByTestId('where')).not.toHaveTextContent('/staff/profile')
    expect(sessionStorage.getItem('silhoufit.password-gate.skipped.stf-001')).toBe('1')
  })

  describe('after an administrator reset the password', () => {
    const reset = { ...pending, passwordResetRequired: true }
    const RESET_TITLE = 'Choose a new password'

    it('cannot be put off: only Change password and Sign out, no close button', async () => {
      gate(reset)
      const dialog = await screen.findByRole('dialog', { name: RESET_TITLE })
      expect(within(dialog).getByText('An administrator reset your password to the default. Choose your own now before you continue.')).toBeInTheDocument()
      expect(within(dialog).getByRole('button', { name: 'Change password' })).toBeInTheDocument()
      expect(within(dialog).getByRole('button', { name: 'Sign out' })).toBeInTheDocument()
      expect(within(dialog).queryByRole('button', { name: 'Remind me later' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: `Close ${RESET_TITLE}` })).not.toBeInTheDocument()
    })

    it('ignores Escape and the backdrop', async () => {
      gate(reset)
      await screen.findByRole('dialog', { name: RESET_TITLE })
      await userEvent.keyboard('{Escape}')
      fireEvent.pointerDown(document.querySelector('[aria-hidden="true"].absolute')!)
      expect(screen.getByRole('dialog', { name: RESET_TITLE })).toBeInTheDocument()
    })

    it('Sign out goes through the layout sign out, and the gate hides only while the change sheet is open', async () => {
      gate(reset)
      await userEvent.click(await screen.findByRole('button', { name: 'Sign out' }))
      expect(onSignOut).toHaveBeenCalledTimes(1)
    })

    it('stays hidden while the change sheet is open', () => {
      gate(reset, true)
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('is shown even when it was put off earlier this session, and Change password does not record a dismissal', async () => {
      sessionStorage.setItem('silhoufit.password-gate.skipped.stf-001', '1')
      gate({ ...reset, mustChangePassword: false })
      await userEvent.click(await screen.findByRole('button', { name: 'Change password' }))
      await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/staff/profile'))
    })
  })

  it('stays hidden when it was already put off this session', () => {
    sessionStorage.setItem('silhoufit.password-gate.skipped.stf-001', '1')
    gate()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('is not shown when no change is due', () => {
    gate({ ...pending, mustChangePassword: false })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it.each(['admin', 'superadmin', 'customer'] as const)('is never shown to a %s', (role) => {
    gate({ ...pending, role })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
