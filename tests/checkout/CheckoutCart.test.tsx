import { act, configure, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MotionGlobalConfig } from 'motion/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../../src/components/toast/ToastProvider'
import { clearCartCache } from '../../src/hooks/useCart'
import { clearProductCache } from '../../src/hooks/useProducts'
import { placeOrder } from '../../src/service/placeOrder'
import { clearSession, setSession } from '../../src/service/session'
import { loadLastOrder } from '../../src/utils/checkout'
import { CheckoutPage } from '../../src/views/private/CheckoutPage'
import { createCartStore, type CartStore, type StoreProduct } from '../fixtures/cartStore'
import { BLAZER, POLO, shopProduct, SOLD_OUT, variant } from '../fixtures/shopProducts'
import { storeProducts, wireCartApi, wireShopProducts } from '../fixtures/wireCartApi'

vi.mock('../../src/service/cartApi')
vi.mock('../../src/service/fetchShopProducts')
vi.mock('../../src/service/placeOrder', () => ({ placeOrder: vi.fn() }))
const placeMock = vi.mocked(placeOrder)

vi.setConfig({ testTimeout: 30000 })

const SHIRT = shopProduct('p17', 'Rail White Shirt', [variant('p17-l-white', 'L', 'White', { price: 1790 })])
const PULLOVER = shopProduct('p05', 'Cable Knit Pullover', [variant('p05-m-sand', 'M', 'Sand', { price: 1500 })])
const TROUSERS = shopProduct('p04', 'Wool Trousers', [variant('p04-30-indigo', '30', 'Indigo', { price: 2600 })], { boutique: 'Lumban Loom' })
const PIECES = [POLO, BLAZER, SOLD_OUT, SHIRT, PULLOVER, TROUSERS]

const NAVY = 'p01-m-navy' // 2,100
const SHIRT_L = 'p17-l-white' // 1,790

let rows: StoreProduct[]
let server: CartStore
const stored = () => server.items.map((i) => i.variantId).sort()

beforeAll(() => {
  configure({ asyncUtilTimeout: 5000 })
  MotionGlobalConfig.skipAnimations = true
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} }))
})

beforeEach(() => {
  vi.resetAllMocks()
  sessionStorage.clear()
  localStorage.clear()
  clearProductCache()
  act(() => setSession({ name: 'Demo Shopper', email: 'demo@silhoufit.com' }))
  rows = storeProducts(PIECES)
  server = createCartStore(() => rows)
  wireCartApi(server)
  wireShopProducts(PIECES)
  clearCartCache()
  placeMock.mockResolvedValue({ orderId: 'SF-261011-ABCD' })
})
afterEach(() => vi.clearAllMocks())

function Where() {
  const { pathname, search } = useLocation()
  return <span data-testid="where">{pathname + search}</span>
}

function renderCheckout(url = '/checkout?source=cart') {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <ToastProvider>
        <Where />
        <Routes>
          <Route path="/checkout" element={<CheckoutPage />} />
          <Route path="*" element={<p>another page</p>} />
        </Routes>
      </ToastProvider>
    </MemoryRouter>,
  )
}

const where = () => screen.getByTestId('where').textContent
const placeButton = () => screen.getByRole('button', { name: /Place order|Placing order/ })
const user = () => userEvent.setup({ delay: null })

// Same boutique (Ayala Atelier).
const seedTwoAyala = () => {
  server.seed(NAVY, 2)
  server.seed(SHIRT_L, 1)
}

async function fillAddress(u: ReturnType<typeof user>) {
  await u.click(screen.getByRole('button', { name: 'Add address' }))
  await u.type(screen.getByLabelText('Phone number'), '9171234567')
  await u.type(screen.getByLabelText('Street address'), '12 Mabini Street, Brgy. San Roque')
  await u.type(screen.getByLabelText('City'), 'Marikina City')
  await u.type(screen.getByLabelText('Postal code'), '1800')
  await u.click(screen.getByRole('button', { name: 'Save address' }))
}

