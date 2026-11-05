import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MotionGlobalConfig } from 'motion/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../../src/components/toast/ToastProvider'
import { GoogleAuthError, startGoogleAuth } from '../../src/service/googleAuth'
import { peekLoginNotice, setLoginNotice } from '../../src/service/loginNotice'
import { submitSignIn } from '../../src/service/signIn'
import { LoginPage } from '../../src/views/auth/LoginPage'

vi.mock('../../src/service/signIn', () => ({ submitSignIn: vi.fn() }))
vi.mock('../../src/service/googleAuth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/service/googleAuth')>()),
  startGoogleAuth: vi.fn(),
}))
const signIn = vi.mocked(submitSignIn)
const googleSignIn = vi.mocked(startGoogleAuth)
const USER = { name: 'Demo Shopper', email: 'demo@silhoufit.com' }

beforeAll(() => {
  // Full-form typing with userEvent is slow when the whole suite runs in parallel.
  vi.setConfig({ testTimeout: 15000 })
  MotionGlobalConfig.skipAnimations = true
  // Reveal observes its wrapper; jsdom has no IntersectionObserver.
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  )
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    addEventListener() {},
    removeEventListener() {},
  }))
})

beforeEach(() => {
  signIn.mockResolvedValue({ ok: true, user: USER })
  googleSignIn.mockResolvedValue(undefined)
})
afterEach(() => {
  vi.clearAllMocks()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

function renderPage(url = '/login') {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <ToastProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/profile" element={<p>profile page</p>} />
        </Routes>
      </ToastProvider>
    </MemoryRouter>,
  )
}

type User = ReturnType<typeof userEvent.setup>

const email = () => screen.getByLabelText(/^email$/i)
const password = () => screen.getByLabelText(/^password$/i)
const submitButton = () => document.querySelector<HTMLButtonElement>('button[type="submit"]')!
const form = () => document.querySelector('form')!
const remember = () => screen.getByRole('checkbox', { name: 'Remember me' })
const google = () => screen.getByRole('button', { name: 'Sign in with Google' })
const follows = (a: Element, b: Element) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)

// One reserved stub credential lives in the service; the page is tested with the service mocked.
const VALID = { email: 'anne@example.com', password: 'Sup3r$ecret!' }

async function fill(user: User, values = VALID) {
  await user.type(email(), values.email)
  await user.type(password(), values.password)
}

async function fillAndSubmit(user: User, values = VALID) {
  await fill(user, values)
  await user.click(submitButton())
}

async function clearBoth(user: User) {
  await user.clear(email())
  await user.clear(password())
}

