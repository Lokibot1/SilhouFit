import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MotionGlobalConfig } from 'motion/react'
import { StrictMode } from 'react'
import { Link, MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../../src/components/toast/ToastProvider'
import { MeError } from '../../src/service/fetchMe'
import { fetchMe } from '../../src/service/fetchMe'
import { clearStashedNext } from '../../src/service/googleAuth'
import { updateMe } from '../../src/service/updateMe'
import { clearSession, getSession, setSession } from '../../src/service/session'
import { AuthCallbackPage } from '../../src/views/auth/AuthCallbackPage'

vi.mock('../../src/service/fetchMe', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/service/fetchMe')>()),
  fetchMe: vi.fn(),
}))
vi.mock('../../src/service/updateMe', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/service/updateMe')>()),
  updateMe: vi.fn(),
}))
const signOutSupabase = vi.fn()
const exchangeCodeForSession = vi.fn()
const setSupabaseSession = vi.fn()
vi.mock('../../src/service/supabase', () => ({
  getSupabase: async () => ({
    auth: { signOut: signOutSupabase, exchangeCodeForSession, setSession: setSupabaseSession },
  }),
}))
const me = vi.mocked(fetchMe)

const ME = {
  id: 'u1',
  email: 'demo@silhoufit.com',
  firstName: 'Demo',
  middleName: null,
  lastName: 'Shopper',
  suffix: null,
  fullName: 'Demo Shopper',
  avatarUrl: null,
  birthday: '1990-01-01',
  gender: null,
  createdAt: '2026-01-15T08:30:00.000Z',
  updatedAt: '2026-01-15T08:30:00.000Z',
}

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true
  vi.stubGlobal('IntersectionObserver', class {
    observe() {}
    unobserve() {}
    disconnect() {}
  })
})
beforeEach(async () => {
  // The last test's unmount signs out on a timer; let it fire before this test counts calls.
  await new Promise((resolve) => setTimeout(resolve))
  vi.clearAllMocks()
  clearSession()
  clearStashedNext()
  signOutSupabase.mockResolvedValue({ error: null })
  exchangeCodeForSession.mockResolvedValue({ data: {}, error: null })
  setSupabaseSession.mockResolvedValue({ data: {}, error: null })
  me.mockResolvedValue(ME)
})
afterEach(() => {
  vi.clearAllMocks()
  window.history.replaceState(null, '', '/')
})

function Where() {
  const { pathname, search } = useLocation()
  return <p data-testid="where">{pathname + search}</p>
}

// The page reads window.location, as the real redirect from Google leaves it.
function renderCallback(url: string, { strict = false } = {}) {
  window.history.replaceState(null, '', url)
  const tree = (
    <MemoryRouter initialEntries={['/auth/callback']}>
      <ToastProvider>
        <Where />
        <Link to="/somewhere">Leave</Link>
        <Routes>
          <Route path="/auth/callback" element={<AuthCallbackPage />} />
          <Route path="/profile" element={<p>profile page</p>} />
          <Route path="/auth/set-password" element={<p>set password page</p>} />
          <Route path="/login" element={<p>login page</p>} />
          <Route path="/checkout" element={<p>checkout page</p>} />
          <Route path="*" element={<p>somewhere else</p>} />
        </Routes>
      </ToastProvider>
    </MemoryRouter>
  )
  return render(strict ? <StrictMode>{tree}</StrictMode> : tree)
}

