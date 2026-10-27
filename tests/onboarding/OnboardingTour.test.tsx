import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MotionGlobalConfig } from 'motion/react'
import { Link, MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { OnboardingTour } from '../../src/components/onboarding/OnboardingTour'
import { ToastProvider } from '../../src/components/toast/ToastProvider'
import { resetTour, useOnboarding } from '../../src/hooks/useOnboarding'
import { createAddress, loadAddresses, type Address } from '../../src/service/addresses'
import { saveOnboardingStatus } from '../../src/service/onboarding'
import { clearSession, setSession } from '../../src/service/session'
import { ADDRESS } from '../fixtures/addresses'
import { POLO } from '../fixtures/shopProducts'

// motion reads the media query once per process, so the preference is switched here instead.
const motion = vi.hoisted(() => ({ reduced: false }))
vi.mock('motion/react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('motion/react')>()),
  useReducedMotion: () => motion.reduced,
}))
vi.mock('../../src/service/onboarding', () => ({ saveOnboardingStatus: vi.fn() }))
vi.mock('../../src/service/addresses', async (original) => ({
  ...(await original<typeof import('../../src/service/addresses')>()),
  loadAddresses: vi.fn(),
  createAddress: vi.fn(),
  updateAddress: vi.fn(),
  deleteAddress: vi.fn(),
}))
// A saved body profile skips the body step, so these tests end on the completion card. The body step has its own tests.
vi.mock('../../src/service/bodyProfile', async (original) => ({
  ...(await original<typeof import('../../src/service/bodyProfile')>()),
  getBodyProfile: () => Promise.resolve({ heightCm: 170 }),
}))
// The sample piece the tour shows; null stands for a shop with nothing in stock. Loading it has its own test in useTourProduct.test.ts.
const sample = vi.hoisted(() => ({ product: null as import('../../src/data/products').Product | null }))
vi.mock('../../src/hooks/useTourProduct', () => ({ useTourProduct: () => ({ ready: true, product: sample.product }) }))
// The address step's lists never arrive here; its own behaviour is covered in AddressForm.test.tsx.
vi.mock('../../src/service/psgc', () => ({
  getRegions: () => new Promise(() => {}),
  getProvinces: () => new Promise(() => {}),
  getCities: () => new Promise(() => {}),
  getBarangays: () => new Promise(() => {}),
}))
const save = vi.mocked(saveOnboardingStatus)

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true
  const observer = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal('ResizeObserver', observer)
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    addEventListener() {},
    removeEventListener() {},
  }))
  Element.prototype.scrollIntoView = vi.fn()
})

