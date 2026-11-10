import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MotionGlobalConfig } from 'motion/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../../src/components/toast/ToastProvider'
import { GoogleAuthError, startGoogleAuth } from '../../src/service/googleAuth'
import { submitSignUp } from '../../src/service/signUp'
import { SignUpPage } from '../../src/views/auth/SignUpPage'

vi.mock('../../src/service/signUp', () => ({ submitSignUp: vi.fn() }))
vi.mock('../../src/service/googleAuth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/service/googleAuth')>()),
  startGoogleAuth: vi.fn(),
}))
const submit = vi.mocked(submitSignUp)
const googleSubmit = vi.mocked(startGoogleAuth)

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
  googleSubmit.mockResolvedValue(undefined)
})
afterEach(() => vi.clearAllMocks())

function renderPage(url = '/signup') {
  return render(
    <MemoryRouter initialEntries={[url]}>
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
  await user.type(field(/^password$/i), 'Str0ng!Pass')
  await user.type(field(/^confirm password$/i), 'Str0ng!Pass')
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
    const labels = [/^first name$/i, /^last name$/i, /^middle name$/i, /^suffix$/i, /^email$/i, /^password$/i]
    const inputs = labels.map((label) => field(label))
    inputs.forEach((input) => expect(form).toContainElement(input))
    inputs.slice(1).forEach((input, i) =>
      expect(inputs[i].compareDocumentPosition(input) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy(),
    )
    expect(form).toContainElement(screen.getByRole('checkbox'))
    expect(form).toContainElement(createAccount())
  })

  it('collects a new password with a show/hide toggle and a checklist that shows only while it is focused', async () => {
    const user = userEvent.setup()
    renderPage()
    const password = field(/^password$/i)
    expect(document.querySelectorAll('input[type="password"]')).toHaveLength(2)
    expect(password).toHaveAttribute('autocomplete', 'new-password')
    const checklist = screen.getByRole('group', { name: 'Password requirements' })
    expect(checklist).toHaveClass('invisible')

    await user.type(password, 'Abcdefg1')
    expect(checklist).not.toHaveClass('invisible')
    expect(screen.getByText('One special character').nextElementSibling).toHaveTextContent('not met')
    await user.type(password, '!')
    expect(screen.getByText('One special character').nextElementSibling).toHaveTextContent('met')

    // Focus moving to the show/hide button keeps the checklist open.
    await user.click(screen.getAllByRole('button', { name: 'Show password' })[0])
    expect(password).toHaveAttribute('type', 'text')
    expect(checklist).not.toHaveClass('invisible')

    await user.click(field(/^confirm password$/i))
    expect(checklist).toHaveClass('invisible')
  })

  it('validates confirm password as the user types', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.type(field(/^password$/i), 'Str0ng!Pass')
    const confirm = field(/^confirm password$/i)
    await user.type(confirm, 'Str0ng')
    expect(screen.getByText("Passwords don't match.")).toBeInTheDocument()
    expect(confirm).toHaveAttribute('aria-invalid', 'true')
    await user.type(confirm, '!Pass')
    expect(screen.queryByText("Passwords don't match.")).not.toBeInTheDocument()
    await user.clear(confirm)
    expect(screen.getByText('Confirm your password.')).toBeInTheDocument()
  })

  it('links "Login now!" to /login', () => {
    renderPage()
    const login = screen.getByRole('link', { name: 'Login now!' })
    expect(login).toHaveAttribute('href', '/login')
    expect(createAccount().compareDocumentPosition(login) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('blocks an empty submit, shows every error and focuses the first invalid field', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(createAccount())

    expect(screen.getByText('First name is required.')).toBeInTheDocument()
    expect(screen.getByText('Email is required.')).toBeInTheDocument()
    expect(screen.getByText('Password is required.')).toBeInTheDocument()
    expect(screen.getByText(/accept the Terms of Service/)).toBeInTheDocument()
    expect(submit).not.toHaveBeenCalled()
    expect(screen.queryByText(/middle name can/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/suffix can/i)).not.toBeInTheDocument()
    expect(field(/^first name$/i)).toHaveAttribute('aria-invalid', 'true')
    // The fields come first: the unread Terms stay closed while other fields are empty, and focus goes to the first one.
    expect(screen.queryByRole('dialog', { name: 'Terms of Service' })).not.toBeInTheDocument()
    expect(field(/^first name$/i)).toHaveFocus()
  })

  it('opens the dialog for a legal link instead of leaving the page', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByRole('button', { name: /Privacy Policy/ }))
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
  })

  it('keeps middle name and suffix optional and sets their autocomplete tokens', async () => {
    const user = userEvent.setup()
    renderPage()
    expect(field(/^middle name$/i)).toHaveAttribute('autocomplete', 'additional-name')
    expect(field(/^suffix$/i)).toHaveAttribute('autocomplete', 'honorific-suffix')

    await fillDetails(user)
    await user.click(createAccount())
    expect(await dialog('Terms of Service')).toBeInTheDocument()
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

    // Buttons, not links: there is no href to follow, so they can only open the dialogs.
    for (const name of ['Terms of Service', 'Privacy Policy']) {
      const trigger = screen.getByRole('button', { name })
      expect(trigger).toHaveAttribute('aria-haspopup', 'dialog')
      expect(trigger).not.toHaveAttribute('href')
    }
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
    })
    expect(submit.mock.calls[0][0].password).toBe('Str0ng!Pass')

    finish()
    const heading = await screen.findByRole('heading', { name: 'Welcome, Anne' })
    expect(heading).toHaveFocus()
    expect(screen.getByText('anne@example.com')).toBeInTheDocument()
    expect(screen.getByText(/We sent a confirmation link to/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to home' })).toBeInTheDocument()
    // Sign-up does not sign anyone in, so the panel offers the way on.
    expect(screen.getByRole('link', { name: 'Go to login' })).toHaveAttribute('href', '/login')
  })

  it('carries the return path to the login links, and drops an unsafe one', () => {
    const { unmount } = renderPage('/signup?next=%2Fshop%3Fitem%3Dp01')
    expect(screen.getByRole('link', { name: 'Login now!' })).toHaveAttribute('href', '/login?next=%2Fshop%3Fitem%3Dp01')
    unmount()
    renderPage('/signup?next=%2F%2Fevil.com')
    expect(screen.getByRole('link', { name: 'Login now!' })).toHaveAttribute('href', '/login')
  })

  it('shows what went wrong on failure and retries with the same values', async () => {
    const user = userEvent.setup()
    submit.mockRejectedValueOnce(new Error('network'))
    renderPage()
    await fillDetails(user)
    await fillSecurity(user)
    await user.click(createAccount())

    // The banner and the retry toast both carry the copy.
    await waitFor(() => expect(screen.getAllByText(/Nothing was saved/).length).toBeGreaterThan(0))
    expect(screen.getByText("We couldn't create your account.")).toBeInTheDocument()

    await user.click(screen.getAllByRole('button', { name: 'Try again' })[0])
    expect(submit).toHaveBeenCalledTimes(2)
    expect(await screen.findByRole('heading', { name: 'Welcome, Anne' })).toBeInTheDocument()
  })

  it('shows a weak password inline on the field, focuses it and clears it on change', async () => {
    const user = userEvent.setup()
    submit.mockRejectedValueOnce(Object.assign(new Error('weak'), { kind: 'weak-password' }))
    renderPage()
    await fillDetails(user)
    await fillSecurity(user)
    await user.click(createAccount())

    const password = field(/^password$/i)
    expect(await screen.findByText(/too easy to guess/)).toBeInTheDocument()
    expect(password).toHaveAttribute('aria-invalid', 'true')
    expect(password).toHaveFocus()
    // Linked to the field by aria-describedby; no banner.
    const described = password.getAttribute('aria-describedby')!.split(' ')
    expect(described.map((id) => document.getElementById(id)?.textContent).join(' ')).toMatch(/too easy to guess/)

    await user.type(password, '9')
    expect(screen.queryByText(/too easy to guess/)).not.toBeInTheDocument()
  })

  it('drops a stale weak-password message when an unchanged resubmit fails on the server', async () => {
    const user = userEvent.setup()
    submit.mockRejectedValueOnce(Object.assign(new Error('weak'), { kind: 'weak-password' }))
    submit.mockRejectedValueOnce(Object.assign(new Error('boom'), { kind: 'server' }))
    renderPage()
    await fillDetails(user)
    await fillSecurity(user)
    await user.click(createAccount())
    expect(await screen.findByText(/too easy to guess/)).toBeInTheDocument()

    await user.click(createAccount())
    await waitFor(() => expect(screen.getAllByText(/Something went wrong on our side/).length).toBeGreaterThan(0))
    expect(screen.queryByText(/too easy to guess/)).not.toBeInTheDocument()
    expect(field(/^password$/i)).not.toHaveAttribute('aria-invalid', 'true')
  })

  it('shows a rejected email inline on the email field and focuses it', async () => {
    const user = userEvent.setup()
    submit.mockRejectedValueOnce(Object.assign(new Error('email'), { kind: 'invalid-email' }))
    renderPage()
    await fillDetails(user)
    await fillSecurity(user)
    await user.click(createAccount())

    const email = field(/^email$/i)
    expect(await screen.findByText(/Check it for typos/)).toBeInTheDocument()
    expect(email).toHaveAttribute('aria-invalid', 'true')
    expect(email).toHaveFocus()

    await user.type(email, 'm')
    expect(screen.queryByText(/Check it for typos/)).not.toBeInTheDocument()
  })

  it('says sign-ups are unavailable in the banner without a retry toast action', async () => {
    const user = userEvent.setup()
    submit.mockRejectedValueOnce(Object.assign(new Error('off'), { kind: 'signup-disabled' }))
    renderPage()
    await fillDetails(user)
    await fillSecurity(user)
    await user.click(createAccount())

    expect(await screen.findByText('Sign-ups are unavailable right now.', { selector: 'strong' })).toBeInTheDocument()
  })

  it('names a rate limit in the banner', async () => {
    const user = userEvent.setup()
    submit.mockRejectedValueOnce(Object.assign(new Error('limit'), { kind: 'rate-limit' }))
    renderPage()
    await fillDetails(user)
    await fillSecurity(user)
    await user.click(createAccount())

    expect(await screen.findByText('Too many sign-up attempts.', { selector: 'strong' })).toBeInTheDocument()
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

  it('offers the button at the bottom, below the primary action', () => {
    renderPage()
    expect(google()).toBeEnabled()
    expect(
      google().compareDocumentPosition(field(/^first name$/i)) & Node.DOCUMENT_POSITION_PRECEDING,
    ).toBeTruthy()
    expect(
      google().compareDocumentPosition(createAccount()) & Node.DOCUMENT_POSITION_PRECEDING,
    ).toBeTruthy()
  })

  it('opens both documents first, then continues on its own and stays pending while the browser leaves', async () => {
    const user = userEvent.setup()
    renderPage('/signup?next=%2Fcheckout')
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
    expect(googleSubmit).toHaveBeenCalledWith({ next: '/checkout' })
    expect(screen.queryByRole('heading', { name: /^Welcome/ })).not.toBeInTheDocument()
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
    googleSubmit.mockRejectedValueOnce(new GoogleAuthError('network'))
    renderPage()
    await user.click(google())
    await acknowledgeBoth(user)

    expect(await screen.findByText(/couldn't reach Google sign-in/)).toBeInTheDocument()
    expect(google()).toBeEnabled()
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(googleSubmit).toHaveBeenCalledTimes(2)
  })

  it('sends one request on a double click', async () => {
    const user = userEvent.setup()
    googleSubmit.mockRejectedValueOnce(new GoogleAuthError('server'))
    renderPage()
    await user.click(google())
    await acknowledgeBoth(user)
    await screen.findByText(/couldn't start Google sign-in/)
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
    expect(document.title).toBe('Sign up — SilhouFit')
    expect(meta.content.length).toBeGreaterThanOrEqual(150)
    expect(meta.content.length).toBeLessThanOrEqual(160)

    unmount()
    expect(document.title).toBe('Before')
    expect(meta.content).toBe('Previous description')
    meta.remove()
  })
})
