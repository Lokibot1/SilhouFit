import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MotionGlobalConfig } from 'motion/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { ThemeProvider } from '../../src/contexts/ThemeContext'
import { ToastProvider } from '../../src/components/toast/ToastProvider'
import { fetchMe, type Me } from '../../src/service/fetchMe'
import { clearSession, getSession, setSession } from '../../src/service/session'
import { StaffLayout } from '../../src/views/staff/StaffLayout'

vi.mock('../../src/service/fetchMe', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/service/fetchMe')>()),
  fetchMe: vi.fn(),
}))
vi.mock('../../src/service/supabase', () => ({
  getSupabase: async () => ({ auth: { signOut: vi.fn().mockResolvedValue({ error: null }) } }),
}))
const load = vi.mocked(fetchMe)

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
  createdAt: '2026-01-15T08:30:00.000Z',
  updatedAt: '2026-01-15T08:30:00.000Z',
}

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} }))
})
afterEach(() => {
  vi.clearAllMocks()
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
      expect(screen.getByRole('link', { name: /Inventory/ })).toHaveAttribute('aria-disabled', 'true')
    })

    it('offers a retry when the profile fails to load', async () => {
      load.mockRejectedValueOnce(Object.assign(new Error('x'), { kind: 'network' })).mockResolvedValue(ME)
      renderStaff()
      await userEvent.click(await screen.findByRole('button', { name: 'Try again' }))
      expect(await screen.findByText('dashboard page')).toBeInTheDocument()
    })

    it('collapses the sidebar to icons, remembers it, and expands again', async () => {
      load.mockResolvedValue(ME)
      renderStaff()
      await screen.findByText('dashboard page')
      const sidebar = screen.getByRole('complementary', { name: 'Staff sidebar' })
      await userEvent.click(within(sidebar).getByRole('button', { name: 'Collapse sidebar' }))
      expect(localStorage.getItem('silhoufit.sidebar.collapsed')).toBe('1')
      // Still reachable by name, but the text is visually hidden.
      expect(within(sidebar).getByRole('link', { name: 'Dashboard' })).toHaveAttribute('href', '/staff')
      expect(within(sidebar).getByRole('link', { name: 'Dashboard' })).toHaveClass('size-11')
      await userEvent.click(within(sidebar).getByRole('button', { name: 'Expand sidebar' }))
      expect(localStorage.getItem('silhoufit.sidebar.collapsed')).toBe('0')
      expect(within(sidebar).getByRole('button', { name: 'Collapse sidebar' })).toHaveAttribute('aria-expanded', 'true')
    })

    it('keeps the account and theme controls in the top bar, not the sidebar', async () => {
      load.mockResolvedValue(ME)
      renderStaff()
      await screen.findByText('dashboard page')
      const sidebar = screen.getByRole('complementary', { name: 'Staff sidebar' })
      expect(within(sidebar).queryByRole('button', { name: /Log out|Sign out/ })).not.toBeInTheDocument()
      expect(within(sidebar).queryByRole('checkbox')).not.toBeInTheDocument()
      const topbar = screen.getByRole('banner')
      expect(within(topbar).getByRole('checkbox', { name: /Switch to (light|dark) mode/ })).toBeInTheDocument()
      expect(within(topbar).getByRole('button', { name: 'Account, Sam Reyes' })).toBeInTheDocument()
    })

    it('links Profile in the account menu to the staff profile', async () => {
      load.mockResolvedValue(ME)
      renderStaff()
      await userEvent.click(await screen.findByRole('button', { name: 'Account, Sam Reyes' }))
      const links = await screen.findAllByRole('link', { name: /Profile/ })
      expect(links).toHaveLength(2)
      links.forEach((link) => expect(link).toHaveAttribute('href', '/staff/profile'))
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