describe('AuthCallbackPage success', () => {
  it('stores the session, toasts and lands on /profile, leaving the code out of the URL', async () => {
    renderCallback('/auth/callback?code=abc')
    expect(await screen.findByText('profile page')).toBeInTheDocument()
    expect(screen.getByText('Signed in. Welcome back.')).toBeInTheDocument()
    expect(getSession()).toEqual({ name: 'Demo Shopper', email: 'demo@silhoufit.com' })
    expect(screen.getByTestId('where')).toHaveTextContent(/^\/profile$/)
  })

  it('builds the name from first and last name when fullName is null', async () => {
    me.mockResolvedValue({ ...ME, fullName: null })
    renderCallback('/auth/callback?code=abc')
    await screen.findByText('profile page')
    expect(getSession()).toEqual({ name: 'Demo Shopper', email: 'demo@silhoufit.com' })
  })

  it('returns to the stashed next path, and clears the stash', async () => {
    sessionStorage.setItem('silhoufit-auth-next', '/checkout?item=p04')
    renderCallback('/auth/callback?code=abc')
    expect(await screen.findByText('checkout page')).toBeInTheDocument()
    expect(screen.getByTestId('where')).toHaveTextContent('/checkout?item=p04')
    expect(sessionStorage.getItem('silhoufit-auth-next')).toBeNull()
  })

  it('ignores an unsafe stashed next', async () => {
    sessionStorage.setItem('silhoufit-auth-next', '//evil.com')
    renderCallback('/auth/callback?code=abc')
    await screen.findByText('profile page')
  })

  it('lets only one run finish under StrictMode: the first is aborted, so it signs in once', async () => {
    renderCallback('/auth/callback?code=abc', { strict: true })
    await screen.findByText('profile page')
    expect(me).toHaveBeenCalledTimes(2)
    // The one-time code is exchanged once, not once per run.
    expect(exchangeCodeForSession).toHaveBeenCalledTimes(1)
    expect(exchangeCodeForSession).toHaveBeenCalledWith('abc')
    // The first run is aborted before it can store a session or navigate.
    expect(me.mock.calls[0][0]?.signal?.aborted).toBe(true)
    expect(screen.getAllByText('Signed in. Welcome back.')).toHaveLength(1)
    expect(signOutSupabase).not.toHaveBeenCalled()
  })

  it('shows a labelled loading state while it waits', () => {
    me.mockReturnValue(new Promise(() => {}))
    renderCallback('/auth/callback?code=abc')
    expect(screen.getByRole('status', { name: 'Signing you in with Google' })).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

describe('AuthCallbackPage age gate', () => {
  const yearsAgo = (years: number) => `${new Date().getFullYear() - years}-01-01`

  it('blocks and signs out an account whose birthday is under 18', async () => {
    me.mockResolvedValue({ ...ME, birthday: yearsAgo(10) })
    renderCallback('/auth/callback?code=abc')
    expect(await screen.findByRole('heading', { name: /18 or older/i })).toBeInTheDocument()
    expect(getSession()).toBeNull()
    expect(signOutSupabase).toHaveBeenCalled()
  })

  it('asks for the birthday when there is none, and signs out if it is under 18', async () => {
    me.mockResolvedValue({ ...ME, birthday: null })
    const user = userEvent.setup()
    renderCallback('/auth/callback?code=abc')
    await screen.findByRole('heading', { name: 'Confirm your age' })
    await user.type(screen.getByLabelText(/^birthday$/i), yearsAgo(12))
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    expect(await screen.findByRole('heading', { name: /18 or older/i })).toBeInTheDocument()
    expect(updateMe).not.toHaveBeenCalled()
    expect(getSession()).toBeNull()
  })

  it('saves an adult birthday and carries on to the profile', async () => {
    me.mockResolvedValue({ ...ME, birthday: null })
    vi.mocked(updateMe).mockResolvedValue({ ...ME, birthday: yearsAgo(30) })
    const user = userEvent.setup()
    renderCallback('/auth/callback?code=abc')
    await screen.findByRole('heading', { name: 'Confirm your age' })
    await user.type(screen.getByLabelText(/^birthday$/i), yearsAgo(30))
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    expect(await screen.findByText('profile page')).toBeInTheDocument()
    expect(updateMe).toHaveBeenCalledWith({ birthday: yearsAgo(30) })
  })
})

describe('AuthCallbackPage exchange', () => {
  it('exchanges the code, then drops it from the address bar before loading the profile', async () => {
    me.mockImplementation(async () => {
      expect(window.location.search).toBe('')
      return ME
    })
    renderCallback('/auth/callback?code=abc')
    await screen.findByText('profile page')
    expect(exchangeCodeForSession).toHaveBeenCalledWith('abc')
  })

  it('hands implicit-flow tokens from the hash to Supabase', async () => {
    renderCallback('/auth/callback#access_token=at&refresh_token=rt&token_type=bearer')
    await screen.findByText('profile page')
    expect(setSupabaseSession).toHaveBeenCalledWith({ access_token: 'at', refresh_token: 'rt' })
    expect(exchangeCodeForSession).not.toHaveBeenCalled()
  })

  it.each(['invite', 'recovery'])('sends an emailed %s link to choose a password, with no profile loaded and no sign-in toast', async (type) => {
    renderCallback(`/auth/callback#access_token=at&refresh_token=rt&type=${type}`)
    expect(await screen.findByText('set password page')).toBeInTheDocument()
    expect(setSupabaseSession).toHaveBeenCalledWith({ access_token: 'at', refresh_token: 'rt' })
    expect(me).not.toHaveBeenCalled()
    expect(getSession()).toBeNull()
    expect(screen.queryByText('Signed in. Welcome back.')).not.toBeInTheDocument()
  })

  it('shows the expired-sign-in card and signs out when the exchange fails', async () => {
    exchangeCodeForSession.mockResolvedValue({ data: {}, error: new Error('invalid flow state') })
    renderCallback('/auth/callback?code=abc')
    expect(await screen.findByRole('alert')).toHaveTextContent(/expired or was already used/)
    expect(me).not.toHaveBeenCalled()
    expect(signOutSupabase).toHaveBeenCalledTimes(1)
  })
})

describe('AuthCallbackPage exchange failures and leaving', () => {
  it('shows the network copy with Try again when the exchange fails on a dropped connection', async () => {
    const user = userEvent.setup()
    const dropped = Object.assign(new Error('fetch failed'), { name: 'AuthRetryableFetchError', status: 0 })
    exchangeCodeForSession.mockResolvedValueOnce({ data: {}, error: dropped })
    renderCallback('/auth/callback?code=abc')
    expect(await screen.findByRole('alert')).toHaveTextContent(/connection dropped/)
    expect(signOutSupabase).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('profile page')).toBeInTheDocument()
    expect(exchangeCodeForSession).toHaveBeenCalledTimes(2)
  })

  it('treats a fetch TypeError during the exchange as a network failure', async () => {
    exchangeCodeForSession.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    renderCallback('/auth/callback?code=abc')
    expect(await screen.findByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })

  it('signs out only after a pending exchange settles when the user leaves mid-exchange', async () => {
    const user = userEvent.setup()
    let finish: (value: unknown) => void = () => {}
    exchangeCodeForSession.mockReturnValue(new Promise((resolve) => (finish = resolve)))
    renderCallback('/auth/callback?code=abc')
    await user.click(screen.getByRole('link', { name: 'Leave' }))
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(signOutSupabase).not.toHaveBeenCalled()
    finish({ data: {}, error: null })
    await waitFor(() => expect(signOutSupabase).toHaveBeenCalledTimes(1))
  })
})

describe('AuthCallbackPage titles', () => {
  it('says what happened on each state', async () => {
    me.mockReturnValue(new Promise(() => {}))
    const first = renderCallback('/auth/callback?code=abc')
    expect(document.title).toBe('Signing you in — SilhouFit')
    first.unmount()

    renderCallback('/auth/callback?error=access_denied')
    await screen.findByRole('heading', { name: 'You cancelled Google sign-in' })
    expect(document.title).toBe('Google sign-in cancelled — SilhouFit')
  })

  it('uses the failure title on an error card', async () => {
    me.mockRejectedValue(new MeError('not-found'))
    renderCallback('/auth/callback?code=abc')
    await screen.findByRole('alert')
    expect(document.title).toBe("Couldn't sign you in — SilhouFit")
  })
})

describe('AuthCallbackPage expired or reused links', () => {
  it.each([
    ['hash', '/auth/callback#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired'],
    ['query', '/auth/callback?error=access_denied&error_code=otp_expired'],
  ])('says the link has expired, not that Google sign-in was cancelled, in the %s', async (_where, url) => {
    renderCallback(url)
    const heading = await screen.findByRole('heading', { name: 'This link has expired or was already used' })
    expect(heading).toHaveFocus()
    expect(screen.getByRole('alert')).toHaveTextContent('Send a new reset email')
    expect(screen.getByRole('link', { name: 'Send a new reset email' })).toHaveAttribute('href', '/forgot-password')
    expect(screen.getByRole('link', { name: 'Back to login' })).toHaveAttribute('href', '/login')
    expect(document.body.textContent).not.toContain('cancelled')
    expect(document.body.textContent).not.toContain('Email link is invalid')
    expect(document.title).toBe('Link expired — KRAL')
    const description = document.querySelector('meta[name="description"]')?.getAttribute('content') ?? ''
    expect(description).toMatch(/expired/)
    expect(description.length).toBeGreaterThanOrEqual(150)
    expect(description.length).toBeLessThanOrEqual(160)
    expect(me).not.toHaveBeenCalled()
  })
})

describe('AuthCallbackPage cancelled or refused', () => {
  it.each([
    ['query', '/auth/callback?error=access_denied&error_code=access_denied&error_description=User+denied'],
    ['hash', '/auth/callback#error=access_denied&error_description=User+denied'],
  ])('shows a calm message, not an alert, for a cancelled consent in the %s', async (_where, url) => {
    renderCallback(url)
    const heading = await screen.findByRole('heading', { name: 'You cancelled Google sign-in' })
    expect(heading).toHaveFocus()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to login' })).toHaveAttribute('href', '/login')
    expect(me).not.toHaveBeenCalled()
    expect(window.location.search + window.location.hash).toBe('')
    expect(document.body.textContent).not.toContain('User denied')
  })

  it('treats another provider error as a failure, without echoing its text', async () => {
    renderCallback('/auth/callback?error=server_error&error_description=Unable+to+exchange+external+code')
    expect(await screen.findByRole('alert')).toHaveTextContent("We couldn't finish signing you in.")
    expect(document.body.textContent).not.toContain('external code')
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument()
  })

  it('keeps the next path on Back to login', async () => {
    sessionStorage.setItem('silhoufit-auth-next', '/checkout')
    renderCallback('/auth/callback?error=access_denied')
    expect(await screen.findByRole('link', { name: 'Back to login' })).toHaveAttribute('href', '/login?next=%2Fcheckout')
  })
})

describe('AuthCallbackPage /users/me failures', () => {
  it('signs out and shows what happened, with no retry, for a missing profile (404)', async () => {
    me.mockRejectedValue(new MeError('not-found'))
    renderCallback('/auth/callback?code=abc')
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent("We couldn't find your profile.")
    expect(screen.getByRole('heading', { level: 1 })).toHaveFocus()
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument()
    expect(signOutSupabase).toHaveBeenCalledTimes(1)
    expect(getSession()).toBeNull()
    expect(screen.getByRole('link', { name: 'Back to login' })).toBeInTheDocument()
  })

  it('treats a rejected session (401) as an expired sign-in with no retry', async () => {
    me.mockRejectedValue(new MeError('unauthorized'))
    renderCallback('/auth/callback?code=abc')
    expect(await screen.findByRole('alert')).toHaveTextContent(/expired or was already used/)
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument()
    expect(signOutSupabase).toHaveBeenCalledTimes(1)
  })

  it('offers Try again for a server error (500), keeps the session, and finishes on retry', async () => {
    const user = userEvent.setup()
    me.mockRejectedValueOnce(new MeError('server'))
    renderCallback('/auth/callback?code=abc')
    expect(await screen.findByRole('alert')).toHaveTextContent(/went wrong on our side/)
    expect(signOutSupabase).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('profile page')).toBeInTheDocument()
    expect(me).toHaveBeenCalledTimes(2)
    expect(getSession()).toEqual({ name: 'Demo Shopper', email: 'demo@silhoufit.com' })
  })

  it('offers Try again for a network failure', async () => {
    me.mockRejectedValue(new MeError('network'))
    renderCallback('/auth/callback?code=abc')
    expect(await screen.findByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })

  it('signs out when the user leaves through Back to login', async () => {
    const user = userEvent.setup()
    me.mockRejectedValue(new MeError('server'))
    renderCallback('/auth/callback?code=abc')
    await user.click(await screen.findByRole('link', { name: 'Back to login' }))
    expect(await screen.findByText('login page')).toBeInTheDocument()
    expect(signOutSupabase).toHaveBeenCalledTimes(1)
  })

  it('signs out when the user leaves after a retryable failure by any other link', async () => {
    const user = userEvent.setup()
    me.mockRejectedValue(new MeError('network'))
    renderCallback('/auth/callback?code=abc')
    await screen.findByRole('button', { name: 'Try again' })
    expect(signOutSupabase).not.toHaveBeenCalled()
    await user.click(screen.getByRole('link', { name: 'Leave' }))
    await waitFor(() => expect(signOutSupabase).toHaveBeenCalledTimes(1))
  })

  it('signs out when the user leaves while it is still waiting', async () => {
    const user = userEvent.setup()
    me.mockReturnValue(new Promise(() => {}))
    renderCallback('/auth/callback?code=abc')
    await user.click(screen.getByRole('link', { name: 'Leave' }))
    await waitFor(() => expect(signOutSupabase).toHaveBeenCalledTimes(1))
  })

  it('does not sign out a finished sign-in, even under StrictMode', async () => {
    renderCallback('/auth/callback?code=abc', { strict: true })
    await screen.findByText('profile page')
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(signOutSupabase).not.toHaveBeenCalled()
  })
})

describe('AuthCallbackPage without a code', () => {
  it('sends a signed-in user to /profile', async () => {
    setSession({ name: 'Demo Shopper', email: 'demo@silhoufit.com' })
    renderCallback('/auth/callback')
    expect(await screen.findByText('profile page')).toBeInTheDocument()
    expect(me).not.toHaveBeenCalled()
  })

  it('sends a rejected reload (401) to /login and clears the orphan Supabase token', async () => {
    me.mockRejectedValue(new MeError('unauthorized'))
    renderCallback('/auth/callback')
    expect(await screen.findByText('login page')).toBeInTheDocument()
    expect(exchangeCodeForSession).not.toHaveBeenCalled()
    await waitFor(() => expect(signOutSupabase).toHaveBeenCalledTimes(1))
  })

  it('finishes the sign-in on a reload mid-wait, when only the Supabase session survived', async () => {
    sessionStorage.setItem('silhoufit-auth-next', '/checkout')
    renderCallback('/auth/callback')
    expect(await screen.findByText('checkout page')).toBeInTheDocument()
    expect(getSession()).toEqual({ name: 'Demo Shopper', email: 'demo@silhoufit.com' })
    expect(exchangeCodeForSession).not.toHaveBeenCalled()
    expect(sessionStorage.getItem('silhoufit-auth-next')).toBeNull()
  })

  it('signs out cleanly when the reloaded session has no profile', async () => {
    me.mockRejectedValue(new MeError('not-found'))
    renderCallback('/auth/callback')
    expect(await screen.findByRole('alert')).toHaveTextContent("We couldn't find your profile.")
    expect(signOutSupabase).toHaveBeenCalledTimes(1)
  })
})

describe('AuthCallbackPage privacy', () => {
  it('writes nothing to the console and stores only the name and email', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((method) =>
      vi.spyOn(console, method).mockImplementation(() => {}),
    )
    renderCallback('/auth/callback?code=secret-code')
    await screen.findByText('profile page')
    expect(spies.flatMap((spy) => spy.mock.calls)).toHaveLength(0)
    expect(JSON.stringify({ ...localStorage })).not.toContain('secret-code')
    expect(JSON.stringify({ ...sessionStorage })).not.toContain('secret-code')
  })
})
