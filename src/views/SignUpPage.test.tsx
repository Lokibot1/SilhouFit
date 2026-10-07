import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MotionGlobalConfig } from 'motion/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../components/toast/ToastProvider'
import { submitGoogleSignUp } from '../service/googleSignUp'
import { submitSignUp } from '../service/signUp'
import { SignUpPage } from './SignUpPage'

vi.mock('../service/signUp', () => ({ submitSignUp: vi.fn() }))
vi.mock('../service/googleSignUp', () => ({ submitGoogleSignUp: vi.fn() }))
const submit = vi.mocked(submitSignUp)
const googleSubmit = vi.mocked(submitGoogleSignUp)

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
  submit.mockResolvedValue({ ok: true })
  googleSubmit.mockResolvedValue({ ok: true })
})
afterEach(() => vi.clearAllMocks())

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/signup']}>
      <ToastProvider>
        <Routes>
          <Route path="/signup" element={<SignUpPage />} />
        </Routes>
      </ToastProvider>
    </MemoryRouter>,
  )
}

const field = (name: RegExp) => screen.getByLabelText(name)

type User = ReturnType<typeof userEvent.setup>

async function fillDetails(user: User) {
  await user.type(field(/^first name$/i), 'Anne')
  await user.type(field(/^last name$/i), 'Santos')
  await user.type(field(/^email$/i), 'anne@example.com')
  await user.type(field(/^phone number$/i), '09171234567')
}

const dialog = (name: string) => screen.findByRole('dialog', { name })
const closed = (name: string) =>
  waitFor(() => expect(screen.queryByRole('dialog', { name })).not.toBeInTheDocument())

// jsdom has no layout, so a document counts as scrolled to the end and "I understand" is live.
async function understand(user: User, name: 'Terms of Service' | 'Privacy Policy') {
  await user.click(within(await dialog(name)).getByRole('button', { name: 'I understand' }))
  await closed(name)
}

async function acknowledgeBoth(user: User) {
  await understand(user, 'Terms of Service')
  await understand(user, 'Privacy Policy')
}

const createAccount = () => screen.getByRole('button', { name: 'Create account' })

// Pressing Create account opens the legal flow, which ticks the box.
async function fillSecurity(user: User) {
  await user.click(createAccount())
  await acknowledgeBoth(user)
  expect(screen.getByRole('checkbox')).toBeChecked()
}

