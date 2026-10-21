import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MotionGlobalConfig } from 'motion/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../../src/components/toast/ToastProvider'
import { getBodyProfile } from '../../src/service/bodyProfile'
import { fetchMe, MeError, type Me } from '../../src/service/fetchMe'
import { clearSession, getSession, setSession } from '../../src/service/session'
import { ProfilePage } from '../../src/views/private/ProfilePage'

vi.mock('../../src/service/fetchMe', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/service/fetchMe')>()),
  fetchMe: vi.fn(),
}))
// The body measurements section loads its own profile; it is covered in BodyMeasurements.test.tsx, so no real request here.
vi.mock('../../src/service/bodyProfile', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/service/bodyProfile')>()),
  getBodyProfile: vi.fn(),
}))
const signOutSupabase = vi.fn()
vi.mock('../../src/service/supabase', () => ({
  getSupabase: async () => ({ auth: { signOut: signOutSupabase } }),
}))
const load = vi.mocked(fetchMe)

const ME: Me = {
  id: 'user-1',
  email: 'anne@example.com',
  firstName: 'Anne',
  middleName: null,
  lastName: 'Santos',
  suffix: null,
  fullName: 'Anne Santos',
  avatarUrl: null,
  createdAt: '2026-01-15T08:30:00.000Z',
  updatedAt: '2026-01-15T08:30:00.000Z',
}

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} }))
})
beforeEach(() => {
  act(() => setSession({ name: 'Anne Santos', email: ME.email }))
  signOutSupabase.mockResolvedValue({ error: null })
  vi.mocked(getBodyProfile).mockResolvedValue(null)
})
afterEach(() => {
  vi.clearAllMocks()
  act(() => clearSession())
})

function Where() {
  const { pathname, search } = useLocation()
  return <p data-testid="where">{pathname + search}</p>
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/profile']}>
      <ToastProvider>
        <Where />
        <Routes>
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="*" element={<p>somewhere else</p>} />
        </Routes>
      </ToastProvider>
    </MemoryRouter>,
  )
}

describe('ProfilePage', () => {
  it('shows a loading status, then the profile with focus on the name', async () => {
    let finish: (me: Me) => void = () => {}
    load.mockReturnValue(new Promise((resolve) => (finish = resolve)))
    renderPage()
    expect(screen.getByRole('status', { name: 'Loading your profile' })).toBeInTheDocument()

    finish(ME)
    const heading = await screen.findByRole('heading', { level: 1, name: 'Anne Santos' })
    await waitFor(() => expect(heading).toHaveFocus())
    expect(screen.getByText('anne@example.com')).toBeInTheDocument()
    expect(screen.getByText('Member since')).toBeInTheDocument()
    expect(screen.getByText('January 15, 2026')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument()
  })

  it('builds the name from first and last when fullName is null, and omits what is missing', async () => {
    load.mockResolvedValue({ ...ME, fullName: null, createdAt: 'not a date' })
    renderPage()
    expect(await screen.findByRole('heading', { name: 'Anne Santos' })).toBeInTheDocument()
    expect(screen.queryByText('Member since')).not.toBeInTheDocument()
  })

  it('redirects to sign in, returning here, when nobody is signed in', async () => {
    act(() => clearSession())
    renderPage()
    expect(await screen.findByText('somewhere else')).toBeInTheDocument()
    expect(screen.getByTestId('where')).toHaveTextContent('/login?next=%2Fprofile')
  })

  it.each([
    ['network', /connection dropped/i],
    ['server', /went wrong on our side/i],
    ['rate-limit', /wait a minute/i],
  ] as const)('shows an alert for %s and refetches on Try again', async (kind, body) => {
    const user = userEvent.setup()
    load.mockRejectedValueOnce(new MeError(kind)).mockResolvedValueOnce(ME)
    renderPage()
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(body)
    expect(alert).toHaveTextContent(/couldn't load your profile/i)

    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('heading', { name: 'Anne Santos' })).toBeInTheDocument()
    expect(load).toHaveBeenCalledTimes(2)
  })

  it.each([
    ['customer', true],
    ['staff', false],
    ['admin', false],
    ['superadmin', false],
    [undefined, false],
  ] as const)('shows Replay the tour for a %s: %s', async (role, shown) => {
    load.mockResolvedValue({ ...ME, role })
    renderPage()
    await screen.findByRole('heading', { level: 1, name: 'Anne Santos' })
    expect(screen.queryByRole('button', { name: 'Replay the tour' }) !== null).toBe(shown)
    expect(screen.queryByRole('region', { name: /delivery address/i }) !== null).toBe(shown)
  })

  it('explains a missing profile with Sign out and no retry', async () => {
    load.mockRejectedValue(new MeError('not-found'))
    renderPage()
    expect(await screen.findByRole('alert')).toHaveTextContent(/couldn't find your profile/i)
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument()
  })

  it('ends the session and sends the user to sign in when the token is rejected', async () => {
    load.mockRejectedValue(new MeError('unauthorized'))
    renderPage()
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/login?next=%2Fprofile'))
    expect(getSession()).toBeNull()
    expect(signOutSupabase).toHaveBeenCalled()
  })

  it('signs out to the home page, not the sign-in page', async () => {
    const user = userEvent.setup()
    load.mockResolvedValue(ME)
    renderPage()
    await user.click(await screen.findByRole('button', { name: 'Sign out' }))
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent(/^\/$/))
    expect(getSession()).toBeNull()
    expect(signOutSupabase).toHaveBeenCalled()
    expect(screen.getByText('Signed out')).toBeInTheDocument()
  })
})
