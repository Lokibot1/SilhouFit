import { act, configure, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MotionGlobalConfig } from 'motion/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../../src/components/toast/ToastProvider'
import { PRODUCTS } from '../../src/data/products'
import { resetProductsCache } from '../../src/hooks/useProducts'
import { fetchProducts } from '../../src/service/fetchProducts'
import { placeOrder } from '../../src/service/placeOrder'
import { clearSession, setSession } from '../../src/service/session'
import { loadLastOrder } from '../../src/utils/checkout'
import { CheckoutPage } from '../../src/views/CheckoutPage'

vi.mock('../../src/service/fetchProducts', () => ({ fetchProducts: vi.fn() }))
vi.mock('../../src/service/placeOrder', () => ({ placeOrder: vi.fn() }))
const fetchMock = vi.mocked(fetchProducts)
const placeMock = vi.mocked(placeOrder)

vi.setConfig({ testTimeout: 30000 })

const CART_KEY = 'silhoufit-cart'
type SeedLine = { id: string; size?: string | null; color?: string | null; qty: number }

function seedCart(lines: SeedLine[]) {
  localStorage.setItem(CART_KEY, JSON.stringify(lines))
  act(() => {
    window.dispatchEvent(new StorageEvent('storage', { key: CART_KEY }))
  })
}
const storedCart = () => JSON.parse(localStorage.getItem(CART_KEY) ?? '[]') as SeedLine[]

beforeAll(() => {
  configure({ asyncUtilTimeout: 5000 })
  MotionGlobalConfig.skipAnimations = true
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} }))
})