describe('SignUpPage single form', () => {
  it('shows one form with no stepper, step text or step navigation', () => {
    renderPage()
    expect(screen.getAllByRole('button', { name: /create account/i })).toHaveLength(1)
    expect(document.querySelectorAll('form')).toHaveLength(1)
    expect(screen.queryByText(/step \d/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /continue to security/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^back$/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /about you|secure your account/i })).not.toBeInTheDocument()
  })

  it('puts the four name fields and every other field in that one form, in order', () => {
    renderPage()
    const form = document.querySelector('form')!
    const labels = [/^first name$/i, /^last name$/i, /^middle name$/i, /^suffix$/i, /^email$/i, /^phone number$/i, ]
    const inputs = labels.map((label) => field(label))
    inputs.forEach((input) => expect(form).toContainElement(input))
    inputs.slice(1).forEach((input, i) =>
      expect(inputs[i].compareDocumentPosition(input) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy(),
    )
    expect(form).toContainElement(screen.getByRole('checkbox'))
    expect(form).toContainElement(createAccount())
  })

  it('does not collect a password', () => {
    renderPage()
    expect(screen.queryByLabelText(/password/i)).not.toBeInTheDocument()
    expect(document.querySelector('input[type="password"]')).toBeNull()
  })

  it('links "I already have an account" to /login', () => {
    renderPage()
    const login = screen.getByRole('link', { name: 'I already have an account' })
    expect(login).toHaveAttribute('href', '/login')
    expect(createAccount().compareDocumentPosition(login) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('blocks an empty submit, shows every error and focuses the first invalid field', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(createAccount())

    expect(screen.getByText('First name is required.')).toBeInTheDocument()
    expect(screen.getByText('Email is required.')).toBeInTheDocument()
    expect(screen.getByText('Phone number is required.')).toBeInTheDocument()
    expect(screen.getByText(/accept the Terms of Service/)).toBeInTheDocument()
    expect(submit).not.toHaveBeenCalled()
    expect(screen.queryByText(/middle name can/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/suffix can/i)).not.toBeInTheDocument()
    expect(field(/^first name$/i)).toHaveAttribute('aria-invalid', 'true')
    // The unread Terms open first, even though other fields are still empty.
    expect(await dialog('Terms of Service')).toBeInTheDocument()
  })

  it('opens the dialog for a legal link instead of leaving the page', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByRole('link', { name: /Privacy Policy/ }))
    expect(await dialog('Privacy Policy')).toBeInTheDocument()
  })

  it('validates on blur, then live', async () => {
    const user = userEvent.setup()
    renderPage()
    const email = field(/^email$/i)

    await user.type(email, 'nope')
    expect(screen.queryByText(/valid email/i)).not.toBeInTheDocument()
    await user.tab()
    expect(screen.getByText('Enter a valid email like name@example.com.')).toBeInTheDocument()

    await user.type(email, '@example.com')
    expect(screen.queryByText(/valid email/i)).not.toBeInTheDocument()
  })

  it('strips invalid characters from pasted text and lets paste through', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(field(/^first name$/i))
    await user.paste('J0hn\u{1F600}!')
    expect(field(/^first name$/i)).toHaveValue('Jhn')

    await user.click(field(/^middle name$/i))
    await user.paste('Dela 3 Cruz!')
    expect(field(/^middle name$/i)).toHaveValue('Dela Cruz')

    await user.click(field(/^suffix$/i))
    await user.paste('Jr.9 x\u{1F600}')
    expect(field(/^suffix$/i)).toHaveValue('Jr.x')

    await user.click(field(/^phone number$/i))
    await user.paste('+63 9a17')
    expect(field(/^phone number$/i)).toHaveValue('63917')
  })

  it('caps the phone at 11 digits and shows a counter', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(field(/^phone number$/i))
    await user.paste('0917123456789012')
    expect(field(/^phone number$/i)).toHaveValue('09171234567')
    expect(screen.getByText('11/11')).toBeInTheDocument()

    await user.type(field(/^phone number$/i), '99')
    expect(field(/^phone number$/i)).toHaveValue('09171234567')
  })

  it('keeps middle name and suffix optional and sets their autocomplete tokens', async () => {
    const user = userEvent.setup()
    renderPage()
    expect(field(/^middle name$/i)).toHaveAttribute('autocomplete', 'additional-name')
    expect(field(/^suffix$/i)).toHaveAttribute('autocomplete', 'honorific-suffix')
    expect(field(/^phone number$/i)).toHaveAttribute('autocomplete', 'tel-national')
    expect(field(/^phone number$/i)).toHaveAttribute('inputmode', 'tel')

    await fillDetails(user)
    await user.click(createAccount())
    expect(await dialog('Terms of Service')).toBeInTheDocument()
  })

  it('reports a phone with too few digits', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.type(field(/^phone number$/i), '12345')
    await user.tab()
    expect(screen.getByText('Enter a phone number with 7 to 11 digits.')).toBeInTheDocument()
  })

  it('clears a filled field and refocuses it', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.type(field(/^last name$/i), 'Lee')
    await user.click(screen.getByRole('button', { name: 'Clear last name' }))

    expect(field(/^last name$/i)).toHaveValue('')
    expect(field(/^last name$/i)).toHaveFocus()
  })
})