describe('LoginPage structure', () => {
  it('shows one form under a "Login" h1, with the labelled fields in order', () => {
    renderPage()
    expect(screen.getByRole('heading', { level: 1, name: 'Login' })).toBeInTheDocument()
    expect(document.querySelectorAll('form')).toHaveLength(1)
    expect(form()).toContainElement(email())
    expect(form()).toContainElement(password())
    expect(form()).toContainElement(submitButton())
    expect(follows(email(), password())).toBe(true)
    expect(submitButton()).toHaveTextContent('Sign in')
    expect(screen.getByRole('button', { name: 'Sign in' })).toBe(submitButton())
  })

  it('orders Email, Password, Remember me, Forgot password, submit, divider, Google, then the sign-up line', () => {
    renderPage()
    const ordered = [
      email(),
      password(),
      remember(),
      screen.getByRole('link', { name: 'Forgot password?' }),
      submitButton(),
      screen.getByText('or continue with'),
      google(),
      screen.getByRole('link', { name: 'Join us today!' }),
    ]
    ordered.slice(1).forEach((node, i) => expect(follows(ordered[i], node)).toBe(true))
  })

  it('offers no sign-up-only fields and exactly one checkbox, Remember me, unchecked by default', () => {
    renderPage()
    expect(screen.queryByLabelText(/first name|last name|phone/i)).not.toBeInTheDocument()
    expect(screen.getAllByRole('checkbox')).toEqual([remember()])
    expect(remember()).not.toBeChecked()
    expect(remember()).toBeEnabled()
    expect(screen.queryByRole('link', { name: 'Create an account' })).not.toBeInTheDocument()
  })

  it('tabs through email, password, show toggle, Remember me, Forgot password, submit, Google and the join link', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(email())
    const expected = [
      password(),
      screen.getByRole('button', { name: 'Show password' }),
      remember(),
      screen.getByRole('link', { name: 'Forgot password?' }),
      submitButton(),
      google(),
      screen.getByRole('link', { name: 'Join us today!' }),
    ]
    for (const node of expected) {
      await user.tab()
      expect(node).toHaveFocus()
    }
  })

  it('toggles Remember me by clicking its label or pressing Space', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByText('Remember me'))
    expect(remember()).toBeChecked()
    remember().focus()
    await user.keyboard(' ')
    expect(remember()).not.toBeChecked()
  })

  it('sets autocomplete tokens so password managers recognise the pair', () => {
    renderPage()
    expect(['email', 'username']).toContain(email().getAttribute('autocomplete'))
    expect(password()).toHaveAttribute('autocomplete', 'current-password')
  })

  it('masks the password by default and reveals it from the toggle', async () => {
    const user = userEvent.setup()
    renderPage()
    expect(password()).toHaveAttribute('type', 'password')
    await user.click(screen.getByRole('button', { name: 'Show password' }))
    expect(password()).toHaveAttribute('type', 'text')
    expect(screen.getByRole('button', { name: 'Hide password' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('links to forgot-password and, after the Google button, to sign-up from a one-sentence line', () => {
    renderPage()
    expect(screen.getByRole('link', { name: 'Forgot password?' })).toHaveAttribute('href', '/forgot-password')
    const join = screen.getByRole('link', { name: 'Join us today!' })
    expect(join).toHaveAttribute('href', '/signup')
    expect(follows(google(), join)).toBe(true)
    expect(join.parentElement).toHaveTextContent('Not a member yet? Join us today!')
    expect(screen.getAllByRole('link', { name: /join us today/i })).toHaveLength(1)
  })
})

describe('LoginPage validation', () => {
  it('blocks an empty submit, shows both errors, focuses the first invalid field and never calls the service', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(submitButton())

    expect(screen.getByText('Email is required.')).toBeInTheDocument()
    expect(screen.getByText('Password is required.')).toBeInTheDocument()
    expect(email()).toHaveAttribute('aria-invalid', 'true')
    expect(password()).toHaveAttribute('aria-invalid', 'true')
    expect(email()).toHaveFocus()
    expect(signIn).not.toHaveBeenCalled()
  })

  it('focuses the password when only it is invalid', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.type(email(), VALID.email)
    await user.click(submitButton())

    expect(screen.getByText('Password is required.')).toBeInTheDocument()
    expect(password()).toHaveFocus()
    expect(signIn).not.toHaveBeenCalled()
  })

  it('validates on blur, then live', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.type(email(), 'nope')
    expect(screen.queryByText(/valid email/i)).not.toBeInTheDocument()
    await user.tab()
    expect(screen.getByText('Enter a valid email like name@example.com.')).toBeInTheDocument()

    await user.type(email(), '@example.com')
    expect(screen.queryByText(/valid email/i)).not.toBeInTheDocument()
  })

  it('strips emoji pasted into the email field', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(email())
    await user.paste('anne\u{1F600}@example.com')
    expect(email()).toHaveValue('anne@example.com')
  })

  it('never sends a password containing emoji', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.type(email(), VALID.email)
    await user.click(password())
    await user.paste('Pass\u{1F600}word1')
    await user.click(submitButton())

    expect(screen.getByText("Password can't contain emoji.")).toBeInTheDocument()
    expect(password()).toHaveFocus()
    expect(signIn).not.toHaveBeenCalled()
  })

  it('accepts a weak password: strength is a sign-up rule, not a sign-in rule', async () => {
    const user = userEvent.setup()
    renderPage()
    await fillAndSubmit(user, { email: VALID.email, password: 'abc' })
    expect(signIn).toHaveBeenCalledTimes(1)
    expect(signIn.mock.calls[0][0]).toEqual({ email: VALID.email, password: 'abc', remember: false })
  })

  it('shows no password checklist or strength meter', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.type(password(), 'abc')
    expect(screen.queryByText(/at least 8 characters|uppercase|strong|weak/i)).not.toBeInTheDocument()
  })
})

