import { act, render, screen } from '@testing-library/react'
import { MotionGlobalConfig } from 'motion/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../../src/components/toast/ToastProvider'
import { canView, DEFAULT_PERMISSIONS, PAGE_GROUPS, pageKeyFor } from '../../src/config/pagePermissions'
import { ThemeProvider } from '../../src/contexts/ThemeContext'
import { fetchMe, type Me } from '../../src/service/fetchMe'
import { fetchStaffNotifications } from '../../src/service/fetchStaffNotifications'
import { resetPermissions } from '../../src/service/permissionStore'
import { clearSession, setSession } from '../../src/service/session'
import { StaffLayout } from '../../src/views/staff/StaffLayout'
import type { Area } from '../../src/utils/staffRole'

vi.mock('../../src/service/fetchMe', async (importOriginal) => ({ ...(await importOriginal<typeof import('../../src/service/fetchMe')>()), fetchMe: vi.fn() }))
vi.mock('../../src/service/fetchStaffNotifications', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/service/fetchStaffNotifications')>()),
  fetchStaffNotifications: vi.fn(),
}))
vi.mock('../../src/service/supabase', () => ({ getSupabase: async () => ({ auth: { signOut: vi.fn().mockResolvedValue({ error: null }) } }) }))

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
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} }))
})
beforeEach(() => {
  localStorage.clear()
  resetPermissions()
  vi.mocked(fetchStaffNotifications).mockResolvedValue([])
})
afterEach(() => {
  vi.clearAllMocks()
  act(() => clearSession())
})

describe('who can open Reviews', () => {
  it('puts /staff, /admin and /superadmin reviews under one permission that staff and admins have by default', () => {
    for (const area of ['staff', 'admin', 'superadmin']) expect(pageKeyFor(`/${area}/reviews`)).toBe('reviews')
    expect(canView('staff', 'reviews', DEFAULT_PERMISSIONS)).toBe(true)
    expect(canView('admin', 'reviews', DEFAULT_PERMISSIONS)).toBe(true)
    expect(canView('superadmin', 'reviews', { customer: [], staff: [], admin: [] })).toBe(true)
    expect(canView('customer', 'reviews', DEFAULT_PERMISSIONS)).toBe(false)
  })

  it('is a toggle on the Permissions page for staff and admin', () => {
    const group = PAGE_GROUPS.find((g) => g.pages.some((p) => p.key === 'reviews'))!
    expect(group.roles).toEqual(['staff', 'admin'])
  })

  it.each<{ role: Me['role']; area: Area }>([
    { role: 'staff', area: 'staff' },
    { role: 'admin', area: 'admin' },
    { role: 'superadmin', area: 'superadmin' },
  ])('lets a $role open /$area/reviews and shows the nav link', async ({ role, area }) => {
    vi.mocked(fetchMe).mockResolvedValue({ ...ME, role })
    act(() => setSession({ name: 'Sam Reyes', email: ME.email, role }))
    render(
      <MemoryRouter initialEntries={[`/${area}/reviews`]}>
        <ThemeProvider>
          <ToastProvider>
            <Routes>
              <Route path={area} element={<StaffLayout area={area} />}>
                <Route path="reviews" element={<p>reviews page</p>} />
              </Route>
              <Route path="*" element={<p>somewhere else</p>} />
            </Routes>
          </ToastProvider>
        </ThemeProvider>
      </MemoryRouter>,
    )
    expect(await screen.findByText('reviews page')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Reviews' })).toHaveAttribute('href', `/${area}/reviews`)
    expect(screen.getByRole('link', { name: 'Reviews' })).toHaveAttribute('aria-current', 'page')
  })
})
