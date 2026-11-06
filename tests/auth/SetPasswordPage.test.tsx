import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MotionGlobalConfig } from 'motion/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../../src/components/toast/ToastProvider'
import { fetchMe } from '../../src/service/fetchMe'
import { clearSession, getSession } from '../../src/service/session'
import { SetPasswordPage } from '../../src/views/auth/SetPasswordPage'

vi.mock('../../src/service/fetchMe', async (importOriginal) => ({ ...(await importOriginal<typeof import('../../src/service/fetchMe')>()), fetchMe: vi.fn() }))
const getSupabaseSession = vi.fn()
const updateUser = vi.fn()
vi.mock('../../src/service/supabase', () => ({ getSupabase: async () => ({ auth: { getSession: getSupabaseSession, updateUser, signOut: vi.fn().mockResolvedValue({ error: null }) } }) }))
const me = vi.mocked(fetchMe)

const ME = { id: 'u1', email: 'sam@example.com', role: 'staff' as const, firstName: 'Sam', middleName: null, lastName: 'Reyes', suffix: null, fullName: 'Sam Reyes', avatarUrl: null, birthday: null, gender: null, createdAt: '', updatedAt: '' }

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true
  vi.stubGlobal('IntersectionObserver', class { observe() {} unobserve() {} disconnect() {} })
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} }))
})
beforeEach(() => {
  getSupabaseSession.mockResolvedValue({ data: { session: { user: {} } } })
  updateUser.mockResolvedValue({ error: null })
  me.mockResolvedValue(ME)
})
afterEach(() => {
  vi.clearAllMocks()
  act(() => clearSession())
})

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/auth/set-password']}>
      <ToastProvider>
        <Routes>
          <Route path="/auth/set-password" element={<SetPasswordPage />} />
          <Route path="/staff" element={<p>staff home</p>} />
          <Route path="/login" element={<p>login page</p>} />
          <Route path="*" element={<p>elsewhere</p>} />
        </Routes>
      </ToastProvider>
    </MemoryRouter>,
  )
}

const fill = async (next: string, confirm: string) => {
  await userEvent.type(await screen.findByLabelText('New password'), next)
  await userEvent.type(screen.getByLabelText('Confirm password'), confirm)
  await userEvent.click(screen.getByRole('button', { name: 'Set password' }))
}

describe('SetPasswordPage', () => {
  it('says the link has expired, with a way to request another, when there is no session', async () => {
    getSupabaseSession.mockResolvedValue({ data: { session: null } })
    renderPage()
    expect(await screen.findByRole('alert')).toHaveTextContent('This link has expired.')
    expect(screen.getByRole('link', { name: 'Send a new reset email' })).toHaveAttribute('href', '/forgot-password')
    expect(updateUser).not.toHaveBeenCalled()
  })

  it('validates inline against the sign-up rules and the match, and sends nothing', async () => {
    renderPage()
    await fill('abc', 'abd')
    expect(screen.getByText('Use at least 8 characters.')).toBeInTheDocument()
    expect(screen.getByText("Passwords don't match.")).toBeInTheDocument()
    expect(updateUser).not.toHaveBeenCalled()
  })

  it.each([
    ['abcdefg1!', 'Add an uppercase letter.'],
    ['ABCDEFG1!', 'Add a lowercase letter.'],
    ['Abcdefgh!', 'Add a number.'],
    ['Abcdefg12', 'Add a special character, like ! or #.'],
  ])('blocks %s with a clear message', async (password, message) => {
    renderPage()
    await fill(password, password)
    expect(screen.getByText(message)).toBeInTheDocument()
    expect(updateUser).not.toHaveBeenCalled()
  })

  it('ticks the checklist and moves the strength meter as the person types', async () => {
    renderPage()
    const group = await screen.findByRole('group', { name: 'Password requirements' })
    expect(group).toHaveTextContent('Too weak')
    expect(screen.getByText('One uppercase letter').parentElement).toHaveTextContent('not met')
    await userEvent.type(screen.getByLabelText('New password'), 'Sup3r$ecret1')
    expect(screen.getByText('One uppercase letter').parentElement).toHaveTextContent('met')
    expect(screen.getByText('One uppercase letter').parentElement).not.toHaveTextContent('not met')
    expect(group).not.toHaveTextContent('Too weak')
  })

  it('sets the password through Supabase, stores the profile and lands on the role home', async () => {
    renderPage()
    await fill('Sup3r$ecret1', 'Sup3r$ecret1')
    expect(await screen.findByText('staff home')).toBeInTheDocument()
    expect(updateUser).toHaveBeenCalledWith({ password: 'Sup3r$ecret1' })
    expect(getSession()).toMatchObject({ name: 'Sam Reyes', email: 'sam@example.com', role: 'staff' })
  })

  it("shows Supabase's own message for a weak password and keeps the form", async () => {
    updateUser.mockResolvedValue({ error: { code: 'weak_password', status: 422, message: 'Password is known to be weak.' } })
    renderPage()
    await fill('Sup3r$ecret1', 'Sup3r$ecret1')
    expect(await screen.findByRole('alert')).toHaveTextContent('Password is known to be weak.')
    expect(screen.getByRole('button', { name: 'Set password' })).toBeEnabled()
    expect(getSession()).toBeNull()
  })

  it.each([
    [{ code: 'same_password', status: 422 }, 'This is already your password.'],
    [{ status: 429 }, 'Too many attempts.'],
    [{ status: 0 }, 'connection dropped'],
    [{ status: 401 }, 'This link has expired.'],
    [{ status: 403, code: 'session_not_found' }, 'This link has expired.'],
    [{ status: 400, name: 'AuthSessionMissingError', message: 'Auth session missing!' }, 'This link has expired.'],
    [{ status: 403, code: 'bad_jwt' }, 'This link has expired.'],
    [{ status: 500 }, 'went wrong on our side'],
  ])('explains %j', async (error, text) => {
    updateUser.mockResolvedValue({ error })
    renderPage()
    await fill('Sup3r$ecret1', 'Sup3r$ecret1')
    await waitFor(() => expect(document.body).toHaveTextContent(text))
  })
})