describe('CheckoutPage from the cart', () => {
  it('lists every cart line with its quantity and prices, an Edit cart link and the item count', async () => {
    seedTwoAyala()
    renderCheckout()
    await screen.findByRole('heading', { name: 'Heritage Polo' })
    expect(screen.getByRole('heading', { name: 'Rail White Shirt' })).toBeInTheDocument()
    expect(screen.getByText('₱2,100.00 × 2')).toBeInTheDocument()
    expect(screen.getByText('₱1,790.00 × 1')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Change options/ })).toBeNull()
    expect(screen.getByRole('link', { name: 'Edit cart' })).toHaveAttribute('href', '/cart')
    const summary = screen.getByRole('complementary')
    expect(summary).toHaveTextContent('Subtotal (3 items)')
    expect(summary).toHaveTextContent('₱5,990.00') // 4,200 + 1,790
    expect(summary).toHaveTextContent('₱6,089.00') // plus one flat 99 shipping
  })

  it('shows what was left out or lowered in one status panel, and leaves the cart alone', async () => {
    server.seed(SHIRT_L, 1)
    server.seed('p02-m-black', 4)
    server.seed('p04-30-indigo', 1)
    rows.find((p) => p.id === 'p04')!.isActive = false // archived since it was added
    rows.find((p) => p.id === 'p02')!.variants[0].stock = 2 // sold down since it was added
    renderCheckout()
    await screen.findByRole('heading', { name: 'Rail White Shirt' })
    const panel = screen.getByRole('heading', { name: 'We changed your order' }).closest('[role="status"]')!
    expect(panel).toHaveTextContent('Fence-Line Blazer: Quantity lowered to 2.')
    expect(panel).toHaveTextContent('Wool Trousers is no longer available, so it was left out.')
    expect(panel).toHaveTextContent('Your cart is unchanged until the order is placed.')
    expect(server.items).toHaveLength(3)
    expect(server.items.find((i) => i.variantId === 'p02-m-black')!.quantity).toBe(4)
  })

  it('says "Nothing to check out" with the reasons when no line can be bought', async () => {
    server.seed('p24-m-indigo', 1)
    renderCheckout()
    expect(await screen.findByRole('heading', { name: 'Nothing to check out' })).toBeInTheDocument()
    expect(screen.getByText(/Field Denim Jacket is sold out/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to shop' })).toHaveAttribute('href', '/shop')
  })

  it('says it for an empty cart too', async () => {
    renderCheckout()
    expect(await screen.findByRole('heading', { name: 'Nothing to check out' })).toBeInTheDocument()
    expect(screen.getByText(/Your cart has nothing that can be bought/)).toBeInTheDocument()
  })

  it('sends a guest to login and back to the cart checkout', async () => {
    act(() => clearSession())
    renderCheckout()
    await waitFor(() => expect(where()).toMatch(/^\/login\?next=/))
    expect(new URLSearchParams(where()!.split('?')[1]).get('next')).toBe('/checkout?source=cart')
  })

  it('lets pieces from different boutiques go in one delivery order', async () => {
    server.seed(NAVY, 1) // Ayala Atelier
    server.seed('p04-30-indigo', 1) // Lumban Loom
    renderCheckout()
    await screen.findByRole('heading', { name: 'Heritage Polo' })
    expect(screen.queryByRole('alert')).toBeNull()
    expect(placeButton()).toBeEnabled()
  })

  it('sends one order for all lines with one shipping fee', async () => {
    const u = user()
    seedTwoAyala()
    renderCheckout()
    await screen.findByRole('heading', { name: 'Heritage Polo' })
    await fillAddress(u)
    await u.click(placeButton())
    await waitFor(() => expect(where()).toBe('/checkout/success'))
    expect(placeMock).toHaveBeenCalledTimes(1)
    expect(placeMock.mock.calls[0][0]).toMatchObject({
      total: 6089,
      items: [
        { id: 'p01', size: 'M', color: 'Navy', qty: 2 },
        { id: 'p17', size: 'L', color: 'White', qty: 1 },
      ],
    })
    expect(loadLastOrder()!.items).toHaveLength(2)
  })

  it('empties exactly the ordered lines from the server cart after success, keeping lines that were left out', async () => {
    const u = user()
    seedTwoAyala()
    server.seed('p24-m-indigo', 1) // sold out, so left out
    renderCheckout()
    await screen.findByRole('heading', { name: 'Heritage Polo' })
    await fillAddress(u)
    await u.click(placeButton())
    await waitFor(() => expect(where()).toBe('/checkout/success'))
    expect(stored()).toEqual(['p24-m-indigo'])
  })

  it('orders only the lines named in the line params, including one piece in two variants, and keeps the rest', async () => {
    const u = user()
    server.seed('p01-m-white', 1)
    server.seed(NAVY, 2)
    server.seed(SHIRT_L, 1) // not ticked
    const query = new URLSearchParams({ source: 'cart' })
    query.append('line', 'p01-m-white')
    query.append('line', NAVY)
    renderCheckout(`/checkout?${query}`)
    expect(await screen.findAllByRole('heading', { name: 'Heritage Polo' })).toHaveLength(2)
    expect(screen.queryByRole('heading', { name: 'Rail White Shirt' })).toBeNull()
    await fillAddress(u)
    await u.click(placeButton())
    await waitFor(() => expect(where()).toBe('/checkout/success'))
    expect(placeMock.mock.calls[0][0].items).toMatchObject([
      { id: 'p01', size: 'M', color: 'White', qty: 1 },
      { id: 'p01', size: 'M', color: 'Navy', qty: 2 },
    ])
    expect(stored()).toEqual([SHIRT_L])
  })

  it('does not clear the cart when the order fails', async () => {
    const u = user()
    seedTwoAyala()
    placeMock.mockRejectedValueOnce(new Error('network'))
    renderCheckout()
    await screen.findByRole('heading', { name: 'Heritage Polo' })
    await fillAddress(u)
    await u.click(placeButton())
    const alert = await screen.findByRole('alert')
    expect(within(alert).getByRole('button', { name: 'Try again' })).toBeInTheDocument()
    expect(server.items).toHaveLength(2)
    expect(where()).toMatch(/^\/checkout\?/)
  })

  it('takes the ordered pieces off the wishlist after success, and keeps them when the order fails', async () => {
    const u = user()
    const saved = () => JSON.parse(localStorage.getItem('silhoufit-wishlist') ?? '[]') as string[]
    localStorage.setItem('silhoufit-wishlist', JSON.stringify(['p01', 'p03', 'p17']))
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: 'silhoufit-wishlist' }))
    })
    placeMock.mockRejectedValueOnce(new Error('network'))
    renderCheckout(`/checkout?item=p01&variant=${NAVY}&qty=1&item=p17&variant=${SHIRT_L}&qty=1`)
    await screen.findByRole('heading', { name: 'Heritage Polo' })
    await fillAddress(u)
    await u.click(placeButton())
    await screen.findByRole('alert')
    expect(saved()).toEqual(['p01', 'p03', 'p17'])

    await u.click(placeButton())
    await waitFor(() => expect(where()).toBe('/checkout/success'))
    expect(saved()).toEqual(['p03'])
  })

  it('never touches the cart for a Buy now order', async () => {
    const u = user()
    server.seed(NAVY, 2)
    renderCheckout(`/checkout?item=p01&variant=${NAVY}&qty=1`)
    await screen.findByRole('heading', { name: 'Heritage Polo' })
    expect(screen.getByRole('link', { name: 'Change options for Heritage Polo' })).toHaveAttribute('href', '/shop?item=p01&action=buy')
    expect(screen.queryByRole('link', { name: 'Edit cart' })).toBeNull()
    await fillAddress(u)
    await u.click(placeButton())
    await waitFor(() => expect(where()).toBe('/checkout/success'))
    expect(server.items).toHaveLength(1)
    expect(server.items[0].quantity).toBe(2)
  })

  it('keeps its items on screen once the cart is emptied by the order, with no flash of "Nothing to check out"', async () => {
    const u = user()
    let finish!: (value: { orderId: string }) => void
    placeMock.mockReturnValue(new Promise((resolve) => (finish = resolve)))
    seedTwoAyala()
    renderCheckout()
    await screen.findByRole('heading', { name: 'Heritage Polo' })
    await fillAddress(u)
    await u.click(placeButton())
    finish({ orderId: 'SF-261011-ABCD' })
    await waitFor(() => expect(where()).toBe('/checkout/success'))
    expect(screen.queryByRole('heading', { name: 'Nothing to check out' })).toBeNull()
  })
})
