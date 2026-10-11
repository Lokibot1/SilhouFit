import { act, configure, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MotionGlobalConfig } from 'motion/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../../src/components/toast/ToastProvider'
import { PRODUCTS } from '../../src/data/products'
import { resetProductsCache } from '../../src/hooks/useProducts'
import { fetchProducts } from '../../src/service/fetchProducts'
import { clearSession, setSession } from '../../src/service/session'
import { WishlistPage } from '../../src/views/WishlistPage'

vi.mock('../../src/service/fetchProducts', () => ({ fetchProducts: vi.fn() }))
const fetchMock = vi.mocked(fetchProducts)
const CATALOGUE = { products: PRODUCTS, syncedAt: '2026-10-10T15:05:00' }

function seed(key: 'wishlist' | 'cart', value: unknown) {
  localStorage.setItem(`silhoufit-${key}`, JSON.stringify(value))
  act(() => {
    window.dispatchEvent(new StorageEvent('storage', { key: `silhoufit-${key}` }))
  })
}

class Stub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeAll(() => {
  configure({ asyncUtilTimeout: 5000 })
  vi.setConfig({ testTimeout: 15000 })
  MotionGlobalConfig.skipAnimations = true
  vi.stubGlobal('IntersectionObserver', Stub)
  vi.stubGlobal('ResizeObserver', Stub)
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} }))
})

beforeEach(() => {
  resetProductsCache()
  localStorage.clear()
  seed('wishlist', [])
  seed('cart', [])
  act(() => clearSession())
  fetchMock.mockResolvedValue(CATALOGUE)
})
afterEach(() => {
  vi.clearAllMocks()
})

function Where() {
  const { pathname, search } = useLocation()
  return <span data-testid="where">{pathname + search}</span>
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/wishlist']}>
      <ToastProvider>
        <Where />
        <Routes>
          <Route path="/wishlist" element={<WishlistPage />} />
          <Route path="*" element={<p>another page</p>} />
        </Routes>
      </ToastProvider>
    </MemoryRouter>,
  )
}

async function choose(user: ReturnType<typeof userEvent.setup>, size: string, color: string, button: string) {
  const dialog = await screen.findByRole('dialog', { name: /^Choose options/ })
  await user.click(within(dialog).getByRole('radio', { name: size }))
  await user.click(within(dialog).getByRole('radio', { name: color }))
  await user.click(within(dialog).getByRole('button', { name: button }))
}

