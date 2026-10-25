import { act, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CookieConsentBanner } from '../../src/components/CookieConsentBanner'
import { OnboardingGate } from '../../src/components/onboarding/OnboardingGate'
import { fetchMe, MeError, type Me } from '../../src/service/fetchMe'
import { getOnboardingStatus } from '../../src/service/onboarding'
import { clearSession, setSession } from '../../src/service/session'
import { resetTour } from '../../src/hooks/useOnboarding'

vi.mock('../../src/service/fetchMe', async (original) => ({
  ...(await original<typeof import('../../src/service/fetchMe')>()),
  fetchMe: vi.fn(),
}))
vi.mock('../../src/service/onboarding', async (original) => ({
  ...(await original<typeof import('../../src/service/onboarding')>()),
  getOnboardingStatus: vi.fn(),
}))
// Cookie consent is unanswered (null) for a first-time visitor; the tour must not wait for it.
vi.mock('../../src/contexts/CookieConsentContext', () => ({
  useCookieConsent: () => ({ status: null, accept: vi.fn(), reject: vi.fn() }),
}))
vi.mock('../../src/components/onboarding/OnboardingTour', () => ({
  OnboardingTour: () => <div role="dialog" aria-label="Tour is open" />,
}))

const me = (role?: Me['role']) => ({ id: 'u', email: 'a@x.com', firstName: 'A', lastName: 'B', role }) as Me

// A fresh address per test: the gate remembers a role per email for the life of the page.
let n = 0
function renderGate(email: string) {
  act(() => setSession({ name: 'A B', email }))
  return render(
    <MemoryRouter initialEntries={['/shop']}>
      <OnboardingGate />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  n += 1
  vi.mocked(getOnboardingStatus).mockResolvedValue('none')
})
afterEach(() => {
  vi.clearAllMocks()
  act(() => {
    resetTour()
    clearSession()
  })
})

describe('OnboardingGate roles', () => {
  it('opens the tour for a customer who has not seen it', async () => {
    vi.mocked(fetchMe).mockResolvedValue(me('customer'))
    renderGate(`c${n}@x.com`)
    expect(await screen.findByRole('dialog', { name: 'Tour is open' })).toBeInTheDocument()
  })

  it('opens the tour while the cookie banner is unanswered and hides the banner meanwhile', async () => {
    vi.mocked(fetchMe).mockResolvedValue(me('customer'))
    act(() => setSession({ name: 'A B', email: `banner${n}@x.com` }))
    render(
      <MemoryRouter initialEntries={['/shop']}>
        <CookieConsentBanner />
        <OnboardingGate />
      </MemoryRouter>,
    )
    expect(screen.getByRole('region', { name: 'Cookie notice' })).toBeInTheDocument()
    expect(await screen.findByRole('dialog', { name: 'Tour is open' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Cookie notice' })).not.toBeInTheDocument()
  })

  it.each(['staff', 'admin', 'superadmin'] as const)('never opens the tour for %s', async (role) => {
    vi.mocked(fetchMe).mockResolvedValue(me(role))
    renderGate(`${role}${n}@x.com`)
    await waitFor(() => expect(fetchMe).toHaveBeenCalled())
    await act(async () => {})
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('stays closed when the role cannot be read', async () => {
    vi.mocked(fetchMe).mockRejectedValue(new MeError('network'))
    renderGate(`err${n}@x.com`)
    await waitFor(() => expect(fetchMe).toHaveBeenCalled())
    await act(async () => {})
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('does not look the role up for someone who already finished the tour', async () => {
    vi.mocked(getOnboardingStatus).mockResolvedValue('completed')
    renderGate(`done${n}@x.com`)
    await act(async () => {})
    expect(fetchMe).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
