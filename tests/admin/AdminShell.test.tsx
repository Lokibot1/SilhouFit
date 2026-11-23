import { act, render, screen, waitFor, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { StaffNav } from '../../src/components/staff/StaffNav'
import { ToastProvider } from '../../src/components/toast/ToastProvider'
import { ThemeProvider } from '../../src/contexts/ThemeContext'
import { getPermissions, resetPermissions, setRolePermissions } from '../../src/service/permissionStore'
import { fetchMe } from '../../src/service/fetchMe'
import { clearSession, getSession, setSession } from '../../src/service/session'
import { AdminDashboardPage } from '../../src/views/admin/AdminDashboardPage'
import { StaffLayout } from '../../src/views/staff/StaffLayout'
import { ADMIN_ME, resetAdminAccounts, setUpAdminDom, Where } from '../shared/adminSession'

vi.mock('../../src/service/simulateRequest', () => ({ simulateRequest: () => Promise.resolve({ ok: true }) }))
vi.mock('../../src/service/fetchMe', async (importOriginal) => ({ ...(await importOriginal<typeof import('../../src/service/fetchMe')>()), fetchMe: vi.fn() }))
vi.mock('../../src/service/supabase', () => ({ getSupabase: async () => ({ auth: { signOut: vi.fn().mockResolvedValue({ error: null }) } }) }))
vi.mock('../../src/service/notificationsApi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/service/notificationsApi')>()),
  fetchUnreadCount: vi.fn().mockResolvedValue(0),
  fetchNotifications: vi.fn().mockResolvedValue({ items: [], total: 0, hasNextPage: false }),
}))
vi.mock('../../src/service/activityLogs', () => ({
  fetchActivityLogs: vi.fn().mockResolvedValue({
    data: [{ id: 'a1', category: 'order', action: 'ORDER_CREATED', actor: 'Anne Santos', actorId: 'c1', actorRole: 'customer', target: 'SF-10231', createdAt: '2026-11-10T02:30:00.000Z' }],
    meta: { total: 1, page: 1, limit: 20, totalPages: 1 },
  }),
}))
vi.mock('../../src/service/adminTransactionsApi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/service/adminTransactionsApi')>()),
  fetchTransactionTrend: vi.fn().mockResolvedValue(-8.3),
}))
vi.mock('../../src/service/adminOverview', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/service/adminOverview')>()),
  getStockFigures: vi.fn().mockResolvedValue({ out: 1, low: 1 }),
  getArFigures: vi.fn().mockResolvedValue({ ready: 8, products: 12 }),
  getRefundFigures: vi.fn().mockResolvedValue({ refunded: 212, payments: 2988 }),
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
      'Dashboard', 'Inventory', 'Measurements', 'Transactions', 'Online Orders', 'Messages', 'Reviews', 'User Management', 'Activity Logs', 'Pickup Location', 'Reports', 'AR Insights', 'Pricing & Promotions', 'Refunds', 'Help Chatbot',
    ])
    const order = [...document.querySelectorAll('li')].map((li) => li.textContent?.replace('Soon', '').trim())
    expect(order.indexOf('Operations')).toBe(0)
    expect(order.indexOf('Admin tools')).toBe(order.indexOf('User Management') - 1)
    expect(screen.getByRole('link', { name: 'Inventory' })).toHaveAttribute('href', '/admin/inventory')
    expect(screen.getByRole('link', { name: 'User Management' })).toHaveAttribute('href', '/admin/users')
    expect(screen.getByRole('link', { name: 'Online Orders' })).toHaveAttribute('href', '/admin/online-orders')
    expect(screen.getByRole('link', { name: 'Reviews' })).toHaveAttribute('href', '/admin/reviews')
    expect(screen.getByRole('link', { name: 'Activity Logs' })).toHaveAttribute('href', '/admin/activity-logs')
    expect(screen.getByRole('link', { name: 'Pickup Location' })).toHaveAttribute('href', '/admin/pickup-location')
    expect(screen.getByRole('link', { name: 'Reports' })).toHaveAttribute('href', '/admin/reports')
    expect(screen.getByRole('link', { name: 'AR Insights' })).toHaveAttribute('href', '/admin/ar-insights')
    expect(screen.getByRole('link', { name: 'Pricing & Promotions' })).toHaveAttribute('href', '/admin/promotions')
    expect(screen.getByRole('link', { name: 'Refunds' })).toHaveAttribute('href', '/admin/refunds')
    expect(screen.getByRole('link', { name: 'Help Chatbot' })).toHaveAttribute('href', '/admin/chatbot')
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
    expect(screen.getAllByRole('link')).toHaveLength(15)
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
    // The refund, AR-ready and stock figures all come from the (mocked) metrics endpoints.
    for (const label of ['Refunds', 'AR-ready products', 'Low or out of stock']) expect(await within(figures).findByText(label)).toBeInTheDocument()
    expect(within(figures).getByText('Refunds').nextSibling).toHaveTextContent('212')
    expect(within(figures).getByText('7.1% of 2,988 payments refunded')).toBeInTheDocument()
    // Fewer refunds than the same days last month is good news: a green pill, with the direction in the link's name.
    expect(await within(figures).findByText('−8.3%')).toHaveClass('bg-success/15')
    expect(within(figures).getByText('this month')).toBeInTheDocument()
    expect(within(figures).getByRole('link', { name: /^Refunds: 212, .*, down 8\.3% from the same days last month, open returned transactions$/ })).toBeInTheDocument()
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
    // The logged actions come from the API.
    expect(await screen.findByText('Order placed: SF-10231')).toBeInTheDocument()
    expect(screen.queryByText('Recent activity')).toBeNull()
    // Every figure is real, so nothing says Sample data.
    expect(within(figures).queryByText('Sample data')).toBeNull()
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
                <Route path="activity-logs" element={<p>logs page</p>} />
                <Route path="ar-insights" element={<p>insights page</p>} />
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
    setRolePermissions('staff', [...getPermissions().staff, 'ar-insights'])
    renderLayout('/admin/ar-insights')
    expect(await screen.findByText('insights page')).toBeInTheDocument()
  })

  it('keeps staff out of /admin/activity-logs even when activity-logs is in their saved permissions', async () => {
    act(() => setSession({ name: 'Sam Reyes', email: 'sam.reyes@silhoufit.dev', role: 'staff' }))
    load.mockResolvedValue({ ...ADMIN_ME, role: 'staff' })
    setRolePermissions('staff', [...getPermissions().staff, 'activity-logs'])
    renderLayout('/admin/activity-logs')
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/staff'))
    expect(screen.queryByText('logs page')).not.toBeInTheDocument()
  })

  it('keeps staff out of /admin/users even when user-management is in their saved permissions', async () => {
    act(() => setSession({ name: 'Sam Reyes', email: 'sam.reyes@silhoufit.dev', role: 'staff' }))
    load.mockResolvedValue({ ...ADMIN_ME, role: 'staff' })
    setRolePermissions('staff', [...getPermissions().staff, 'user-management'])
    renderLayout('/admin/users')
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/staff'))
    expect(screen.queryByText('users page')).not.toBeInTheDocument()
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
    expect(screen.getByText('This account has been deactivated. Contact an administrator.')).toBeInTheDocument()
  })

  it('signs out an account the API reports as deactivated (isActive false)', async () => {
    act(() => setSession({ name: 'Dev Admin', email: ADMIN_ME.email, role: 'admin' }))
    load.mockResolvedValue({ ...ADMIN_ME, status: undefined, isActive: false })
    renderLayout('/admin/users')
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/login'))
    expect(getSession()).toBeNull()
  })

  it('never shows a temporary-password pop-up, even for an old flagged profile', async () => {
    act(() => setSession({ name: 'Dev Admin', email: ADMIN_ME.email, role: 'admin' }))
    load.mockResolvedValue({ ...ADMIN_ME, mustChangePassword: true } as typeof ADMIN_ME)
    renderLayout('/admin/users')
    expect(await screen.findByText('users page')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
