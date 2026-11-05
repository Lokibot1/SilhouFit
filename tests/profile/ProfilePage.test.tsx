import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MotionGlobalConfig } from 'motion/react'
import { MemoryRouter, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../../src/components/toast/ToastProvider'
import { getBodyProfile } from '../../src/service/bodyProfile'
import { fetchMe, MeError, type Me } from '../../src/service/fetchMe'
import { updateMe, UpdateMeError } from '../../src/service/updateMe'
import { setLoginNotice, takeLoginNotice } from '../../src/service/loginNotice'
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
vi.mock('../../src/service/updateMe', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/service/updateMe')>()),
  updateMe: vi.fn(),
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
          <Route path="/:role/profile" element={<ProfilePage />} />
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

  it('keeps a simulated session simulated, shows the account and a note, and never signs out', async () => {
    act(() => setSession({ name: 'Sam Reyes', email: 'sam@silhoufit.dev', role: 'staff', simulated: true, accountId: 'stf-001', mustChangePassword: false }))
    load.mockResolvedValue({ ...ME, id: 'stf-001', email: 'sam@silhoufit.dev', firstName: 'Sam', lastName: 'Reyes', fullName: 'Sam Reyes', role: 'staff', phone: '+639171234567' })
    render(
      <MemoryRouter initialEntries={['/staff/profile']}>
        <ToastProvider>
          <Routes>
            <Route path="/staff/profile" element={<ProfilePage />} />
            <Route path="*" element={<p>somewhere else</p>} />
          </Routes>
        </ToastProvider>
      </MemoryRouter>,
    )
    expect(await screen.findByRole('heading', { level: 1, name: 'Sam Reyes' })).toBeInTheDocument()
    expect(screen.getByText('staff')).toBeInTheDocument()
    expect(screen.getByText('+639171234567')).toBeInTheDocument()
    expect(screen.getByRole('note')).toHaveTextContent('demo account saved in this browser')
    expect(screen.queryByRole('button', { name: 'Replay the tour' })).not.toBeInTheDocument()
    expect(getSession()).toMatchObject({ simulated: true, accountId: 'stf-001', initials: 'SR' })
    expect(signOutSupabase).not.toHaveBeenCalled()
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

  it.each([
    ['customer', false],
    ['staff', true],
    ['admin', false],
    ['superadmin', false],
    [undefined, false],
  ] as const)('shows Change password for a %s: %s, and Sign out has its icon for everyone', async (role, shown) => {
    load.mockResolvedValue({ ...ME, role })
    act(() => setSession({ name: 'Anne Santos', email: ME.email, role }))
    render(
      <MemoryRouter initialEntries={[role && role !== 'customer' ? `/${role}/profile` : '/profile']}>
        <ToastProvider>
          <Routes>
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/:role/profile" element={<ProfilePage />} />
          </Routes>
        </ToastProvider>
      </MemoryRouter>,
    )
    await screen.findByRole('heading', { level: 1, name: 'Anne Santos' })
    const change = screen.queryByRole('button', { name: 'Change password' })
    expect(change !== null).toBe(shown)
    if (change) expect(change.querySelector('svg')).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Sign out' }).querySelector('svg')).not.toBeNull()
  })

  it('opens the Change password sheet for staff', async () => {
    const user = userEvent.setup()
    load.mockResolvedValue({ ...ME, role: 'staff' })
    act(() => setSession({ name: 'Anne Santos', email: ME.email, role: 'staff' }))
    render(
      <MemoryRouter initialEntries={['/staff/profile']}>
        <ToastProvider>
          <Routes>
            <Route path="/staff/profile" element={<ProfilePage />} />
          </Routes>
        </ToastProvider>
      </MemoryRouter>,
    )
    await user.click(await screen.findByRole('button', { name: 'Change password' }))
    expect(await screen.findByRole('dialog', { name: 'Change password' })).toBeInTheDocument()
  })

  it('goes to plain sign in, without a next, when the session ends after a password change', async () => {
    load.mockResolvedValue(ME)
    renderPage()
    await screen.findByRole('heading', { level: 1, name: 'Anne Santos' })
    setLoginNotice('password-changed')
    act(() => clearSession())
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent(/^\/login$/))
    takeLoginNotice()
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

  it('signs out to the sign-in page', async () => {
    const user = userEvent.setup()
    load.mockResolvedValue(ME)
    renderPage()
    await user.click(await screen.findByRole('button', { name: 'Sign out' }))
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent(/^\/login$/))
    expect(getSession()).toBeNull()
    expect(signOutSupabase).toHaveBeenCalled()
    expect(screen.getByText('Signed out')).toBeInTheDocument()
  })

  it('tells the surrounding staff shell about a chosen sign out', async () => {
    const user = userEvent.setup()
    const onSignOut = vi.fn()
    load.mockResolvedValue(ME)
    render(
      <MemoryRouter initialEntries={['/staff/profile']}>
        <ToastProvider>
          <Routes>
            <Route element={<Outlet context={{ onSignOut }} />}>
              <Route path="/staff/profile" element={<ProfilePage />} />
            </Route>
          </Routes>
        </ToastProvider>
      </MemoryRouter>,
    )
    await user.click(await screen.findByRole('button', { name: 'Sign out' }))
    expect(onSignOut).toHaveBeenCalledTimes(1)
  })

  describe('editing the profile', () => {
    it('is offered to customers only', async () => {
      load.mockResolvedValue({ ...ME, role: 'customer' })
      const { unmount } = renderPage()
      expect(await screen.findByRole('button', { name: 'Edit profile' })).toBeInTheDocument()
      unmount()

      load.mockResolvedValue({ ...ME, role: undefined })
      renderPage()
      await screen.findByRole('heading', { level: 1, name: 'Anne Santos' })
      expect(screen.queryByRole('button', { name: 'Edit profile' })).not.toBeInTheDocument()
    })

    it('saves, then shows the new name, a toast and the updated session', async () => {
      const user = userEvent.setup()
      load.mockResolvedValue({ ...ME, role: 'customer' })
      vi.mocked(updateMe).mockResolvedValue({ ...ME, role: 'customer', lastName: 'Reyes', fullName: 'Anne Reyes' })
      renderPage()
      await user.click(await screen.findByRole('button', { name: 'Edit profile' }))
      const last = await screen.findByLabelText('Last name')
      await user.clear(last)
      await user.type(last, 'Reyes')
      await user.click(screen.getByRole('button', { name: 'Save changes' }))

      expect(await screen.findByRole('heading', { level: 1, name: 'Anne Reyes' })).toBeInTheDocument()
      expect(screen.getByText('Profile updated')).toBeInTheDocument()
      expect(getSession()?.name).toBe('Anne Reyes')
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('keeps the navbar initials to the first and last name, not the suffix', async () => {
      const user = userEvent.setup()
      load.mockResolvedValue({ ...ME, role: 'customer', firstName: 'Anna', middleName: 'Maria', lastName: 'Cruz', suffix: 'Jr.', fullName: 'Anna Maria Cruz Jr.' })
      renderPage()
      await screen.findByRole('heading', { level: 1, name: 'Anna Maria Cruz Jr.' })
      expect(getSession()?.initials).toBe('AC')
      expect(screen.getByRole('img', { name: 'Anna Maria Cruz Jr.' })).toHaveTextContent('AC')

      vi.mocked(updateMe).mockResolvedValue({ ...ME, role: 'customer', firstName: 'Beth', middleName: null, lastName: 'Diaz', suffix: 'III', fullName: 'Beth Diaz III' })
      await user.click(screen.getByRole('button', { name: 'Edit profile' }))
      await user.type(await screen.findByLabelText('Suffix (optional)'), 'x')
      await user.click(screen.getByRole('button', { name: 'Save changes' }))
      await waitFor(() => expect(getSession()?.initials).toBe('BD'))
    })

    it('ignores Escape and the close button while a save is pending', async () => {
      const user = userEvent.setup()
      load.mockResolvedValue({ ...ME, role: 'customer' })
      let finish: (me: Me) => void = () => {}
      vi.mocked(updateMe).mockReturnValue(new Promise((resolve) => (finish = resolve)))
      renderPage()
      await user.click(await screen.findByRole('button', { name: 'Edit profile' }))
      await user.type(await screen.findByLabelText('Suffix (optional)'), 'Jr')
      await user.click(screen.getByRole('button', { name: 'Save changes' }))
      await user.keyboard('{Escape}')
      await user.click(screen.getByRole('button', { name: 'Close Edit your profile' }))
      expect(screen.getByRole('dialog')).toBeInTheDocument()
      finish({ ...ME, role: 'customer', suffix: 'Jr' })
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    })

    it('ends the session when the token is rejected on save', async () => {
      const user = userEvent.setup()
      load.mockResolvedValue({ ...ME, role: 'customer' })
      vi.mocked(updateMe).mockRejectedValue(new UpdateMeError('unauthorized'))
      renderPage()
      await user.click(await screen.findByRole('button', { name: 'Edit profile' }))
      await user.type(await screen.findByLabelText('Suffix (optional)'), 'Jr')
      await user.click(screen.getByRole('button', { name: 'Save changes' }))
      await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/login?next=%2Fprofile'))
      expect(getSession()).toBeNull()
      expect(signOutSupabase).toHaveBeenCalled()
    })
  })
})
