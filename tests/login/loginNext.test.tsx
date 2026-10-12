import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MotionGlobalConfig } from 'motion/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../../src/components/toast/ToastProvider'
import { clearSession, getSession } from '../../src/service/session'
import { submitGoogleSignIn } from '../../src/service/googleSignIn'
import { submitSignIn } from '../../src/service/signIn'
import { LoginPage } from '../../src/views/auth/LoginPage'

vi.mock('../../src/service/signIn', () => ({ submitSignIn: vi.fn() }))
vi.mock('../../src/service/googleSignIn', () => ({ submitGoogleSignIn: vi.fn() }))
const signIn = vi.mocked(submitSignIn)
const googleSignIn = vi.mocked(submitGoogleSignIn)
const USER = { name: 'Demo Shopper', email: 'demo@silhoufit.com' }

beforeAll(() => {
  vi.setConfig({ testTimeout: 15000 })
  MotionGlobalConfig.skipAnimations = true
  vi.stubGlobal('IntersectionObserver', class {
    observe() {}
    unobserve() {}
    disconnect() {}
  })
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} }))
})
beforeEach(() => {
  clearSession()
  signIn.mockResolvedValue({ ok: true, user: USER })
  googleSignIn.mockResolvedValue({ ok: true, user: USER })
})
afterEach(() => vi.clearAllMocks())

function Where() {
  const { pathname, search } = useLocation()
  return <p data-testid="where">{pathname + search}</p>
}

function renderLogin(url: string) {
  return render(
    <MemoryRouter initialEntries={['/start', url]} initialIndex={1}>
      <ToastProvider>
        <Where />
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="*" element={<p>somewhere else</p>} />
        </Routes>
      </ToastProvider>
    </MemoryRouter>,
  )
}

async function signInByEmail(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/^email$/i), 'demo@silhoufit.com')
  await user.type(screen.getByLabelText(/^password$/i), 'Demo@1234')
  await user.click(screen.getByRole('button', { name: 'Sign in' }))
}

describe('LoginPage return path', () => {
  it('goes to the page that asked for the sign-in, keeps the toast, and stores the session', async () => {
    const user = userEvent.setup()
    renderLogin('/login?next=%2Fshop%3Fitem%3Dp01%26action%3Dcart')
    await signInByEmail(user)
    expect(await screen.findByText('somewhere else')).toBeInTheDocument()
    expect(screen.getByTestId('where')).toHaveTextContent('/shop?item=p01&action=cart')
    expect(screen.getByText('Signed in. Welcome back.')).toBeInTheDocument()
    expect(getSession()).toEqual(USER)
  })

  it('replaces the login entry, so Back does not return to the form', async () => {
    const user = userEvent.setup()
    renderLogin('/login?next=%2Fshop')
    await signInByEmail(user)
    await screen.findByText('somewhere else')
    expect(screen.getByTestId('where')).toHaveTextContent('/shop')
  })

  it('also returns after a Google sign-in', async () => {
    const user = userEvent.setup()
    renderLogin('/login?next=%2Fcheckout%3Fitem%3Dp04')
    await user.click(screen.getByRole('button', { name: 'Sign in with Google' }))
    expect(await screen.findByText('somewhere else')).toBeInTheDocument()
    expect(screen.getByTestId('where')).toHaveTextContent('/checkout?item=p04')
  })

  it.each(['//evil.com', 'https://evil.com', '/\\evil.com'])('sends an unsafe next (%s) to /shop', async (next) => {
    const user = userEvent.setup()
    renderLogin(`/login?next=${encodeURIComponent(next)}`)
    await signInByEmail(user)
    await screen.findByText('somewhere else')
    expect(screen.getByTestId('where')).toHaveTextContent(/^\/shop$/)
  })

  it('keeps the welcome panel when there is no next', async () => {
    const user = userEvent.setup()
    renderLogin('/login')
    await signInByEmail(user)
    expect(await screen.findByRole('heading', { name: 'Welcome back' })).toBeInTheDocument()
    expect(screen.getByTestId('where')).toHaveTextContent('/login')
    expect(getSession()).toEqual(USER)
  })

  it('carries next to the sign-up page', () => {
    renderLogin('/login?next=%2Fshop%3Fitem%3Dp01')
    expect(screen.getByRole('link', { name: 'Join us today!' })).toHaveAttribute('href', '/signup?next=%2Fshop%3Fitem%3Dp01')
  })

  it('does not carry an unsafe next to the sign-up page', () => {
    renderLogin('/login?next=%2F%2Fevil.com')
    expect(screen.getByRole('link', { name: 'Join us today!' })).toHaveAttribute('href', '/signup')
  })
})
