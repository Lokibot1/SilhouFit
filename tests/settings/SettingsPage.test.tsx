import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MotionGlobalConfig } from 'motion/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../../src/components/toast/ToastProvider'
import { ThemeProvider } from '../../src/contexts/ThemeContext'
import { hasPasswordLogin } from '../../src/service/changePassword'
import { clearSession, setSession } from '../../src/service/session'
import { SettingsPage } from '../../src/views/private/SettingsPage'

vi.mock('../../src/service/changePassword', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/service/changePassword')>()),
  hasPasswordLogin: vi.fn(),
}))

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} }))
})
beforeEach(() => {
  localStorage.clear()
  document.documentElement.classList.remove('dark')
  act(() => setSession({ name: 'Anne Santos', email: 'anne@example.com' }))
  vi.mocked(hasPasswordLogin).mockResolvedValue(true)
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
    <MemoryRouter initialEntries={['/settings']}>
      <ThemeProvider>
        <ToastProvider>
          <Where />
          <Routes>
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<p>somewhere else</p>} />
          </Routes>
        </ToastProvider>
      </ThemeProvider>
    </MemoryRouter>,
  )
}

describe('SettingsPage', () => {
  it('saves each notification switch on this device and says so', async () => {
    renderPage()
    const popups = await screen.findByRole('switch', { name: 'Pop-up alerts' })
    const sound = screen.getByRole('switch', { name: 'Notification sound' })
    expect(popups).toBeChecked()
    expect(sound).toBeChecked()

    await userEvent.click(popups)
    expect(await screen.findByText('Pop-up alerts turned off')).toBeInTheDocument()
    expect(localStorage.getItem('silhoufit-notify-popup')).toBe('off')
    expect(localStorage.getItem('silhoufit-notify-sound')).toBeNull()

    await userEvent.click(sound)
    expect(localStorage.getItem('silhoufit-notify-sound')).toBe('off')
    await userEvent.click(sound)
    expect(localStorage.getItem('silhoufit-notify-sound')).toBe('on')
  })

  it('sets the dark class from the theme tabs', async () => {
    renderPage()
    expect(await screen.findByRole('tab', { name: 'System', selected: true })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('tab', { name: 'Dark' }))
    expect(document.documentElement).toHaveClass('dark')
    expect(localStorage.getItem('silhoufit-theme')).toBe('dark')
    await userEvent.click(screen.getByRole('tab', { name: 'Light' }))
    expect(document.documentElement).not.toHaveClass('dark')
  })

  it('opens the password sheet for an account with a password', async () => {
    renderPage()
    expect(screen.getByRole('status', { name: 'Checking how you sign in' })).toBeInTheDocument()
    await userEvent.click(await screen.findByRole('button', { name: 'Change password' }))
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
  })

  it('tells a Google-only account there is no password to change', async () => {
    vi.mocked(hasPasswordLogin).mockResolvedValue(false)
    renderPage()
    expect(await screen.findByText(/You sign in with Google/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Change password' })).not.toBeInTheDocument()
  })

  it('sends a staff role to its own settings page', () => {
    act(() => setSession({ name: 'Ada', email: 'ada@example.com', role: 'admin' }))
    renderPage()
    expect(screen.getByTestId('where')).toHaveTextContent('/admin/settings')
  })

  it('sends a signed-out visitor to sign in and back', () => {
    act(() => clearSession())
    renderPage()
    expect(screen.getByTestId('where')).toHaveTextContent('/login?next=%2Fsettings')
  })
})
