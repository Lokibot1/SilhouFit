import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MotionGlobalConfig } from 'motion/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { ThemeProvider } from '../../src/contexts/ThemeContext'
import { ToastProvider } from '../../src/components/toast/ToastProvider'
import { fetchMe, type Me } from '../../src/service/fetchMe'
import { fetchStaffNotifications } from '../../src/service/fetchStaffNotifications'
import { setLoginNotice, takeLoginNotice } from '../../src/service/loginNotice'
import { clearSession, getSession, setSession } from '../../src/service/session'
import { ProfilePage } from '../../src/views/private/ProfilePage'
import { StaffLayout } from '../../src/views/staff/StaffLayout'

vi.mock('../../src/service/fetchMe', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/service/fetchMe')>()),
  fetchMe: vi.fn(),
}))
vi.mock('../../src/service/supabase', () => ({
  getSupabase: async () => ({ auth: { signOut: vi.fn().mockResolvedValue({ error: null }) } }),
}))
vi.mock('../../src/service/fetchStaffNotifications', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/service/fetchStaffNotifications')>()),
  fetchStaffNotifications: vi.fn(),
}))
const load = vi.mocked(fetchMe)
// jsdom has no layout: this decides whether the `lg` query (the sidebar is on screen) matches.
let wide = false

const ME: Me = {
  id: 'user-1',
  email: 'sam@example.com',
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
  MotionGlobalConfig.skipAnimations = true
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: wide, media: query, addEventListener() {}, removeEventListener() {} }))
})
afterEach(() => {
  vi.clearAllMocks()
  wide = false
  localStorage.clear()
  act(() => clearSession())
})

function Where() {
  const { pathname, search } = useLocation()
  return <p data-testid="where">{pathname + search}</p>
}

function renderStaff() {
  return render(
    <MemoryRouter initialEntries={['/staff']}>
      <ThemeProvider>
        <ToastProvider>
          <Where />
          <Routes>
            <Route path="staff" element={<StaffLayout />}>
              <Route index element={<p>dashboard page</p>} />
            </Route>
            <Route path="login" element={<p>login page</p>} />
            <Route path="profile" element={<p>profile page</p>} />
          </Routes>
        </ToastProvider>
      </ThemeProvider>
    </MemoryRouter>,
  )
}