describe('LoginPage submit', () => {
  it('sends the trimmed, lower-cased email and the password exactly as typed', async () => {
    const user = userEvent.setup()
    renderPage()
    await fillAndSubmit(user, { email: '  Anne@Example.COM ', password: 'Sup3r$ecret!' })

    expect(signIn).toHaveBeenCalledTimes(1)
    expect(signIn.mock.calls[0][0]).toEqual({ email: 'anne@example.com', password: 'Sup3r$ecret!', remember: false })
    expect(signIn.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal)
  })

  it('passes remember: true when Remember me is checked, and keeps it for a retry', async () => {
    const user = userEvent.setup()
    signIn.mockResolvedValueOnce({ ok: false, reason: 'invalid' })
    renderPage()
    await fill(user)
    await user.click(remember())
    await user.click(submitButton())
    await within(form()).findByRole('alert')

    expect(signIn.mock.calls[0][0]).toEqual({ ...VALID, remember: true })
    expect(remember()).toBeChecked()
  })

  it('disables Remember me while a request is pending', async () => {
    const user = userEvent.setup()
    signIn.mockReturnValue(new Promise(() => {}))
    renderPage()
    await fillAndSubmit(user)
    expect(remember()).toBeDisabled()
  })

  it('sends one request on a double submit and shows a disabled, busy pending state', async () => {
    const user = userEvent.setup()
    signIn.mockReturnValue(new Promise(() => {}))
    renderPage()
    await fill(user)

    await user.dblClick(submitButton())
    expect(signIn).toHaveBeenCalledTimes(1)
    const pending = screen.getByRole('button', { name: 'Signing in…' })
    expect(pending).toBeDisabled()
    expect(pending).toBe(submitButton())
    expect(form()).toHaveAttribute('aria-busy', 'true')
  })

  it('submits from the keyboard with Enter in the password field', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.type(email(), VALID.email)
    await user.type(password(), `${VALID.password}{Enter}`)
    expect(signIn).toHaveBeenCalledTimes(1)
  })

  it('leaves for /profile with a success toast once signed in', async () => {
    const user = userEvent.setup()
    let finish: () => void = () => {}
    signIn.mockReturnValue(new Promise((resolve) => (finish = () => resolve({ ok: true, user: USER }))))
    renderPage()
    await fillAndSubmit(user)

    finish()
    expect(await screen.findByText('profile page')).toBeInTheDocument()
    expect(screen.getByText('Signed in. Welcome back.')).toBeInTheDocument()
    expect(screen.queryByLabelText(/^email$/i)).not.toBeInTheDocument()
    expect(document.querySelector('input[type="password"]')).toBeNull()
  })
})

