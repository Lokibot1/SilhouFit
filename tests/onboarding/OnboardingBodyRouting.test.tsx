import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MotionGlobalConfig } from 'motion/react'
import { Link, MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { OnboardingTour } from '../../src/components/onboarding/OnboardingTour'
import { ToastProvider } from '../../src/components/toast/ToastProvider'
import { resetTour, useOnboarding } from '../../src/hooks/useOnboarding'
import { loadAddresses } from '../../src/service/addresses'
import { BodyProfileError, getBodyProfile, type BodyProfile } from '../../src/service/bodyProfile'
import { saveOnboardingStatus } from '../../src/service/onboarding'
import { clearSession, setSession } from '../../src/service/session'
import { ADDRESS } from '../fixtures/addresses'

// Where the tour sends the user after Finish depends on two stored facts: a delivery address and a body profile.
// These tests drive the real tour through its public surface and read the outcome from the router and the dialogs.

vi.mock('../../src/service/onboarding', () => ({ saveOnboardingStatus: vi.fn() }))
vi.mock('../../src/service/addresses', async (original) => ({
  ...(await original<typeof import('../../src/service/addresses')>()),
  loadAddresses: vi.fn(),
  createAddress: vi.fn(),
  updateAddress: vi.fn(),
  deleteAddress: vi.fn(),
}))
vi.mock('../../src/service/bodyProfile', async (original) => ({
  ...(await original<typeof import('../../src/service/bodyProfile')>()),
  getBodyProfile: vi.fn(),
}))
vi.mock('../../src/hooks/useTourProduct', async () => {
  const { POLO } = await import('../fixtures/shopProducts')
  return { useTourProduct: () => ({ ready: true, product: POLO }) }
})
vi.mock('../../src/service/psgc', () => ({
  getRegions: () => new Promise(() => {}),
  getProvinces: () => new Promise(() => {}),
  getCities: () => new Promise(() => {}),
  getBarangays: () => new Promise(() => {}),
}))

const EMAIL = 'anne@example.com'
const PROFILE = { heightCm: 170 } as BodyProfile
const getProfile = vi.mocked(getBodyProfile)
const BODY = '/profile/measurements'

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} }))
  Element.prototype.scrollIntoView = vi.fn()
})
beforeEach(() => {
  vi.mocked(saveOnboardingStatus).mockResolvedValue('ok')
  getProfile.mockResolvedValue(null)
  vi.mocked(loadAddresses).mockResolvedValue([])
  localStorage.clear()
  sessionStorage.clear()
  act(() => setSession({ name: 'Anne Santos', email: EMAIL }))
})
afterEach(() => {
  act(() => {
    resetTour()
    clearSession()
  })
  vi.clearAllMocks()
})

function Where() {
  const { pathname, search } = useLocation()
  return <p data-testid="where">{pathname + search}</p>
}
function Back() {
  const navigate = useNavigate()
  return (
    <button type="button" onClick={() => navigate(-1)}>
      browser back
    </button>
  )
}
/** What the setup page does on Skip and Finish: the phase moves on, then the route changes. */
function Leave() {
  const navigate = useNavigate()
  const { finishTour } = useOnboarding()
  return (
    <button
      type="button"
      onClick={() => {
        finishTour()
        navigate('/profile')
      }}
    >
      skip setup
    </button>
  )
}
function Begin() {
  const { startTour } = useOnboarding()
  return (
    <button type="button" onClick={() => startTour({ skipWelcome: true })}>
      begin
    </button>
  )
}
// The gate renders the tour only while a phase is open.
function TourWhenOpen() {
  const { phase } = useOnboarding()
  return phase ? <OnboardingTour /> : null
}
function Phase() {
  return <p data-testid="phase">{useOnboarding().phase ?? 'none'}</p>
}

const where = () => screen.getByTestId('where').textContent
const phase = () => screen.getByTestId('phase').textContent

/** Opens the tour on its first stop and presses Next to the last, then Finish. */
async function finishTour() {
  const user = userEvent.setup({ delay: null })
  render(
    <MemoryRouter initialEntries={['/shop']}>
      <ToastProvider>
        <Where />
        <Phase />
        <Begin />
        <Back />
        <Leave />
        <Link to="/cart">leave</Link>
        <Routes>
          <Route path="*" element={<p>page</p>} />
        </Routes>
        <TourWhenOpen />
      </ToastProvider>
    </MemoryRouter>,
  )
  await user.click(screen.getByRole('button', { name: 'begin' }))
  // 3 + 3 + 1 + 3 + 1 stops: ten Next presses reach the last one.
  for (let i = 0; i < 9; i += 1) await user.click(screen.getByRole('button', { name: 'Next' }))
  await user.click(screen.getByRole('button', { name: 'Finish' }))
  return user
}

