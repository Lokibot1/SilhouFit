import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MotionGlobalConfig } from 'motion/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../../src/components/toast/ToastProvider'
import { requestPasswordReset } from '../../src/service/requestPasswordReset'
import { ForgotPasswordPage } from '../../src/views/auth/ForgotPasswordPage'

vi.mock('../../src/service/requestPasswordReset', () => ({ requestPasswordReset: vi.fn() }))
const reset = vi.mocked(requestPasswordReset)

beforeAll(() => {
  vi.setConfig({ testTimeout: 15000 })
  MotionGlobalConfig.skipAnimations = true
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
  reset.mockResolvedValue({ ok: true })
})
afterEach(() => vi.clearAllMocks())

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/forgot-password']}>
      <ToastProvider>
        <Routes>
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        </Routes>
      </ToastProvider>
    </MemoryRouter>,
  )
}

const email = () => screen.getByLabelText(/^email$/i)
const form = () => document.querySelector('form')!
const submitButton = () => screen.getByRole('button', { name: 'Send reset link' })
const backLink = () => screen.getByRole('link', { name: /back to (login|sign in)/i })

describe('ForgotPasswordPage structure', () => {
  it('shows an h1, one email field and a "Send reset link" button inside one form', () => {
    renderPage()
    expect(screen.getByRole('heading', { level: 1, name: 'Reset your password' })).toBeInTheDocument()
    expect(document.querySelectorAll('form')).toHaveLength(1)
    expect(form()).toContainElement(email())
    expect(form()).toContainElement(submitButton())
    expect(document.querySelector('input[type="password"]')).toBeNull()
    expect(email()).toHaveAttribute('autocomplete', 'email')
  })

  it('links back to /login', () => {
    renderPage()
    expect(backLink()).toHaveAttribute('href', '/login')
  })
})

describe('ForgotPasswordPage validation', () => {
  it('blocks an empty submit, shows the error, focuses the field and never calls the service', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(submitButton())

    expect(screen.getByText('Email is required.')).toBeInTheDocument()
    expect(email()).toHaveAttribute('aria-invalid', 'true')
    expect(email()).toHaveFocus()
    expect(reset).not.toHaveBeenCalled()
  })

  it('blocks a malformed email', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.type(email(), 'nope')
    await user.click(submitButton())

    expect(screen.getByText('Enter a valid email like name@example.com.')).toBeInTheDocument()
    expect(reset).not.toHaveBeenCalled()
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
})

describe('ForgotPasswordPage submit', () => {
  it('sends the trimmed, lower-cased email with an abort signal', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.type(email(), '  Anne@Example.COM ')
    await user.click(submitButton())

    expect(reset).toHaveBeenCalledTimes(1)
    expect(reset.mock.calls[0][0]).toEqual({ email: 'anne@example.com' })
    expect(reset.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal)
  })

  it('sends one request on a double submit and shows a disabled, busy pending state', async () => {
    const user = userEvent.setup()
    reset.mockReturnValue(new Promise(() => {}))
    renderPage()
    await user.type(email(), 'anne@example.com')

    await user.dblClick(submitButton())
    expect(reset).toHaveBeenCalledTimes(1)
    const pending = document.querySelector<HTMLButtonElement>('button[type="submit"]')!
    expect(pending).toBeDisabled()
    expect(pending).not.toHaveTextContent('Send reset link')
    expect(form()).toHaveAttribute('aria-busy', 'true')
  })

  it('gives the same generic answer whether or not an account exists, and never says which', async () => {
    const texts: string[] = []
    for (const address of ['anne@example.com', 'nobody-at-all@example.org']) {
      const user = userEvent.setup()
      const { unmount } = renderPage()
      await user.type(email(), address)
      await user.click(submitButton())

      const message = await screen.findByText(/if an account exists/i)
      texts.push(message.textContent ?? '')
      expect(document.body.textContent).not.toMatch(/no account|not found|doesn't exist|does not exist|not registered/i)
      expect(message.textContent).not.toContain(address)
      unmount()
    }
    expect(texts[1]).toBe(texts[0])
  })

  it('mentions that the link expires in 30 minutes and offers a way back to login', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.type(email(), 'anne@example.com')
    await user.click(submitButton())

    await screen.findByText(/if an account exists/i)
    expect(document.body.textContent).toMatch(/expires in 30 minutes/i)
    expect(backLink()).toHaveAttribute('href', '/login')
    expect(screen.queryByLabelText(/^email$/i)).not.toBeInTheDocument()
  })
})

describe('ForgotPasswordPage network failure', () => {
  it('shows a connection banner and a "Try again" toast that retries with the same email', async () => {
    const user = userEvent.setup()
    reset.mockRejectedValueOnce(new Error('network'))
    renderPage()
    await user.type(email(), 'anne@example.com')
    await user.click(submitButton())

    const alert = await within(form()).findByRole('alert')
    expect(alert).toHaveTextContent(/connection|network/i)
    expect(screen.queryByText(/if an account exists/i)).not.toBeInTheDocument()
    expect(email()).toHaveValue('anne@example.com')

    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(reset).toHaveBeenCalledTimes(2)
    expect(reset.mock.calls[1][0]).toEqual(reset.mock.calls[0][0])
    expect(await screen.findByText(/if an account exists/i)).toBeInTheDocument()
  })

  it('ignores a leftover "Try again" toast after the page has unmounted', async () => {
    const user = userEvent.setup()
    reset.mockRejectedValueOnce(new Error('network'))
    render(
      <MemoryRouter initialEntries={['/forgot-password']}>
        <ToastProvider>
          <Routes>
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/login" element={<p>Login page</p>} />
          </Routes>
        </ToastProvider>
      </MemoryRouter>,
    )
    await user.type(email(), 'anne@example.com')
    await user.click(submitButton())
    await screen.findByRole('button', { name: 'Try again' })
    expect(reset).toHaveBeenCalledTimes(1)

    await user.click(backLink())
    expect(await screen.findByText('Login page')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(reset).toHaveBeenCalledTimes(1)
  })

  it('aborts the request when the page unmounts', async () => {
    const user = userEvent.setup()
    let signal: AbortSignal | undefined
    reset.mockImplementation((_payload, options) => {
      signal = options?.signal
      return new Promise(() => {})
    })
    const { unmount } = renderPage()
    await user.type(email(), 'anne@example.com')
    await user.click(submitButton())

    unmount()
    expect(signal?.aborted).toBe(true)
  })
})

describe('ForgotPasswordPage document metadata', () => {
  it('sets a unique title and a 150-160 character description, restoring them on leave', () => {
    document.title = 'Before'
    const meta = document.createElement('meta')
    meta.name = 'description'
    meta.content = 'Previous description'
    document.head.appendChild(meta)

    const { unmount } = renderPage()
    expect(document.title).toBe('Reset your password — SilhouFit')
    expect(meta.content.length).toBeGreaterThanOrEqual(150)
    expect(meta.content.length).toBeLessThanOrEqual(160)

    unmount()
    expect(document.title).toBe('Before')
    expect(meta.content).toBe('Previous description')
    meta.remove()
  })
})