describe('LoginPage invalid credentials', () => {
  beforeEach(() => signIn.mockResolvedValue({ ok: false, reason: 'invalid' }))

  it('shows one generic banner, identical for an unknown email and a wrong password, flagging no field', async () => {
    const user = userEvent.setup()
    renderPage()

    await fillAndSubmit(user, { email: 'nobody@example.com', password: 'Whatever1!' })
    const unknownEmail = await within(form()).findByRole('alert')
    const unknownEmailText = unknownEmail.textContent

    await clearBoth(user)
    await fillAndSubmit(user, { email: 'anne@example.com', password: 'WrongPass1!' })
    await waitFor(() => expect(signIn).toHaveBeenCalledTimes(2))
    const wrongPassword = await within(form()).findByRole('alert')

    expect(wrongPassword.textContent).toBe(unknownEmailText)
    expect(unknownEmailText).toMatch(/email or password/i)
    expect(unknownEmailText).not.toMatch(/no account|not found|doesn't exist|does not exist|not registered/i)
    expect(unknownEmailText).not.toContain('nobody@example.com')
    expect(screen.getAllByRole('alert')).toHaveLength(1)
    expect(email()).not.toHaveAttribute('aria-invalid')
    expect(password()).not.toHaveAttribute('aria-invalid')
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument()
  })

  it('keeps the form editable and ready for another attempt', async () => {
    const user = userEvent.setup()
    renderPage()
    await fillAndSubmit(user)
    await within(form()).findByRole('alert')

    expect(submitButton()).toBeEnabled()
    expect(submitButton()).toHaveTextContent('Sign in')
    expect(email()).toHaveValue(VALID.email)
  })
})

describe('LoginPage network failure', () => {
  it('shows a connection banner and a "Try again" toast that retries with the same values', async () => {
    const user = userEvent.setup()
    signIn.mockRejectedValueOnce(Object.assign(new Error('network'), { kind: 'network' }))
    renderPage()
    await fillAndSubmit(user)

    const alert = await within(form()).findByRole('alert')
    expect(alert).toHaveTextContent(/connection|network/i)
    expect(alert.textContent).not.toMatch(/email or password/i)
    expect(email()).not.toHaveAttribute('aria-invalid')
    expect(password()).not.toHaveAttribute('aria-invalid')
    expect(submitButton()).toBeEnabled()

    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(signIn).toHaveBeenCalledTimes(2)
    expect(signIn.mock.calls[1][0]).toEqual(signIn.mock.calls[0][0])
    // Wait for the success outcome rather than the pending form.
    expect(await screen.findByText('profile page')).toBeInTheDocument()
  })

  it.each([
    ['rate-limit', /too many sign-in attempts.*wait a minute/i],
    ['profile', /signed you in but couldn't load your profile.*contact support/i],
    ['server', /something went wrong on our side/i],
  ] as const)('shows %s copy in the banner and the toast, not the connection message', async (kind, copy) => {
    const user = userEvent.setup()
    signIn.mockRejectedValueOnce(Object.assign(new Error(kind), { kind }))
    renderPage()
    await fillAndSubmit(user)

    const alert = await within(form()).findByRole('alert')
    expect(alert).toHaveTextContent(copy)
    expect(alert.textContent).not.toMatch(/connection dropped/i)
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
    expect(screen.getAllByText(copy).length).toBeGreaterThan(0)
  })

  it('falls back to the server copy for an error without a kind', async () => {
    const user = userEvent.setup()
    signIn.mockRejectedValueOnce(new Error('VITE_SUPABASE_URL missing'))
    renderPage()
    await fillAndSubmit(user)
    expect(await within(form()).findByRole('alert')).toHaveTextContent(/something went wrong on our side/i)
  })

  it.each([
    ['email', async (user: User) => fillAndSubmit(user), signIn],
    ['Google', async (user: User) => user.click(google()), googleSignIn],
  ] as const)('ignores a leftover %s "Try again" toast after the page has unmounted', async (_name, start, service) => {
    const user = userEvent.setup()
    service.mockRejectedValueOnce(new Error('network'))
    render(
      <MemoryRouter initialEntries={['/login']}>
        <ToastProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
          <Route path="/profile" element={<p>profile page</p>} />
            <Route path="/signup" element={<p>Sign up page</p>} />
          </Routes>
        </ToastProvider>
      </MemoryRouter>,
    )
    await start(user)
    await screen.findByRole('button', { name: 'Try again' })
    expect(service).toHaveBeenCalledTimes(1)

    await user.click(screen.getByRole('link', { name: 'Join us today!' }))
    expect(await screen.findByText('Sign up page')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(service).toHaveBeenCalledTimes(1)
  })

  it('aborts the request when the page unmounts', async () => {
    const user = userEvent.setup()
    let signal: AbortSignal | undefined
    signIn.mockImplementation((_payload, options) => {
      signal = options?.signal
      return new Promise(() => {})
    })
    const { unmount } = renderPage()
    await fillAndSubmit(user)

    unmount()
    expect(signal?.aborted).toBe(true)
  })

  it('does not count connection failures toward the lockout', async () => {
    const user = userEvent.setup()
    signIn.mockRejectedValue(new Error('network'))
    renderPage()
    await fill(user)
    for (let i = 0; i < 5; i++) {
      await user.click(submitButton())
      await waitFor(() => expect(signIn).toHaveBeenCalledTimes(i + 1))
      await waitFor(() => expect(submitButton()).toBeEnabled())
    }
    expect(screen.queryByText(/too many attempts/i)).not.toBeInTheDocument()
  })
})

describe('LoginPage cooldown after repeated invalid credentials', () => {
  const MESSAGE = 'Too many attempts. Try again in 30 seconds.'

  async function failTimes(user: User, count: number) {
    await fill(user)
    for (let i = 0; i < count; i++) {
      await user.click(submitButton())
      await waitFor(() => expect(signIn).toHaveBeenCalledTimes(i + 1))
      if (i < count - 1) await waitFor(() => expect(submitButton()).toBeEnabled())
    }
  }

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    signIn.mockResolvedValue({ ok: false, reason: 'invalid' })
  })

  it('does not lock after four invalid results', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    renderPage()
    await failTimes(user, 4)

    await waitFor(() => expect(submitButton()).toBeEnabled())
    expect(screen.queryByText(/too many attempts/i)).not.toBeInTheDocument()
  })

  it('locks sign-in for 30 seconds after the fifth, blocks submits meanwhile, then re-enables', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    renderPage()
    await failTimes(user, 5)

    expect(await screen.findByText(MESSAGE)).toBeInTheDocument()
    expect(submitButton()).toBeDisabled()

    await user.type(password(), '{Enter}')
    expect(signIn).toHaveBeenCalledTimes(5)

    act(() => {
      vi.advanceTimersByTime(29_000)
    })
    expect(submitButton()).toBeDisabled()

    act(() => {
      vi.advanceTimersByTime(1_500)
    })
    await waitFor(() => expect(submitButton()).toBeEnabled())
    expect(screen.queryByText(/too many attempts/i)).not.toBeInTheDocument()

    await user.click(submitButton())
    await waitFor(() => expect(signIn).toHaveBeenCalledTimes(6))
  })

  it('starts counting again after the cooldown: one more invalid result does not lock straight away', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    renderPage()
    await failTimes(user, 5)
    await screen.findByText(MESSAGE)
    act(() => {
      vi.advanceTimersByTime(31_000)
    })
    await waitFor(() => expect(submitButton()).toBeEnabled())

    await user.click(submitButton())
    await waitFor(() => expect(signIn).toHaveBeenCalledTimes(6))
    await within(form()).findByRole('alert')
    expect(submitButton()).toBeEnabled()
    expect(screen.queryByText(/too many attempts/i)).not.toBeInTheDocument()
  })
})