beforeEach(() => {
  motion.reduced = false
  save.mockResolvedValue('ok')
  vi.mocked(loadAddresses).mockResolvedValue([])
  localStorage.clear()
  sample.product = POLO
  act(() => setSession({ name: 'Anne Santos', email: 'anne@example.com' }))
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

function Begin({ welcome }: { welcome: boolean }) {
  const { startTour } = useOnboarding()
  return (
    <button type="button" onClick={() => startTour({ skipWelcome: !welcome })}>
      begin
    </button>
  )
}

// The gate renders the tour only while it is open; the test does the same.
function TourWhenOpen() {
  const { phase } = useOnboarding()
  return phase ? <OnboardingTour /> : null
}

async function open({ welcome = true, url = '/shop' }: { welcome?: boolean; url?: string } = {}) {
  const user = userEvent.setup()
  render(
    <MemoryRouter initialEntries={[url]}>
      <ToastProvider>
        <Where />
        <Link to={`/checkout?item=p01&variant=p01-s-white&qty=1`}>real buy now</Link>
        <Begin welcome={welcome} />
        <Routes>
          <Route path="*" element={<p>page</p>} />
        </Routes>
        <TourWhenOpen />
      </ToastProvider>
    </MemoryRouter>,
  )
  await user.click(screen.getByRole('button', { name: 'begin' }))
  return user
}

// jsdom has no layout, so a target is a stub element that reports a box.
function addTarget(key: string) {
  const el = document.createElement('button')
  el.dataset.tour = key
  el.getBoundingClientRect = () => ({ top: 100, left: 10, width: 100, height: 40, right: 110, bottom: 140, x: 10, y: 100, toJSON() {} })
  document.body.append(el)
  return el
}

const stepLabel = (n: number, m = 5) => screen.getByText(`Step ${n} of ${m}`)

describe('OnboardingTour', () => {
  it('opens on a welcome card, then walks Next and Back through the stops', async () => {
    const user = await open()
    expect(screen.getByRole('dialog', { name: 'Welcome to SilhouFit' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Start the tour' }))
    expect(stepLabel(1)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Explore the shop' })).toHaveFocus()
    expect(screen.getByRole('button', { name: 'Back' })).toBeDisabled()

    await user.click(screen.getByRole('button', { name: 'Next' }))
    await user.click(screen.getByRole('button', { name: 'Next' }))
    await user.click(screen.getByRole('button', { name: 'Next' }))
    expect(stepLabel(2)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Add to cart' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Back' }))
    expect(stepLabel(1)).toBeInTheDocument()
  })

  it('closes for this tab with the X and Escape, saving nothing', async () => {
    const user = await open({ welcome: false })
    await user.click(screen.getByRole('button', { name: 'Close tour' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(save).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'begin' }))
    expect(screen.getByRole('dialog', { name: 'Explore the shop' })).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(save).not.toHaveBeenCalled()
  })

  it('leaves Escape to an open modal dialog', async () => {
    const user = await open({ welcome: false })
    const modal = document.createElement('div')
    modal.setAttribute('aria-modal', 'true')
    document.body.append(modal)
    await user.keyboard('{Escape}')
    expect(screen.getByRole('dialog', { name: 'Explore the shop' })).toBeInTheDocument()
    modal.remove()
  })

  it('saves Skip, with a toast that says where to replay it', async () => {
    const user = await open({ welcome: false })
    await user.click(screen.getByRole('button', { name: 'Skip tour' }))
    expect(save).toHaveBeenCalledWith('anne@example.com', 'skipped')
    expect(await screen.findByText('Tour skipped. Replay it any time from your profile.')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('says what happened, why and what to do when the skip cannot be saved', async () => {
    save.mockResolvedValue('failed')
    const user = await open({ welcome: false })
    await user.click(screen.getByRole('button', { name: 'Skip tour' }))
    expect(await screen.findByText(/couldn't save your tour choice.*did not confirm.*try again next time/i)).toBeInTheDocument()
  })

  it('finishes on the last stop: saves, greets by name and bursts confetti', async () => {
    const user = await open({ welcome: false })
    // 3 + 3 + 1 + 3 + 1 stops: ten Next presses reach the last one.
    for (let i = 0; i < 10; i += 1) await user.click(screen.getByRole('button', { name: 'Next' }))
    await user.click(screen.getByRole('button', { name: 'Finish' }))
    expect(save).toHaveBeenCalledWith('anne@example.com', 'completed')
    // The optional address step comes first; skipping it goes on to the completion card.
    await user.click(await screen.findByRole('button', { name: 'Skip this step' }))
    expect(screen.getByRole('dialog', { name: "You're Ready to Shop!" })).toBeInTheDocument()
    expect(screen.getByText(/Welcome to SilhouFit, Anne\./)).toBeInTheDocument()
    expect(screen.getByTestId('confetti')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Start Shopping' }))
    expect(screen.getByTestId('where')).toHaveTextContent('/shop')
  })

  it('shows no confetti under reduced motion', async () => {
    motion.reduced = true
    const user = await open({ welcome: false })
    for (let i = 0; i < 10; i += 1) await user.click(screen.getByRole('button', { name: 'Next' }))
    await user.click(screen.getByRole('button', { name: 'Finish' }))
    await user.click(await screen.findByRole('button', { name: 'Skip this step' }))
    expect(screen.getByRole('dialog', { name: "You're Ready to Shop!" })).toBeInTheDocument()
    expect(screen.queryByTestId('confetti')).not.toBeInTheDocument()
  })

  describe('address step', () => {
    async function finishTour() {
      const user = await open({ welcome: false })
      for (let i = 0; i < 10; i += 1) await user.click(screen.getByRole('button', { name: 'Next' }))
      await user.click(screen.getByRole('button', { name: 'Finish' }))
      return user
    }

    it('is offered after Finish, before the completion card, and is not one of the counted steps', async () => {
      await finishTour()
      expect(await screen.findByRole('dialog', { name: 'Save your delivery address' })).toBeInTheDocument()
      expect(screen.queryByRole('dialog', { name: "You're Ready to Shop!" })).not.toBeInTheDocument()
      expect(screen.queryByText(/Step \d+ of/)).not.toBeInTheDocument()
    })

    it('saves nothing when skipped with the button, and leaves the tour status as completed', async () => {
      const user = await finishTour()
      await user.click(await screen.findByRole('button', { name: 'Skip this step' }))
      expect(screen.getByRole('dialog', { name: "You're Ready to Shop!" })).toBeInTheDocument()
      expect(createAddress).not.toHaveBeenCalled()
      expect(save).toHaveBeenCalledTimes(1)
      expect(save).toHaveBeenCalledWith('anne@example.com', 'completed')
    })

    it('goes on to the completion card with Escape, saving nothing', async () => {
      const user = await finishTour()
      await screen.findByRole('dialog', { name: 'Save your delivery address' })
      await user.keyboard('{Escape}')
      expect(screen.getByRole('dialog', { name: "You're Ready to Shop!" })).toBeInTheDocument()
      expect(createAddress).not.toHaveBeenCalled()
    })

    it('ignores Escape, the close button and Skip while the address is saving, then goes on with its result', async () => {
      let finish: (a: Address) => void = () => {}
      vi.mocked(createAddress).mockReturnValue(new Promise((resolve) => (finish = resolve)))
      const user = await finishTour()
      const dialog = within(await screen.findByRole('dialog', { name: 'Save your delivery address' }))
      await user.click(dialog.getByRole('button', { name: 'Type it instead' }))
      await user.type(dialog.getByLabelText('Phone number'), '9171234567')
      await user.type(dialog.getByLabelText('Region'), 'NCR')
      await user.type(dialog.getByLabelText('City or municipality'), 'City of Manila')
      await user.type(dialog.getByLabelText('Barangay'), 'Barangay 176')
      await user.type(dialog.getByLabelText('Street address'), '12 Rizal Avenue')
      await user.type(dialog.getByLabelText('Postal code'), '1000')
      await user.click(dialog.getByRole('button', { name: 'Save address' }))

      await waitFor(() => expect(dialog.getByRole('button', { name: 'Skip this step' })).toBeDisabled())
      await user.keyboard('{Escape}')
      await user.click(dialog.getByRole('button', { name: 'Close Save your delivery address' }))
      expect(screen.getByRole('dialog', { name: 'Save your delivery address' })).toBeInTheDocument()
      expect(screen.queryByRole('dialog', { name: "You're Ready to Shop!" })).not.toBeInTheDocument()

      await act(async () => finish(ADDRESS))
      expect(await screen.findByText('Address saved.')).toBeInTheDocument()
      expect(screen.getByRole('dialog', { name: "You're Ready to Shop!" })).toBeInTheDocument()
    })

    it('is left out on a replay when an address is already saved', async () => {
      vi.mocked(loadAddresses).mockResolvedValue([ADDRESS])
      await finishTour()
      expect(await screen.findByRole('dialog', { name: "You're Ready to Shop!" })).toBeInTheDocument()
      expect(screen.queryByRole('dialog', { name: 'Save your delivery address' })).not.toBeInTheDocument()
    })
  })

  it('shows fallback cards without navigating when there is no sample piece', async () => {
    sample.product = null
    const user = await open({ welcome: false, url: '/profile' })
    // The first step still opens the shop; the ones after it have no page to go to.
    for (let i = 0; i < 3; i += 1) await user.click(screen.getByRole('button', { name: 'Next' }))
    expect(screen.getByRole('heading', { name: 'Add to cart' })).toBeInTheDocument()
    expect(screen.getByText('On a piece page you choose a colour and a size, and both are required.')).toBeInTheDocument()
    expect(screen.getByTestId('where')).toHaveTextContent(/^\/shop$/)
  })

  it('states that AR try-on is coming soon and will ask for the camera later', async () => {
    const ar = addTarget('product-ar')
    const user = await open({ welcome: false })
    for (let i = 0; i < 6; i += 1) await user.click(screen.getByRole('button', { name: 'Next' }))
    expect(screen.getByRole('heading', { name: 'Try it on with AR' })).toBeInTheDocument()
    expect(await screen.findByText(/coming soon.*camera access/)).toBeInTheDocument()
    ar.remove()
  })

  it('drops the pickup step when the sample piece cannot be collected', async () => {
    sample.product = { ...POLO, channels: ['online'] }
    await open({ welcome: false })
    expect(stepLabel(1, 4)).toBeInTheDocument()
  })

  it('shows neutral copy, not the target body, while it looks for the target', async () => {
    await open({ welcome: false })
    expect(screen.getByText('Finding it on the page…')).toBeInTheDocument()
    expect(screen.queryByText(/Search the catalogue by name/)).not.toBeInTheDocument()
  })

  it('shows the body once the target is found', async () => {
    const search = addTarget('shop-search')
    await open({ welcome: false })
    expect(await screen.findByText(/Search the catalogue by name/)).toBeInTheDocument()
    expect(screen.queryByText('Finding it on the page…')).not.toBeInTheDocument()
    search.remove()
  })

  it('uses the fallback at once, with no waiting copy, when there is no sample piece', async () => {
    sample.product = null
    const user = await open({ welcome: false, url: '/profile' })
    for (let i = 0; i < 3; i += 1) await user.click(screen.getByRole('button', { name: 'Next' }))
    expect(screen.getByText(/On a piece page you choose a colour/)).toBeInTheDocument()
    expect(screen.queryByText('Finding it on the page…')).not.toBeInTheDocument()
  })

  it('still points at the cart in the top bar when the catalogue has no sample piece', async () => {
    sample.product = null
    const cart = addTarget('cart')
    const user = await open({ welcome: false, url: '/profile' })
    for (let i = 0; i < 5; i += 1) await user.click(screen.getByRole('button', { name: 'Next' }))
    expect(await screen.findByText('Your cart is here, with a count of what you have added.')).toBeInTheDocument()
    cart.remove()
  })

  it("leaves the tour's own sample checkout on Skip, but not a real Buy now", async () => {
    const user = await open({ welcome: false })
    // 3 + 3 + 1 stops come before the checkout step, which opens its own page.
    for (let i = 0; i < 7; i += 1) await user.click(screen.getByRole('button', { name: 'Next' }))
    expect(screen.getByTestId('where')).toHaveTextContent(/^\/checkout\?.*&tour=1$/)
    await user.click(screen.getByRole('button', { name: 'Skip tour' }))
    expect(screen.getByTestId('where')).toHaveTextContent(/^\/shop$/)

    await user.click(screen.getByRole('button', { name: 'begin' }))
    for (let i = 0; i < 7; i += 1) await user.click(screen.getByRole('button', { name: 'Next' }))
    await user.click(screen.getByRole('link', { name: 'real buy now' }))
    expect(screen.getByTestId('where')).toHaveTextContent(/^\/checkout\?item=/)
    await user.click(screen.getByRole('button', { name: 'Skip tour' }))
    expect(screen.getByTestId('where')).toHaveTextContent(/^\/checkout\?item=/)
  })
})