describe('SignUpPage security and submit', () => {
  it('opens the documents when only consent is missing, and links the legal pages', async () => {
    const user = userEvent.setup()
    renderPage()
    await fillDetails(user)
    await user.click(screen.getByRole('button', { name: 'Create account' }))

    expect(screen.getByText(/accept the Terms of Service/)).toBeInTheDocument()
    expect(await dialog('Terms of Service')).toBeInTheDocument()
    expect(submit).not.toHaveBeenCalled()

    expect(screen.getByRole('link', { name: /terms of service/i })).toHaveAttribute(
      'href',
      '/terms-of-service',
    )
    expect(screen.getByRole('link', { name: /privacy policy/i })).toHaveAttribute(
      'href',
      '/privacy-policy',
    )
  })

  it('focuses the consent box when both documents were read but the box is unticked', async () => {
    const user = userEvent.setup()
    renderPage()
    await fillDetails(user)
    await fillSecurity(user)
    await user.click(screen.getByRole('checkbox'))
    await user.click(createAccount())

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('checkbox')).toHaveFocus()
    expect(screen.getByText(/read and accept the Terms of Service/)).toBeInTheDocument()
    expect(submit).not.toHaveBeenCalled()
  })

  it('sends one request on a double submit, then shows the welcome panel', async () => {
    const user = userEvent.setup()
    let finish: () => void = () => {}
    submit.mockReturnValue(new Promise((resolve) => (finish = () => resolve({ ok: true }))))
    renderPage()
    await fillDetails(user)
    await fillSecurity(user)

    await user.dblClick(createAccount())
    expect(submit).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: /creating account/i })).toBeDisabled()
    expect(submit.mock.calls[0][0]).toMatchObject({
      email: 'anne@example.com',
      middleName: null,
      suffix: null,
      phone: '+639171234567',
    })
    expect(submit.mock.calls[0][0]).not.toHaveProperty('password')

    finish()
    const heading = await screen.findByRole('heading', { name: 'Welcome, Anne' })
    expect(heading).toHaveFocus()
    expect(screen.getByText('Check your email to finish setting up your account.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to home' })).toBeInTheDocument()
  })

  it('shows what went wrong on failure and retries with the same values', async () => {
    const user = userEvent.setup()
    submit.mockRejectedValueOnce(new Error('network'))
    renderPage()
    await fillDetails(user)
    await fillSecurity(user)
    await user.click(createAccount())

    await waitFor(() => expect(screen.getByText(/Nothing was saved/)).toBeInTheDocument())
    expect(screen.getByText("We couldn't create your account.")).toBeInTheDocument()

    await user.click(screen.getAllByRole('button', { name: 'Try again' })[0])
    expect(submit).toHaveBeenCalledTimes(2)
    expect(await screen.findByRole('heading', { name: 'Welcome, Anne' })).toBeInTheDocument()
  })

  it('aborts the request when the page unmounts', async () => {
    const user = userEvent.setup()
    let signal: AbortSignal | undefined
    submit.mockImplementation((_payload, options) => {
      signal = options?.signal
      return new Promise(() => {})
    })
    const { unmount } = renderPage()
    await fillDetails(user)
    await fillSecurity(user)
    await user.click(createAccount())

    unmount()
    expect(signal?.aborted).toBe(true)
  })
})

describe('SignUpPage legal consent flow', () => {
  async function fillAll(user: User) {
    await fillDetails(user)
  }

  it('opens Terms, then Privacy, then ticks the box without submitting', async () => {
    const user = userEvent.setup()
    renderPage()
    await fillAll(user)
    await user.click(createAccount())

    expect(await dialog('Terms of Service')).toBeInTheDocument()
    expect(screen.getByText(/read and accept the Terms of Service/)).toBeInTheDocument()
    await understand(user, 'Terms of Service')

    expect(await dialog('Privacy Policy')).toBeInTheDocument()
    expect(screen.getByRole('checkbox')).not.toBeChecked()
    await understand(user, 'Privacy Policy')

    expect(screen.getByRole('checkbox')).toBeChecked()
    expect(screen.queryByText(/read and accept the Terms of Service/)).not.toBeInTheDocument()
    expect(submit).not.toHaveBeenCalled()
    expect(createAccount()).toHaveFocus()

    await user.click(createAccount())
    expect(submit).toHaveBeenCalledTimes(1)
  })

  it('keeps reopening the documents when the box was ticked by hand', async () => {
    const user = userEvent.setup()
    renderPage()
    await fillAll(user)
    await user.click(screen.getByRole('checkbox'))

    expect(await dialog('Terms of Service')).toBeInTheDocument()
    expect(submit).not.toHaveBeenCalled()
    await acknowledgeBoth(user)
    expect(submit).not.toHaveBeenCalled()

    await user.click(createAccount())
    expect(submit).toHaveBeenCalledTimes(1)
  })

  it('reopens a document closed without "I understand" on the next submit, and only the unread ones', async () => {
    const user = userEvent.setup()
    renderPage()
    await fillAll(user)
    await user.click(createAccount())
    await dialog('Terms of Service')
    await user.keyboard('{Escape}')
    await closed('Terms of Service')
    expect(screen.getByRole('checkbox')).not.toBeChecked()
    expect(createAccount()).toHaveFocus()

    await user.click(createAccount())
    await understand(user, 'Terms of Service')
    await dialog('Privacy Policy')
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    await closed('Privacy Policy')
    expect(screen.getByRole('checkbox')).not.toBeChecked()

    await user.click(createAccount())
    expect(await dialog('Privacy Policy')).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Terms of Service' })).not.toBeInTheDocument()
    await understand(user, 'Privacy Policy')
    expect(screen.getByRole('checkbox')).toBeChecked()
    expect(submit).not.toHaveBeenCalled()
  })
})