describe('WishlistPage', () => {
  it('shows the skeleton while loading, then only the saved pieces in the order they were saved', async () => {
    seed('wishlist', ['p02', 'p01', 'gone'])
    let resolve!: (value: typeof CATALOGUE) => void
    fetchMock.mockReturnValueOnce(new Promise((r) => (resolve = r)))
    renderPage()
    expect(screen.getByRole('status', { name: 'Loading your wishlist' })).toBeInTheDocument()
    resolve(CATALOGUE)
    const cards = await screen.findAllByRole('article')
    expect(cards.map((c) => within(c).getByRole('heading').textContent)).toEqual(['Fence-Line Blazer', 'Heritage Polo'])
    expect(screen.getByText('2 pieces saved')).toBeInTheDocument()
  })

  it('offers a retry when the catalogue fails to load', async () => {
    fetchMock.mockRejectedValueOnce(new Error('offline'))
    const user = userEvent.setup()
    renderPage()
    expect(await screen.findByRole('alert')).toHaveTextContent('Your wishlist did not load')
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('heading', { name: 'Nothing saved yet' })).toBeInTheDocument()
  })

  describe('empty state', () => {
    it('greets a signed-in user by first name and points at new arrivals', async () => {
      act(() => setSession({ name: 'Maria Santos', email: 'maria@example.com' }))
      renderPage()
      expect(await screen.findByRole('heading', { name: 'Nothing saved yet, Maria' })).toBeInTheDocument()
      expect(screen.getByRole('link', { name: 'Shop new arrivals' })).toHaveAttribute('href', '/shop?sort=newest')
    })

    it('points a guest with a cart at the category of what they added last', async () => {
      seed('cart', [{ id: 'p02', size: 'M', color: 'Black', qty: 1 }])
      renderPage()
      expect(await screen.findByRole('heading', { name: 'Nothing saved yet' })).toBeInTheDocument()
      expect(screen.getByRole('link', { name: 'Browse Outerwear' })).toHaveAttribute('href', '/shop?category=Outerwear')
      expect(screen.getByRole('link', { name: 'Browse all pieces' })).toHaveAttribute('href', '/shop')
    })
  })

  it('removes one piece from its heart and puts it back with Undo', async () => {
    seed('wishlist', ['p01', 'p02'])
    const user = userEvent.setup()
    renderPage()
    await screen.findAllByRole('article')
    await user.click(screen.getByRole('button', { name: 'Save Heritage Polo to wishlist' }))
    expect(screen.getAllByRole('article')).toHaveLength(1)
    expect(JSON.parse(localStorage.getItem('silhoufit-wishlist')!)).toEqual(['p02'])
    expect(screen.getByRole('heading', { level: 1, name: 'Your wishlist' })).toHaveFocus()

    await user.click(screen.getByRole('button', { name: 'Undo' }))
    expect(screen.getAllByRole('article')).toHaveLength(2)
  })

  it('selects several pieces, counts them and removes them together', async () => {
    seed('wishlist', ['p01', 'p02', 'p03'])
    const user = userEvent.setup()
    renderPage()
    await screen.findAllByRole('article')
    const remove = screen.getByRole('button', { name: 'Remove' })
    expect(remove).toBeDisabled()

    await user.click(screen.getByRole('checkbox', { name: 'Select Heritage Polo' }))
    await user.click(screen.getByRole('checkbox', { name: 'Select Rail Tank Set' }))
    expect(screen.getByText('2 selected')).toBeInTheDocument()

    await user.click(remove)
    expect(screen.getAllByRole('article')).toHaveLength(1)
    expect(screen.getByText('Removed 2 pieces from wishlist')).toBeInTheDocument()
    expect(screen.getByText('0 selected')).toBeInTheDocument()
  })

  it('selects and clears everything with one control', async () => {
    seed('wishlist', ['p01', 'p02'])
    const user = userEvent.setup()
    renderPage()
    await screen.findAllByRole('article')
    await user.click(screen.getByRole('button', { name: 'Select all' }))
    expect(screen.getByText('2 selected')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Clear selection' }))
    expect(screen.getByText('0 selected')).toBeInTheDocument()
  })

  it('adds several selected pieces to the cart, choosing options for each in turn', async () => {
    seed('wishlist', ['p01', 'p02'])
    const user = userEvent.setup()
    renderPage()
    await screen.findAllByRole('article')
    await user.click(screen.getByRole('button', { name: 'Select all' }))
    await user.click(screen.getByRole('button', { name: 'Add to cart' }))

    expect(await screen.findByRole('dialog', { name: 'Choose options (1 of 2)' })).toBeInTheDocument()
    await choose(user, 'M', 'Navy', 'Next piece')
    expect(await screen.findByRole('dialog', { name: 'Choose options (2 of 2)' })).toBeInTheDocument()
    // Nothing is added until the last piece is confirmed.
    expect(JSON.parse(localStorage.getItem('silhoufit-cart') ?? '[]')).toEqual([])
    await choose(user, 'M', 'Black', 'Add to cart')

    await waitFor(() =>
      expect(JSON.parse(localStorage.getItem('silhoufit-cart')!)).toEqual([
        { id: 'p01', size: 'M', color: 'Navy', qty: 1 },
        { id: 'p02', size: 'M', color: 'Black', qty: 1 },
      ]),
    )
    expect(screen.getByText('Added 2 pieces to cart')).toBeInTheDocument()
    // They moved: no longer on the wishlist.
    expect(JSON.parse(localStorage.getItem('silhoufit-wishlist')!)).toEqual([])
    expect(screen.queryAllByRole('article')).toHaveLength(0)
    expect(screen.getByRole('heading', { name: 'Nothing saved yet' })).toBeInTheDocument()

    // Undo puts them back in both places.
    await user.click(screen.getByRole('button', { name: 'Undo' }))
    expect(JSON.parse(localStorage.getItem('silhoufit-cart')!)).toEqual([])
    expect(JSON.parse(localStorage.getItem('silhoufit-wishlist')!)).toEqual(['p01', 'p02'])
    expect(screen.getAllByRole('article')).toHaveLength(2)
  })

  it('buys several selected pieces in one checkout', async () => {
    seed('wishlist', ['p01', 'p02'])
    const user = userEvent.setup()
    renderPage()
    await screen.findAllByRole('article')
    await user.click(screen.getByRole('button', { name: 'Select all' }))
    await user.click(screen.getByRole('button', { name: 'Buy' }))
    await choose(user, 'M', 'Navy', 'Next piece')
    await choose(user, 'M', 'Black', 'Buy now')

    await screen.findByText('another page')
    const query = new URLSearchParams(screen.getByTestId('where').textContent!.split('?')[1])
    expect(query.getAll('item')).toEqual(['p01', 'p02'])
    expect(query.getAll('color')).toEqual(['Navy', 'Black'])
    expect(query.getAll('qty')).toEqual(['1', '1'])
  })

  it('adds one piece from its own card', async () => {
    seed('wishlist', ['p01'])
    const user = userEvent.setup()
    renderPage()
    await screen.findAllByRole('article')
    await user.click(screen.getByRole('button', { name: 'Add Heritage Polo to cart' }))
    await choose(user, 'S', 'White', 'Add to cart')
    await waitFor(() => expect(JSON.parse(localStorage.getItem('silhoufit-cart')!)).toHaveLength(1))
    expect(JSON.parse(localStorage.getItem('silhoufit-wishlist')!)).toEqual([])
  })

  it('leaves sold-out pieces out of Add and Buy, but lets them be removed', async () => {
    seed('wishlist', ['p24'])
    const user = userEvent.setup()
    renderPage()
    await screen.findAllByRole('article')
    await user.click(screen.getByRole('checkbox', { name: /^Select / }))
    expect(screen.getByRole('button', { name: 'Add to cart' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Buy' })).toBeDisabled()
    expect(screen.getByText(/sold out: they can be removed but not added or bought/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remove' })).toBeEnabled()
  })
})