describe('LoginPage Google sign in', () => {
  it('opens no legal dialog and starts Google once, showing a disabled, busy pending button', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(google())

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(googleSignIn).toHaveBeenCalledTimes(1)
    expect(googleSignIn).toHaveBeenCalledWith({ next: null })
    // The browser leaves for Google, so the page stays pending and does not sign in itself.
    const pending = screen.getByRole('button', { name: 'Connecting to Google…' })
    expect(pending).toBeDisabled()
    expect(pending).toHaveAttribute('aria-busy', 'true')
    expect(signIn).not.toHaveBeenCalled()
    expect(screen.queryByText('profile page')).not.toBeInTheDocument()
  })

  it('hands the next path to the service', async () => {
    const user = userEvent.setup()
    renderPage('/login?next=%2Fcheckout')
    await user.click(google())
    expect(googleSignIn).toHaveBeenCalledWith({ next: '/checkout' })
  })

  it('reports a failure in a toast, leaves the email form free of a banner, and retries from the toast', async () => {
    const user = userEvent.setup()
    googleSignIn.mockRejectedValueOnce(new GoogleAuthError('network'))
    renderPage()
    await user.click(google())

    expect(await screen.findByText(/couldn't reach Google sign-in/)).toBeInTheDocument()
    expect(google()).toBeEnabled()
    expect(within(form()).queryByRole('alert')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(googleSignIn).toHaveBeenCalledTimes(2)
    expect(screen.getByRole('button', { name: 'Connecting to Google…' })).toBeDisabled()
  })

  it('sends one request on a double click', async () => {
    const user = userEvent.setup()
    googleSignIn.mockReturnValue(new Promise(() => {}))
    renderPage()
    await user.dblClick(google())
    expect(googleSignIn).toHaveBeenCalledTimes(1)
  })

  it('becomes usable again when the page is restored from the back-forward cache', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(google())
    expect(google).toThrow()

    const event = new Event('pageshow') as PageTransitionEvent
    Object.defineProperty(event, 'persisted', { value: true })
    act(() => {
      window.dispatchEvent(event)
    })
    expect(google()).toBeEnabled()
  })
})

describe('LoginPage keeps the password private', () => {
  const SECRET = 'Sup3r$ecret!'

  it('never renders the password as text nor writes it to the console, across every outcome', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((method) =>
      vi.spyOn(console, method).mockImplementation(() => {}),
    )
    const user = userEvent.setup()
    signIn
      .mockResolvedValueOnce({ ok: false, reason: 'invalid' })
      .mockRejectedValueOnce(new Error(`network ${SECRET}`))
    renderPage()
    await fillAndSubmit(user, { email: VALID.email, password: SECRET })
    await within(form()).findByRole('alert')
    expect(document.body.textContent).not.toContain(SECRET)

    await user.click(screen.getByRole('button', { name: 'Show password' }))
    expect(document.body.textContent).not.toContain(SECRET)

    await user.click(submitButton())
    await screen.findByRole('button', { name: 'Try again' })
    expect(document.body.textContent).not.toContain(SECRET)

    await user.click(screen.getByRole('button', { name: 'Try again' }))
    await screen.findByText('profile page')
    expect(document.body.textContent).not.toContain(SECRET)

    const logged = spies.flatMap((spy) => spy.mock.calls).map((args) => args.map(String).join(' '))
    expect(logged.join('\n')).not.toContain(SECRET)
  })
})