const doneDialog = () => screen.queryByRole('dialog', { name: "You're Ready to Shop!" })
const addressDialog = () => screen.queryByRole('dialog', { name: 'Save your delivery address' })

describe('tour routing after Finish', () => {
  describe('with a saved address', () => {
    beforeEach(async () => {
      vi.mocked(loadAddresses).mockResolvedValue([ADDRESS])
    })

    it('goes straight to the completion card when a body profile is saved', async () => {
      getProfile.mockResolvedValue(PROFILE)
      await finishTour()
      expect(await screen.findByRole('dialog', { name: "You're Ready to Shop!" })).toBeInTheDocument()
      expect(addressDialog()).not.toBeInTheDocument()
      expect(where()).not.toBe(BODY)
    })

    it('opens the measurements page when no body profile is saved', async () => {
      getProfile.mockResolvedValue(null)
      await finishTour()
      await waitFor(() => expect(where()).toBe(BODY))
      expect(phase()).toBe('body')
      expect(doneDialog()).not.toBeInTheDocument()
      expect(addressDialog()).not.toBeInTheDocument()
    })

    it.each(['network', 'server', 'rate-limit', 'unauthorized'] as const)(
      'offers the measurements page when the profile cannot be read (%s)',
      async (kind) => {
        getProfile.mockRejectedValue(new BodyProfileError(kind))
        await finishTour()
        await waitFor(() => expect(where()).toBe(BODY))
        expect(phase()).toBe('body')
      },
    )

    it('offers the measurements page when the profile request throws something unexpected', async () => {
      getProfile.mockRejectedValue(new Error('boom'))
      await finishTour()
      await waitFor(() => expect(where()).toBe(BODY))
    })
  })

  describe('without a saved address', () => {
    it('asks for the address first, and does not ask for measurements yet', async () => {
      await finishTour()
      expect(await screen.findByRole('dialog', { name: 'Save your delivery address' })).toBeInTheDocument()
      expect(phase()).toBe('address')
      expect(getProfile).not.toHaveBeenCalled()
      expect(where()).not.toBe(BODY)
    })

    it('after Skip this step: completion card when a profile is saved', async () => {
      getProfile.mockResolvedValue(PROFILE)
      const user = await finishTour()
      await user.click(await screen.findByRole('button', { name: 'Skip this step' }))
      expect(await screen.findByRole('dialog', { name: "You're Ready to Shop!" })).toBeInTheDocument()
      expect(where()).not.toBe(BODY)
    })

    it('after Skip this step: the measurements page when no profile is saved', async () => {
      const user = await finishTour()
      await user.click(await screen.findByRole('button', { name: 'Skip this step' }))
      await waitFor(() => expect(where()).toBe(BODY))
      expect(phase()).toBe('body')
      expect(doneDialog()).not.toBeInTheDocument()
    })

    it('after Escape on the address step: the measurements page when no profile is saved', async () => {
      const user = await finishTour()
      await screen.findByRole('dialog', { name: 'Save your delivery address' })
      await user.keyboard('{Escape}')
      await waitFor(() => expect(where()).toBe(BODY))
    })

    it('after Skip this step: the measurements page when the profile cannot be read', async () => {
      getProfile.mockRejectedValue(new BodyProfileError('network'))
      const user = await finishTour()
      await user.click(await screen.findByRole('button', { name: 'Skip this step' }))
      await waitFor(() => expect(where()).toBe(BODY))
    })
  })

  describe('the body phase', () => {
    it('navigates to the measurements page once, so leaving it is not undone', async () => {
      vi.mocked(loadAddresses).mockResolvedValue([ADDRESS])
      const user = await finishTour()
      await waitFor(() => expect(where()).toBe(BODY))
      // The user leaves (Back, a link). The tour must not drag them back.
      await user.click(screen.getByRole('link', { name: 'leave' }))
      expect(where()).toBe('/cart')
      await new Promise((resolve) => setTimeout(resolve, 50))
      expect(where()).toBe('/cart')
      expect(getProfile).toHaveBeenCalledTimes(1)
    })

    it('ends the tour when the page is left with the browser Back button, so it is not parked in the body phase', async () => {
      vi.mocked(loadAddresses).mockResolvedValue([ADDRESS])
      const user = await finishTour()
      await waitFor(() => expect(where()).toBe(BODY))
      await user.click(screen.getByRole('button', { name: 'browser back' }))
      expect(where()).toBe('/shop')
      await waitFor(() => expect(phase()).toBe('none'))
      expect(doneDialog()).not.toBeInTheDocument()
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('lets a new tour start after the page was left that way', async () => {
      vi.mocked(loadAddresses).mockResolvedValue([ADDRESS])
      const user = await finishTour()
      await waitFor(() => expect(where()).toBe(BODY))
      await user.click(screen.getByRole('button', { name: 'browser back' }))
      await waitFor(() => expect(phase()).toBe('none'))
      await user.click(screen.getByRole('button', { name: 'begin' }))
      expect(phase()).toBe('step')
      expect(await screen.findByRole('dialog', { name: 'Explore the shop' })).toBeInTheDocument()
    })

    it('does not end the tour for the way out it provides itself: Skip and Finish go on to the completion card', async () => {
      vi.mocked(loadAddresses).mockResolvedValue([ADDRESS])
      const user = await finishTour()
      await waitFor(() => expect(where()).toBe(BODY))
      await user.click(screen.getByRole('button', { name: 'skip setup' }))
      expect(where()).toBe('/profile')
      expect(phase()).toBe('done')
      expect(await screen.findByRole('dialog', { name: "You're Ready to Shop!" })).toBeInTheDocument()
    })

    it('renders nothing of its own while the page runs', async () => {
      vi.mocked(loadAddresses).mockResolvedValue([ADDRESS])
      await finishTour()
      await waitFor(() => expect(where()).toBe(BODY))
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
  })

  describe('the completion card', () => {
    async function toCompletionCard() {
      vi.mocked(loadAddresses).mockResolvedValue([ADDRESS])
      getProfile.mockResolvedValue(PROFILE)
      const user = await finishTour()
      await screen.findByRole('dialog', { name: "You're Ready to Shop!" })
      return user
    }

    it('Start Shopping goes to /shop', async () => {
      const user = await toCompletionCard()
      expect(where()).not.toBe('/shop')
      await user.click(screen.getByRole('button', { name: 'Start Shopping' }))
      expect(where()).toBe('/shop')
      expect(phase()).toBe('none')
    })

    it('the X closes it without navigating', async () => {
      const user = await toCompletionCard()
      const before = where()
      expect(before).not.toBe('/shop')
      await user.click(screen.getByRole('button', { name: "Close You're Ready to Shop!" }))
      expect(phase()).toBe('none')
      expect(where()).toBe(before)
    })

    it('Escape closes it without navigating', async () => {
      const user = await toCompletionCard()
      const before = where()
      await user.keyboard('{Escape}')
      expect(phase()).toBe('none')
      expect(where()).toBe(before)
    })

    it('a click on the backdrop closes it without navigating', async () => {
      await toCompletionCard()
      const before = where()
      const backdrop = document.querySelector('.bg-carbon-950\\/60')!
      fireEvent.pointerDown(backdrop)
      expect(phase()).toBe('none')
      expect(where()).toBe(before)
    })
  })

  it('does not ask for the profile again after the tour is closed', async () => {
    vi.mocked(loadAddresses).mockResolvedValue([ADDRESS])
    getProfile.mockResolvedValue(PROFILE)
    await finishTour()
    await screen.findByRole('dialog', { name: "You're Ready to Shop!" })
    expect(getProfile).toHaveBeenCalledTimes(1)
  })

  it('opens the measurements page again for a second tour in the same tab, after the first was reset in the body phase', async () => {
    vi.mocked(loadAddresses).mockResolvedValue([ADDRESS])
    const user = await finishTour()
    await waitFor(() => expect(where()).toBe(BODY))
    await user.click(screen.getByRole('link', { name: 'leave' }))
    expect(where()).toBe('/cart')
    // Sign-out during the body step resets the tour; the next sign-in is offered it again.
    act(() => resetTour())
    expect(phase()).toBe('none')
    await user.click(screen.getByRole('button', { name: 'begin' }))
    for (let i = 0; i < 9; i += 1) await user.click(screen.getByRole('button', { name: 'Next' }))
    await user.click(screen.getByRole('button', { name: 'Finish' }))
    await waitFor(() => expect(where()).toBe(BODY))
    expect(phase()).toBe('body')
  })
})