beforeEach(() => {
  sessionStorage.clear()
  resetProductsCache()
  act(() => setSession({ name: 'Demo Shopper', email: 'demo@silhoufit.com' }))
  seedCart([])
  fetchMock.mockResolvedValue({ products: PRODUCTS, syncedAt: '2026-10-10T15:05:00' })
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

// Same boutique (Ayala Atelier), both sold online and in store.
const TWO_AYALA: SeedLine[] = [
  { id: 'p01', size: 'M', color: 'Navy', qty: 2 },
  { id: 'p17', size: 'L', color: 'White', qty: 1 },
]

async function fillAddress(u: ReturnType<typeof user>) {
  await u.type(screen.getByLabelText('Phone number'), '9171234567')
  await u.type(screen.getByLabelText('Street address'), '12 Mabini Street, Brgy. San Roque')
  await u.type(screen.getByLabelText('City'), 'Marikina City')
  await u.type(screen.getByLabelText('Postal code'), '1800')
}

describe('CheckoutPage from the cart', () => {
  it('lists every cart line with its quantity and prices, an Edit cart link and the item count', async () => {
    seedCart(TWO_AYALA)
    renderCheckout()
    await screen.findByRole('heading', { name: 'Heritage Polo' })
    expect(screen.getByRole('heading', { name: 'Rail White Shirt' })).toBeInTheDocument()
    expect(screen.getByText('₱1,890.00 × 2')).toBeInTheDocument()
    expect(screen.getByText('₱1,790.00 × 1')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Change options/ })).toBeNull()
    expect(screen.getByRole('link', { name: 'Edit cart' })).toHaveAttribute('href', '/shop')
    const summary = screen.getByRole('complementary')
    expect(summary).toHaveTextContent('Subtotal (3 items)')
    expect(summary).toHaveTextContent('₱5,570.00') // 3,780 + 1,790
    expect(summary).toHaveTextContent('₱5,669.00') // plus one flat 99 shipping
  })

  it('shows what was left out or lowered in one status panel, and leaves the cart alone', async () => {
    seedCart([
      { id: 'p03', size: 'S', color: 'Black', qty: 1 },
      { id: 'p01', qty: 1 }, // from before sizes existed
      { id: 'p02', size: 'M', color: 'Black', qty: 9 }, // 4 in stock
      { id: 'gone', size: 'M', color: 'Navy', qty: 1 },
    ])
    renderCheckout()
    await screen.findByRole('heading', { name: 'Rail Tank Set' })
    const panel = screen.getByRole('status')
    expect(panel).toHaveTextContent('Heritage Polo has no size or colour chosen')
    expect(panel).toHaveTextContent('Fence-Line Blazer (M, Black): Quantity lowered to 4.')
    expect(panel).toHaveTextContent('no longer in the catalogue')
    expect(panel).toHaveTextContent('Your cart is unchanged until the order is placed.')
    expect(storedCart()).toHaveLength(4)
    expect(storedCart().find((l) => l.id === 'p02')!.qty).toBe(9)
  })

  it('says "Nothing to check out" with the reasons when no line can be bought', async () => {
    seedCart([{ id: 'p24', size: 'M', color: 'Indigo', qty: 1 }])
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

  it('disables pickup when the pieces come from different boutiques, saying which, and defaults to delivery', async () => {
    seedCart([
      { id: 'p01', size: 'M', color: 'Navy', qty: 1 }, // Ayala Atelier
      { id: 'p04', size: '30', color: 'Indigo', qty: 1 }, // Lumban Loom
    ])
    renderCheckout()
    await screen.findByRole('heading', { name: 'Heritage Polo' })
    expect(screen.getByRole('radio', { name: /Delivery/ })).toBeChecked()
    expect(screen.getByRole('radio', { name: /Pick up in store/ })).toBeDisabled()
    expect(screen.getByText('Pickup works for one boutique per order. These pieces are at Ayala Atelier and Lumban Loom.')).toBeInTheDocument()
  })

  it('blocks the order with an alert when no way of getting the pieces works for all of them', async () => {
    const u = user()
    seedCart([
      { id: 'p12', size: 'M', color: 'Olive', qty: 1 }, // store only
      { id: 'p05', size: 'M', color: 'Sand', qty: 1 }, // online only
    ])
    renderCheckout()
    await screen.findByRole('heading', { name: 'Hook Wall Jacket' })
    expect(screen.getByRole('alert')).toHaveTextContent(
      "These pieces can't go in one order: Hook Wall Jacket is store-only and Cable Knit Pullover is online-only. Check them out separately.",
    )
    expect(placeButton()).toBeDisabled()
    await u.click(placeButton())
    expect(placeMock).not.toHaveBeenCalled()
  })

  it('sends one order for all lines with one shipping fee', async () => {
    const u = user()
    seedCart(TWO_AYALA)
    renderCheckout()
    await screen.findByRole('heading', { name: 'Heritage Polo' })
    await fillAddress(u)
    await u.click(placeButton())
    await waitFor(() => expect(where()).toBe('/checkout/success'))
    expect(placeMock).toHaveBeenCalledTimes(1)
    expect(placeMock.mock.calls[0][0]).toMatchObject({
      total: 5669,
      items: [
        { id: 'p01', size: 'M', color: 'Navy', qty: 2 },
        { id: 'p17', size: 'L', color: 'White', qty: 1 },
      ],
    })
    expect(loadLastOrder()!.items).toHaveLength(2)
  })

  it('empties exactly the ordered lines after success, keeping lines that were left out or added meanwhile', async () => {
    const u = user()
    seedCart([...TWO_AYALA, { id: 'p24', size: 'M', color: 'Indigo', qty: 1 }]) // the sold-out line is left out
    renderCheckout('/checkout?source=cart')
    await screen.findByRole('heading', { name: 'Heritage Polo' })
    await fillAddress(u)
    // Another tab adds a piece while the form is open.
    seedCart([...storedCart(), { id: 'p03', size: 'S', color: 'Black', qty: 1 }])
    await u.click(placeButton())
    await waitFor(() => expect(where()).toBe('/checkout/success'))
    expect(storedCart().map((l) => l.id).sort()).toEqual(['p03', 'p24'])
  })

  it('does not clear the cart when the order fails', async () => {
    const u = user()
    seedCart(TWO_AYALA)
    placeMock.mockRejectedValueOnce(new Error('network'))
    renderCheckout()
    await screen.findByRole('heading', { name: 'Heritage Polo' })
    await fillAddress(u)
    await u.click(placeButton())
    const alert = await screen.findByRole('alert')
    expect(within(alert).getByRole('button', { name: 'Try again' })).toBeInTheDocument()
    expect(storedCart()).toHaveLength(2)
    expect(where()).toMatch(/^\/checkout\?/)
  })

  it('never touches the cart for a Buy now order', async () => {
    const u = user()
    seedCart([{ id: 'p01', size: 'M', color: 'Navy', qty: 2 }])
    renderCheckout('/checkout?item=p01&size=M&color=Navy&qty=1')
    await screen.findByRole('heading', { name: 'Heritage Polo' })
    expect(screen.getByRole('link', { name: 'Change options for Heritage Polo' })).toHaveAttribute('href', '/shop?item=p01&action=buy')
    expect(screen.queryByRole('link', { name: 'Edit cart' })).toBeNull()
    await fillAddress(u)
    await u.click(placeButton())
    await waitFor(() => expect(where()).toBe('/checkout/success'))
    expect(storedCart()).toEqual([{ id: 'p01', size: 'M', color: 'Navy', qty: 2 }])
  })

  it('keeps its items on screen once the cart is emptied by the order, with no flash of "Nothing to check out"', async () => {
    const u = user()
    let finish!: (value: { orderId: string }) => void
    placeMock.mockReturnValue(new Promise((resolve) => (finish = resolve)))
    seedCart(TWO_AYALA)
    renderCheckout()
    await screen.findByRole('heading', { name: 'Heritage Polo' })
    await fillAddress(u)
    await u.click(placeButton())
    finish({ orderId: 'SF-261011-ABCD' })
    await waitFor(() => expect(where()).toBe('/checkout/success'))
    expect(screen.queryByRole('heading', { name: 'Nothing to check out' })).toBeNull()
  })
})