describe('SignUpPage Google sign up', () => {
  const google = () => screen.getByRole('button', { name: 'Sign up with Google' })

  it('offers the button at the top, above the primary action', () => {
    renderPage()
    expect(google()).toBeEnabled()
    expect(
      google().compareDocumentPosition(field(/^first name$/i)) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(
      google().compareDocumentPosition(createAccount()) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  it('opens both documents first, then continues on its own and shows the welcome panel', async () => {
    const user = userEvent.setup()
    let finish: () => void = () => {}
    googleSubmit.mockReturnValue(new Promise((resolve) => (finish = () => resolve({ ok: true }))))
    renderPage()
    await user.click(google())

    expect(await dialog('Terms of Service')).toBeInTheDocument()
    expect(googleSubmit).not.toHaveBeenCalled()
    await understand(user, 'Terms of Service')
    expect(googleSubmit).not.toHaveBeenCalled()
    await understand(user, 'Privacy Policy')

    await waitFor(() => expect(googleSubmit).toHaveBeenCalledTimes(1))
    const pending = screen.getByRole('button', { name: 'Connecting to Google…' })
    expect(pending).toBeDisabled()
    expect(pending).toHaveAttribute('aria-busy', 'true')

    finish()
    const heading = await screen.findByRole('heading', { name: 'Welcome!' })
    expect(heading).toHaveFocus()
    expect(screen.getByText('Account created. Check your email to finish setting up.')).toBeInTheDocument()
    expect(submit).not.toHaveBeenCalled()
  })

  it('does not continue when a document is closed without "I understand"', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(google())
    await dialog('Terms of Service')
    await user.keyboard('{Escape}')
    await closed('Terms of Service')
    expect(googleSubmit).not.toHaveBeenCalled()

    await user.click(google())
    expect(await dialog('Terms of Service')).toBeInTheDocument()
  })

  it('reports a failure in a toast and retries from it', async () => {
    const user = userEvent.setup()
    googleSubmit.mockRejectedValueOnce(new Error('network'))
    renderPage()
    await user.click(google())
    await acknowledgeBoth(user)

    expect(await screen.findByText(/couldn't connect to Google/)).toBeInTheDocument()
    expect(google()).toBeEnabled()
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(googleSubmit).toHaveBeenCalledTimes(2)
    expect(await screen.findByRole('heading', { name: 'Welcome!' })).toBeInTheDocument()
  })

  it('sends one request on a double click', async () => {
    const user = userEvent.setup()
    googleSubmit.mockRejectedValueOnce(new Error('network'))
    renderPage()
    await user.click(google())
    await acknowledgeBoth(user)
    await screen.findByText(/couldn't connect to Google/)
    expect(googleSubmit).toHaveBeenCalledTimes(1)

    googleSubmit.mockReturnValue(new Promise(() => {}))
    await user.dblClick(google())
    expect(googleSubmit).toHaveBeenCalledTimes(2)
  })
})

describe('SignUpPage document metadata', () => {
  it('sets the title and a 150-160 character description, restoring them on leave', () => {
    document.title = 'Before'
    const meta = document.createElement('meta')
    meta.name = 'description'
    meta.content = 'Previous description'
    document.head.appendChild(meta)

    const { unmount } = renderPage()
    expect(document.title).toBe('Create your account — SilhouFit')
    expect(meta.content.length).toBeGreaterThanOrEqual(150)
    expect(meta.content.length).toBeLessThanOrEqual(160)

    unmount()
    expect(document.title).toBe('Before')
    expect(meta.content).toBe('Previous description')
    meta.remove()
  })
})
