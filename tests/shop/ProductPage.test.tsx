import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MotionGlobalConfig } from 'motion/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../../src/components/toast/ToastProvider'
import type { Product } from '../../src/data/products'
import { clearProductCache } from '../../src/hooks/useProducts'
import { ProductListError } from '../../src/service/fetchProductList'
import { fetchShopProduct } from '../../src/service/fetchShopProducts'
import { ProductPage } from '../../src/views/public/ProductPage'

vi.mock('../../src/service/fetchShopProducts', () => ({ fetchShopProduct: vi.fn(), fetchShopProducts: vi.fn() }))
const fetchMock = vi.mocked(fetchShopProduct)

const variant = (id: string, color: string, size: string, price: number, stock: number) => ({
  id, sku: id, name: null, size, color, colorHex: null, price, stock, imageUrl: null, measurements: null,
})

/** What the API adapter hands the page: real variants, and none of the fields the API does not have. */
const piece = (overrides: Partial<Product> = {}): Product => ({
  id: '00000000-0000-4000-8000-000000000001',
  slug: 'linen-shirt',
  name: 'Linen Shirt',
  category: 'Hoodie',
  boutique: 'Ayala Atelier',
  price: 1500,
  priceMax: 1800,
  image: '/a.webp',
  alt: 'Linen Shirt front',
  images: ['/b.webp'],
  description: 'A linen shirt.',
  colors: [{ name: 'Black', hex: '#111111' }, { name: 'Navy', hex: '#1b2a49' }],
  badges: [],
  stock: 25,
  arReady: false,
  addedAt: '2026-05-05T08:00:00.000Z',
  rating: 0,
  reviews: 0,
  variants: [variant('v1', 'Black', 'S', 1500, 10), variant('v2', 'Black', 'M', 1500, 10), variant('v3', 'Navy', 'M', 1800, 5)],
  ...overrides,
})
const LINEN = piece()

function seed(key: 'silhoufit-cart' | 'silhoufit-wishlist', value: unknown[] = []) {
  localStorage.setItem(key, JSON.stringify(value))
  act(() => {
    window.dispatchEvent(new StorageEvent('storage', { key }))
  })
}

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} }))
})

beforeEach(() => {
  clearProductCache()
  localStorage.clear()
  seed('silhoufit-wishlist')
  seed('silhoufit-cart')
  fetchMock.mockResolvedValue(LINEN)
})
afterEach(() => {
  vi.resetAllMocks()
})

function Where() {
  const { pathname, search } = useLocation()
  return <span data-testid="where">{pathname + search}</span>
}

function renderPage(id = 'linen-shirt') {
  return render(
    <MemoryRouter initialEntries={[`/shop/${id}`]}>
      <ToastProvider>
        <Where />
        <Routes>
          <Route path="/shop/:id" element={<ProductPage />} />
          <Route path="*" element={<p>another page</p>} />
        </Routes>
      </ToastProvider>
    </MemoryRouter>,
  )
}

const storedCart = () => JSON.parse(localStorage.getItem('silhoufit-cart') ?? '[]') as { id: string; size: string; color: string; qty: number }[]

