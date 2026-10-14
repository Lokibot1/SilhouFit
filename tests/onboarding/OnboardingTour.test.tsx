import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MotionGlobalConfig } from 'motion/react'
import { Link, MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { OnboardingTour } from '../../src/components/onboarding/OnboardingTour'
import { ToastProvider } from '../../src/components/toast/ToastProvider'
import { PRODUCTS } from '../../src/data/products'
import { primeProductsCache, resetProductsCache } from '../../src/hooks/useProducts'
import { resetTour, useOnboarding } from '../../src/hooks/useOnboarding'
import { saveOnboardingStatus } from '../../src/service/onboarding'
import { clearSession, setSession } from '../../src/service/session'

// motion reads the media query once per process, so the preference is switched here instead.
const motion = vi.hoisted(() => ({ reduced: false }))
vi.mock('motion/react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('motion/react')>()),
  useReducedMotion: () => motion.reduced,
}))
vi.mock('../../src/service/onboarding', () => ({ saveOnboardingStatus: vi.fn() }))
vi.mock('../../src/service/fetchProducts', () => ({ fetchProducts: () => new Promise(() => {}) }))
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
  localStorage.clear()
  resetProductsCache()
  primeProductsCache({ products: PRODUCTS, syncedAt: '2026-10-10T15:05:00' })
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
        <Link to={`/checkout?item=${PRODUCTS[0].id}&size=S&color=x&qty=1`}>real buy now</Link>
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
    expect(screen.getByRole('dialog', { name: "You're Ready to Shop!" })).toBeInTheDocument()
    expect(screen.queryByTestId('confetti')).not.toBeInTheDocument()
  })

  it('shows fallback cards without navigating when there is no sample piece', async () => {
    primeProductsCache({ products: PRODUCTS.map((p) => ({ ...p, stock: 0 })), syncedAt: '2026-10-10T15:05:00' })
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
    primeProductsCache({
      products: PRODUCTS.map((p) => ({ ...p, channels: ['online' as const] })),
      syncedAt: '2026-10-10T15:05:00',
    })
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
    primeProductsCache({ products: PRODUCTS.map((p) => ({ ...p, stock: 0 })), syncedAt: '2026-10-10T15:05:00' })
    const user = await open({ welcome: false, url: '/profile' })
    for (let i = 0; i < 3; i += 1) await user.click(screen.getByRole('button', { name: 'Next' }))
    expect(screen.getByText(/On a piece page you choose a colour/)).toBeInTheDocument()
    expect(screen.queryByText('Finding it on the page…')).not.toBeInTheDocument()
  })

  it('still points at the cart in the top bar when the catalogue has no sample piece', async () => {
    primeProductsCache({ products: PRODUCTS.map((p) => ({ ...p, stock: 0 })), syncedAt: '2026-10-10T15:05:00' })
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
