import { render } from '@testing-library/react'
import { MotionGlobalConfig } from 'motion/react'
import type { ReactElement } from 'react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { vi } from 'vitest'
import { ToastProvider } from '../../src/components/toast/ToastProvider'
import { ThemeProvider } from '../../src/contexts/ThemeContext'
import { resetAccounts } from '../../src/service/accountStore'
import type { Me } from '../../src/service/fetchMe'

/** An admin as GET /users/me returns them. */
export const ADMIN_ME: Me = {
  id: 'adm-001',
  email: 'admin@silhoufit.dev',
  role: 'admin',
  firstName: 'Dev',
  middleName: null,
  lastName: 'Admin',
  suffix: null,
  fullName: 'Dev Admin',
  avatarUrl: null,
  birthday: null,
  gender: null,
  createdAt: '2026-01-15T08:30:00.000Z',
  updatedAt: '2026-01-15T08:30:00.000Z',
  status: 'active',
}

/** Call from beforeAll: no animation delays, and a matchMedia that reports a narrow screen (the table's cards and the modals' sheets still render). */
export function setUpAdminDom() {
  MotionGlobalConfig.skipAnimations = true
  // The summary cards reveal when scrolled into view; jsdom has no IntersectionObserver.
  vi.stubGlobal('IntersectionObserver', class { observe() {} unobserve() {} disconnect() {} })
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} }))
}

/** Call from beforeEach: every test starts from the sample accounts. */
export function resetAdminAccounts() {
  localStorage.clear()
  resetAccounts()
}

export function Where() {
  const { pathname, search } = useLocation()
  return <p data-testid="where">{pathname + search}</p>
}

/** Renders `element` on `path` with the providers the admin pages need. */
export function renderAdmin(element: ReactElement, path = '/admin/users') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ThemeProvider>
        <ToastProvider>
          <Where />
          <Routes>
            <Route path="/admin/users" element={element} />
            <Route path="*" element={element} />
          </Routes>
        </ToastProvider>
      </ThemeProvider>
    </MemoryRouter>,
  )
}