describe('ProductPage states', () => {
  it('shows a skeleton while loading, then the piece, with no rating or sale price', async () => {
    let resolve!: (value: Product) => void
    fetchMock.mockReturnValueOnce(new Promise((r) => (resolve = r)))
    renderPage()
    expect(screen.getByRole('status', { name: 'Loading the product' })).toBeInTheDocument()

    await act(async () => resolve(LINEN))
    expect(screen.queryByRole('status', { name: 'Loading the product' })).toBeNull()
    expect(screen.getByRole('heading', { level: 1, name: 'Linen Shirt' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'Linen Shirt' })).toBeInTheDocument()
    expect(screen.queryByText(/reviews?$/)).toBeNull()
    expect(screen.queryByText(/Rated/)).toBeNull()
    expect(screen.queryByText(/% off|Sale/i)).toBeNull()
    expect(document.title).toBe('Linen Shirt — SilhouFit')
    expect(document.querySelector('meta[name="description"]')?.getAttribute('content')?.length).toBeLessThanOrEqual(160)
    expect(fetchMock.mock.calls[0][0]).toBe('linen-shirt')
  })

  it('says so when the API has no such piece, or it is archived', async () => {
    fetchMock.mockRejectedValue(new ProductListError('not-found'))
    renderPage('archived-cardigan')
    expect(await screen.findByRole('heading', { name: 'This piece is no longer in the catalogue' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Browse the shop' })).toHaveAttribute('href', '/shop')
    expect(document.title).toBe('Piece not found — SilhouFit')
  })

  it('explains a failed load and recovers on "Try again"', async () => {
    const user = userEvent.setup()
    fetchMock.mockRejectedValueOnce(new Error('network'))
    renderPage()
    expect(await screen.findByRole('alert')).toHaveTextContent('This piece did not load')
    expect(screen.getAllByRole('link', { name: 'Back to shop' }).length).toBeGreaterThan(0)

    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('heading', { level: 2, name: 'Linen Shirt' })).toBeInTheDocument()
  })
})

describe('ProductPage purchase', () => {
  it('requires a size, with an inline error and focus', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByRole('heading', { level: 2, name: 'Linen Shirt' })

    await user.click(screen.getByRole('button', { name: /^Add to cart/ }))
    expect(screen.getByRole('alert')).toHaveTextContent('Choose a size to continue.')
    expect(storedCart()).toEqual([])
  })

  it('offers only the sizes and colours the variants have, and adds to the cart with a toast and Undo', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByRole('heading', { level: 2, name: 'Linen Shirt' })

    expect(screen.getByRole('radio', { name: 'S' })).toBeInTheDocument()
    expect(screen.queryByRole('radio', { name: 'XL' })).toBeNull()
    await user.click(screen.getByRole('radio', { name: 'Navy' }))
    await user.click(screen.getByRole('radio', { name: 'M' }))
    await user.click(screen.getByRole('button', { name: 'Increase quantity' }))
    await user.click(screen.getByRole('button', { name: /^Add to cart/ }))

    expect(await screen.findByText('Added to cart: Linen Shirt, M, Navy × 2')).toBeInTheDocument()
    expect(storedCart()).toEqual([{ variantId: 'v3', productId: LINEN.id, qty: 2 }])

    await user.click(screen.getByRole('button', { name: 'Undo' }))
    expect(storedCart()).toEqual([])
  })

  it('toggles the wishlist with an Undo', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByRole('heading', { level: 2, name: 'Linen Shirt' })

    const heart = screen.getByRole('button', { name: 'Save Linen Shirt to wishlist' })
    await user.click(heart)
    expect(heart).toHaveAttribute('aria-pressed', 'true')
    expect(await screen.findByText('Saved to wishlist')).toBeInTheDocument()

    await user.click(heart)
    expect(heart).toHaveAttribute('aria-pressed', 'false')
    await user.click(await screen.findByRole('button', { name: 'Undo' }))
    expect(heart).toHaveAttribute('aria-pressed', 'true')
  })

  it('goes to checkout with the choice on Buy now', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByRole('heading', { level: 2, name: 'Linen Shirt' })

    await user.click(screen.getByRole('radio', { name: 'Black' }))
    await user.click(screen.getByRole('radio', { name: 'S' }))
    await user.click(screen.getByRole('button', { name: 'Buy now' }))
    expect(screen.getByTestId('where')).toHaveTextContent(`/checkout?item=${LINEN.id}&variant=v1&qty=1`)
  })

  it('never offers the AR button, as the API has no AR flag', async () => {
    renderPage()
    await screen.findByRole('heading', { level: 2, name: 'Linen Shirt' })
    expect(screen.queryByRole('button', { name: 'AR Virtual Try-On' })).toBeNull()
  })

  it('disables both buttons for a sold-out piece', async () => {
    const user = userEvent.setup()
    fetchMock.mockResolvedValue(piece({ stock: 0, variants: [variant('v9', 'Black', 'S', 1300, 0)], colors: [{ name: 'Black', hex: '#111111' }] }))
    renderPage()
    await screen.findByRole('heading', { level: 2, name: 'Linen Shirt' })

    const add = screen.getByRole('button', { name: 'Add to cart, sold out' })
    const buy = screen.getByRole('button', { name: 'Buy now, sold out' })
    expect(add).toHaveAttribute('aria-disabled', 'true')
    expect(buy).toHaveAttribute('aria-disabled', 'true')
    await user.click(buy)
    expect(screen.getByTestId('where')).toHaveTextContent('/shop/linen-shirt')
  })

  it('switches the main photo from the thumbnails', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByRole('heading', { level: 2, name: 'Linen Shirt' })

    expect(screen.getByText('1/2')).toBeInTheDocument()
    const second = screen.getByRole('button', { name: 'Show view 2 of 2' })
    await user.click(second)
    expect(second).toHaveAttribute('aria-current', 'true')
    expect(screen.getByText('2/2')).toBeInTheDocument()
  })
})