describe('StaffLayout', () => {
  it('sends an anonymous visitor to sign in, then back', () => {
    renderStaff()
    expect(screen.getByTestId('where')).toHaveTextContent('/login?next=%2Fstaff')
    expect(load).not.toHaveBeenCalled()
  })

  describe('signed in', () => {
    beforeEach(() => {
      act(() => setSession({ name: 'Sam Reyes', email: ME.email }))
      vi.mocked(fetchStaffNotifications).mockResolvedValue([])
    })

    it('sends a customer to the profile with a notice', async () => {
      load.mockResolvedValue({ ...ME, role: 'customer' })
      renderStaff()
      await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/profile'))
      expect(screen.getByText('Staff pages need a staff account.')).toBeInTheDocument()
    })

    it('shows the shell and page for staff', async () => {
      load.mockResolvedValue(ME)
      renderStaff()
      expect(await screen.findByText('dashboard page')).toBeInTheDocument()
      expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('aria-current', 'page')
      expect(screen.getByRole('link', { name: 'Inventory' })).toHaveAttribute('href', '/staff/inventory')
      expect(screen.getByRole('link', { name: 'Transactions' })).toHaveAttribute('href', '/staff/transactions')
      expect(screen.getByRole('link', { name: 'Online Orders' })).toHaveAttribute('href', '/staff/online-orders')
    })

    it('marks the page as the staff area while mounted, and clears it on leaving', async () => {
      load.mockResolvedValue(ME)
      const { unmount } = renderStaff()
      expect(document.documentElement.dataset.area).toBe('staff')
      await screen.findByText('dashboard page')
      expect(document.documentElement.dataset.area).toBe('staff')
      unmount()
      expect(document.documentElement.dataset.area).toBeUndefined()
    })

    it('offers a retry when the profile fails to load', async () => {
      load.mockRejectedValueOnce(Object.assign(new Error('x'), { kind: 'network' })).mockResolvedValue(ME)
      renderStaff()
      await userEvent.click(await screen.findByRole('button', { name: 'Try again' }))
      expect(await screen.findByText('dashboard page')).toBeInTheDocument()
    })

    it('keeps the logo and the sidebar toggle out of the sidebar', async () => {
      wide = true
      load.mockResolvedValue(ME)
      renderStaff()
      await screen.findByText('dashboard page')
      const sidebar = screen.getByRole('complementary', { name: 'Staff sidebar' })
      expect(within(sidebar).queryByText('SilhouFit')).not.toBeInTheDocument()
      expect(within(sidebar).queryByRole('button')).not.toBeInTheDocument()
      expect(within(screen.getByRole('banner')).getByText('SilhouFit')).toBeInTheDocument()
    })

    it('keeps the logo out of the links and offers a Visit website globe to the landing page', async () => {
      load.mockResolvedValue(ME)
      renderStaff()
      await screen.findByText('dashboard page')
      const topbar = screen.getByRole('banner')
      expect(within(topbar).queryByRole('link', { name: /SilhouFit/ })).not.toBeInTheDocument()
      expect(within(topbar).getByRole('link', { name: 'Visit website' })).toHaveAttribute('href', '/')
    })

    it('collapses the sidebar to icons with the burger, remembers it, and expands again', async () => {
      wide = true
      load.mockResolvedValue(ME)
      renderStaff()
      await screen.findByText('dashboard page')
      const sidebar = screen.getByRole('complementary', { name: 'Staff sidebar' })
      const topbar = screen.getByRole('banner')
      await userEvent.click(within(topbar).getByRole('button', { name: 'Collapse sidebar' }))
      expect(localStorage.getItem('silhoufit.sidebar.collapsed')).toBe('1')
      // Still reachable by name, but the text is visually hidden.
      expect(within(sidebar).getByRole('link', { name: 'Dashboard' })).toHaveAttribute('href', '/staff')
      expect(within(sidebar).getByRole('link', { name: 'Dashboard' })).toHaveClass('size-11')
      await userEvent.click(within(topbar).getByRole('button', { name: 'Expand sidebar' }))
      expect(localStorage.getItem('silhoufit.sidebar.collapsed')).toBe('0')
      expect(within(topbar).getByRole('button', { name: 'Collapse sidebar' })).toHaveAttribute('aria-expanded', 'true')
    })

    it('opens the menu drawer with the burger below lg', async () => {
      load.mockResolvedValue(ME)
      renderStaff()
      await screen.findByText('dashboard page')
      const burger = within(screen.getByRole('banner')).getByRole('button', { name: 'Open menu' })
      expect(burger).toHaveAttribute('aria-haspopup', 'dialog')
      await userEvent.click(burger)
      const drawer = await screen.findByRole('dialog', { name: 'Menu' })
      expect(within(drawer).getByRole('link', { name: 'Dashboard' })).toHaveAttribute('href', '/staff')
    })

    it('keeps the bell and the account menu in the top bar, and the theme switch only in the account menu', async () => {
      load.mockResolvedValue(ME)
      renderStaff()
      await screen.findByText('dashboard page')
      const sidebar = screen.getByRole('complementary', { name: 'Staff sidebar' })
      expect(within(sidebar).queryByRole('button', { name: /Log out|Sign out/ })).not.toBeInTheDocument()
      expect(within(sidebar).queryByRole('checkbox')).not.toBeInTheDocument()
      const topbar = screen.getByRole('banner')
      expect(within(topbar).getByRole('button', { name: 'Notifications' })).toBeInTheDocument()
      expect(within(topbar).queryByRole('checkbox')).not.toBeInTheDocument()
      await userEvent.click(within(topbar).getByRole('button', { name: 'Account, Sam Reyes' }))
      const menu = await screen.findByRole('group', { name: 'Account' })
      expect(within(menu).getByRole('checkbox', { name: /Switch to (light|dark) mode/ })).toBeInTheDocument()
    })

    it('toggles the theme from anywhere on the Dark mode row and reaches it with the keyboard', async () => {
      load.mockResolvedValue(ME)
      renderStaff()
      await userEvent.click(await screen.findByRole('button', { name: 'Account, Sam Reyes' }))
      const menu = await screen.findByRole('group', { name: 'Account' })
      const switchInput = within(menu).getByRole<HTMLInputElement>('checkbox')
      const before = switchInput.checked
      await userEvent.click(within(menu).getByText('Dark mode'))
      expect(switchInput.checked).toBe(!before)
      // Tab walks Profile, Settings, the switch, then Sign out, and the panel stays open.
      act(() => within(menu).getByRole('link', { name: /Profile/ }).focus())
      await userEvent.tab()
      await userEvent.tab()
      expect(switchInput).toHaveFocus()
      await userEvent.keyboard('{Enter}')
      expect(switchInput.checked).toBe(before)
      await userEvent.tab()
      expect(within(menu).getByRole('button', { name: 'Sign out' })).toHaveFocus()
      expect(screen.getByRole('group', { name: 'Account' })).toBeInTheDocument()
    })

    it('links Profile in the account menu to the staff profile', async () => {
      load.mockResolvedValue(ME)
      renderStaff()
      await userEvent.click(await screen.findByRole('button', { name: 'Account, Sam Reyes' }))
      const links = await screen.findAllByRole('link', { name: /Profile/ })
      expect(links).toHaveLength(2)
      links.forEach((link) => expect(link).toHaveAttribute('href', '/staff/profile'))
    })

    it('asks staff on the temporary password to change it, over the page, until they put it off', async () => {
      load.mockResolvedValue({ ...ME, mustChangePassword: true })
      renderStaff()
      expect(await screen.findByText('dashboard page')).toBeInTheDocument()
      const dialog = await screen.findByRole('dialog', { name: 'Change your temporary password' })
      await userEvent.click(within(dialog).getByRole('button', { name: 'Remind me later' }))
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
      expect(screen.getByText('dashboard page')).toBeInTheDocument()
    })

    it('does not ask once the password is changed', async () => {
      load.mockResolvedValue({ ...ME, mustChangePassword: false })
      renderStaff()
      await screen.findByText('dashboard page')
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('goes to plain sign in, without a next, when the session ends after a password change', async () => {
      load.mockResolvedValue(ME)
      renderStaff()
      await screen.findByText('dashboard page')
      setLoginNotice('password-changed')
      act(() => clearSession())
      await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent(/^\/login$/))
      takeLoginNotice()
    })

    it('lands on plain sign in when the Sign out button on the profile is used', async () => {
      load.mockResolvedValue(ME)
      render(
        <MemoryRouter initialEntries={['/staff/profile']}>
          <ThemeProvider>
            <ToastProvider>
              <Where />
              <Routes>
                <Route path="staff" element={<StaffLayout />}>
                  <Route path="profile" element={<ProfilePage />} />
                </Route>
                <Route path="login" element={<p>login page</p>} />
              </Routes>
            </ToastProvider>
          </ThemeProvider>
        </MemoryRouter>,
      )
      await userEvent.click(await screen.findByRole('button', { name: 'Sign out' }))
      await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent(/^\/login$/))
    })

    it('signs out from the account menu to the login page with a toast', async () => {
      load.mockResolvedValue(ME)
      renderStaff()
      await userEvent.click(await screen.findByRole('button', { name: 'Account, Sam Reyes' }))
      await userEvent.click(await screen.findByRole('button', { name: 'Sign out' }))
      expect(getSession()).toBeNull()
      expect(screen.getByTestId('where')).toHaveTextContent(/^\/login/)
      expect(screen.getByText('Signed out')).toBeInTheDocument()
    })
  })
})