describe('LoginPage document metadata', () => {
  it('sets the title and a 150-160 character description, restoring them on leave', () => {
    document.title = 'Before'
    const meta = document.createElement('meta')
    meta.name = 'description'
    meta.content = 'Previous description'
    document.head.appendChild(meta)

    const { unmount } = renderPage()
    expect(document.title).toBe('Sign in — SilhouFit')
    expect(meta.content.length).toBeGreaterThanOrEqual(150)
    expect(meta.content.length).toBeLessThanOrEqual(160)

    unmount()
    expect(document.title).toBe('Before')
    expect(meta.content).toBe('Previous description')
    meta.remove()
  })
})

describe('LoginPage after a password change', () => {
  it('shows a success status once, and clears the notice', () => {
    setLoginNotice('password-changed')
    const { unmount } = renderPage()
    const status = screen.getByRole('status')
    expect(status).toHaveTextContent('Password changed.')
    expect(status).toHaveTextContent('Sign in with your new password.')
    expect(peekLoginNotice()).toBeNull()
    unmount()
    renderPage()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})

describe('LoginPage after an administrator reset the password', () => {
  it('shows the notice once, in a status banner, and clears it', () => {
    setLoginNotice('password-reset')
    const { unmount } = renderPage()
    const status = screen.getByRole('status')
    expect(status).toHaveTextContent('Your password was reset by an administrator. Sign in with the default password and choose a new one.')
    expect(status).toHaveClass('text-base', 'border-info/40')
    expect(status).not.toHaveClass('border-danger/40')
    expect(peekLoginNotice()).toBeNull()
    unmount()
    renderPage()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('shows the expired temporary password notice in the same informational style', () => {
    setLoginNotice('password-expired')
    renderPage()
    const status = screen.getByRole('status')
    expect(status).toHaveTextContent('Your temporary password expired. Ask an administrator to reset your password again.')
    expect(status).toHaveClass('text-base', 'border-info/40')
    expect(peekLoginNotice()).toBeNull()
  })
})
