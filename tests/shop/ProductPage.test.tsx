import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MotionGlobalConfig } from 'motion/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../../src/components/toast/ToastProvider'
import { PRODUCTS } from '../../src/data/products'
import { resetProductsCache } from '../../src/hooks/useProducts'
import { fetchProducts } from '../../src/service/fetchProducts'
import { ProductPage } from '../../src/views/public/ProductPage'

vi.mock('../../src/service/fetchProducts', () => ({ fetchProducts: vi.fn() }))
const fetchMock = vi.mocked(fetchProducts)
const CATALOGUE = { products: PRODUCTS, syncedAt: '2026-10-10T15:05:00' }

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
  resetProductsCache()
  localStorage.clear()
  seed('silhoufit-wishlist')
  seed('silhoufit-cart')
  fetchMock.mockResolvedValue(CATALOGUE)
})
afterEach(() => {
  vi.clearAllMocks()
})

function Where() {
  const { pathname, search } = useLocation()
  return <span data-testid="where">{pathname + search}</span>
}

function renderPage(id = 'p01') {
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
  it('shows a skeleton while loading, then the piece', async () => {
    let resolve!: (value: typeof CATALOGUE) => void
    fetchMock.mockReturnValueOnce(new Promise((r) => (resolve = r)))
    renderPage()
    expect(screen.getByRole('status', { name: 'Loading the product' })).toBeInTheDocument()

    await act(async () => resolve(CATALOGUE))
    expect(screen.queryByRole('status', { name: 'Loading the product' })).toBeNull()
    expect(screen.getByRole('heading', { level: 1, name: 'Heritage Polo' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'Heritage Polo' })).toBeInTheDocument()
    expect(screen.getByText('4.7 · 212 reviews')).toBeInTheDocument()
    expect(document.title).toBe('Heritage Polo — SilhouFit')
    expect(document.querySelector('meta[name="description"]')?.getAttribute('content')?.length).toBeLessThanOrEqual(160)
  })

  it('keeps every piece description within 150 to 160 characters', async () => {
    for (const p of PRODUCTS) {
      const { unmount } = renderPage(p.id)
      await screen.findByRole('heading', { level: 2, name: p.name })
      const length = document.querySelector('meta[name="description"]')!.getAttribute('content')!.length
      expect(length, p.id).toBeGreaterThanOrEqual(150)
      expect(length, p.id).toBeLessThanOrEqual(160)
      unmount()
    }
  })

  it('says so when the piece is not in the catalogue', async () => {
    renderPage('nope')
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
    expect(await screen.findByRole('heading', { level: 2, name: 'Heritage Polo' })).toBeInTheDocument()
  })
})

describe('ProductPage purchase', () => {
  it('requires a size, with an inline error and focus', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByRole('heading', { level: 2, name: 'Heritage Polo' })

    await user.click(screen.getByRole('button', { name: /^Add to cart/ }))
    expect(screen.getByRole('alert')).toHaveTextContent('Choose a size to continue.')
    expect(screen.getByRole('radio', { name: 'XS' })).toHaveFocus()
    expect(storedCart()).toEqual([])
  })

  it('adds to the cart with a toast and Undo', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByRole('heading', { level: 2, name: 'Heritage Polo' })

    await user.click(screen.getByRole('radio', { name: 'Navy' }))
    await user.click(screen.getByRole('radio', { name: 'M' }))
    await user.click(screen.getByRole('button', { name: 'Increase quantity' }))
    await user.click(screen.getByRole('button', { name: /^Add to cart/ }))

    expect(await screen.findByText('Added to cart: Heritage Polo, M, Navy × 2')).toBeInTheDocument()
    expect(storedCart()).toEqual([{ id: 'p01', size: 'M', color: 'Navy', qty: 2 }])

    await user.click(screen.getByRole('button', { name: 'Undo' }))
    expect(storedCart()).toEqual([])
  })

  it('toggles the wishlist with an Undo', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByRole('heading', { level: 2, name: 'Heritage Polo' })

    const heart = screen.getByRole('button', { name: 'Save Heritage Polo to wishlist' })
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
    renderPage('p02') // one colour, preselected
    await screen.findByRole('heading', { level: 2, name: 'Fence-Line Blazer' })

    await user.click(screen.getByRole('radio', { name: 'L' }))
    await user.click(screen.getByRole('button', { name: 'Buy now' }))
    expect(screen.getByTestId('where')).toHaveTextContent('/checkout?item=p02&size=L&color=Black&qty=1')
  })

  it('offers the AR button only for AR-ready pieces, disabled', async () => {
    const { unmount } = renderPage('p02')
    const ar = await screen.findByRole('button', { name: 'AR Virtual Try-On' })
    expect(ar).toHaveAttribute('aria-disabled', 'true')
    unmount()

    renderPage('p01')
    await screen.findByRole('heading', { level: 2, name: 'Heritage Polo' })
    expect(screen.queryByRole('button', { name: 'AR Virtual Try-On' })).toBeNull()
  })

  it('disables both buttons for a sold-out piece', async () => {
    const user = userEvent.setup()
    renderPage('p24')
    await screen.findByRole('heading', { level: 2, name: 'Field Denim Jacket' })

    const add = screen.getByRole('button', { name: 'Add to cart, sold out' })
    const buy = screen.getByRole('button', { name: 'Buy now, sold out' })
    expect(add).toHaveAttribute('aria-disabled', 'true')
    expect(buy).toHaveAttribute('aria-disabled', 'true')
    await user.click(buy)
    expect(screen.getByTestId('where')).toHaveTextContent('/shop/p24')
  })

  it('switches the main photo from the thumbnails', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByRole('heading', { level: 2, name: 'Heritage Polo' })

    expect(screen.getByText('1/3')).toBeInTheDocument()
    const second = screen.getByRole('button', { name: 'Show view 2 of 3' })
    await user.click(second)
    expect(second).toHaveAttribute('aria-current', 'true')
    expect(screen.getByText('2/3')).toBeInTheDocument()
  })
})
