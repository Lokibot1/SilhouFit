import { act, configure, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MotionGlobalConfig } from 'motion/react'
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../../src/components/toast/ToastProvider'
import { clearSession, setSession } from '../../src/service/session'
import { ShopNavbar } from '../../src/components/ShopNavbar'
import { ThemeProvider } from '../../src/contexts/ThemeContext'
import { PRODUCTS } from '../../src/data/products'
import { resetProductsCache } from '../../src/hooks/useProducts'
import { fetchProducts } from '../../src/service/fetchProducts'
import { ShopPage } from '../../src/views/ShopPage'

vi.mock('../../src/service/fetchProducts', () => ({ fetchProducts: vi.fn() }))
const fetchMock = vi.mocked(fetchProducts)
const CATALOGUE = { products: PRODUCTS, syncedAt: '2026-10-10T15:05:00' }

const scrollIntoView = vi.fn()

// The wishlist store re-reads localStorage on a storage event (how another tab reaches it).
function seedCart(lines: { id: string; qty: number }[] = []) {
  localStorage.setItem('silhoufit-cart', JSON.stringify(lines))
  act(() => {
    window.dispatchEvent(new StorageEvent('storage', { key: 'silhoufit-cart' }))
  })
}

function seedWishlist(ids: string[] = []) {
  localStorage.setItem('silhoufit-wishlist', JSON.stringify(ids))
  act(() => {
    window.dispatchEvent(new StorageEvent('storage', { key: 'silhoufit-wishlist' }))
  })
}

beforeAll(() => {
  configure({ asyncUtilTimeout: 5000 }) // the search is debounced; a loaded machine can be slow
  vi.setConfig({ testTimeout: 15000 })
  MotionGlobalConfig.skipAnimations = true
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  )
  vi.stubGlobal('ResizeObserver', class {
    observe() {}
    unobserve() {}
    disconnect() {}
  })
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    addEventListener() {},
    removeEventListener() {},
  }))
  Element.prototype.scrollIntoView = scrollIntoView
})

beforeEach(() => {
  resetProductsCache()
  localStorage.clear()
  seedWishlist()
  seedCart()
  act(() => clearSession())
  fetchMock.mockResolvedValue(CATALOGUE)
})
afterEach(() => {
  vi.clearAllMocks()
  vi.restoreAllMocks()
})

function Where() {
  const { pathname, search } = useLocation()
  return (
    <>
      <span data-testid="search">{search}</span>
      <span data-testid="path">{pathname}</span>
    </>
  )
}

function Back() {
  const navigate = useNavigate()
  return (
    <button type="button" onClick={() => navigate(-1)}>
      Back
    </button>
  )
}

function renderPage(url = '/shop') {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <ThemeProvider>
        <ToastProvider>
          <ShopNavbar />
          <Where />
          <Back />
          <Routes>
            <Route path="/shop" element={<ShopPage />} />
            <Route path="*" element={<p>another page</p>} />
          </Routes>
        </ToastProvider>
      </ThemeProvider>
    </MemoryRouter>,
  )
}

const urlSearch = () => screen.getByTestId('search').textContent ?? ''
const cards = () => screen.queryAllByRole('article')
const loaded = () => screen.findAllByRole('article')

describe('ShopPage states', () => {
  it('shows the skeleton while loading, then the first 12 cards', async () => {
    let resolve!: (value: typeof CATALOGUE) => void
    fetchMock.mockReturnValueOnce(new Promise((r) => (resolve = r)))
    renderPage()

    expect(screen.getByRole('status', { name: 'Loading the catalogue' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'All pieces' })).toBeInTheDocument()
    expect(cards()).toHaveLength(0)

    resolve(CATALOGUE)
    expect(await loaded()).toHaveLength(12)
    expect(screen.queryByRole('status')).toBeNull()
    expect(screen.getByText('24 pieces')).toBeInTheDocument()
    expect(screen.getByText(/^Stock synced \d{1,2}:\d{2}\s?[AP]M$/)).toBeInTheDocument()
  })

  it('explains a failed load and recovers on "Try again"', async () => {
    const user = userEvent.setup()
    fetchMock.mockRejectedValueOnce(new Error('network'))
    renderPage()

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/did not load/i)
    expect(alert).toHaveTextContent(/connection/i)
    expect(cards()).toHaveLength(0)

    await user.click(within(alert).getByRole('button', { name: 'Try again' }))
    expect(await loaded()).toHaveLength(12)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('shows the empty state for a search with no hits and clears it', async () => {
    const user = userEvent.setup()
    renderPage()
    await loaded()

    await user.type(screen.getByRole('searchbox', { name: 'Search the catalogue' }), 'zzzz')
    expect(await screen.findByText('No pieces match "zzzz"')).toBeInTheDocument()
    expect(screen.getByText(/check the spelling/i)).toBeInTheDocument()
    expect(cards()).toHaveLength(0)

    await user.click(screen.getByRole('button', { name: 'Clear search and filters' }))
    expect(await loaded()).toHaveLength(12)
    expect(screen.getByRole('searchbox')).toHaveValue('')
    expect(urlSearch()).toBe('')
  })

  it('restores the old search text when Back follows "Clear search and filters"', async () => {
    const user = userEvent.setup()
    renderPage()
    await loaded()
    await user.type(screen.getByRole('searchbox'), 'zzzz')
    await waitFor(() => expect(urlSearch()).toBe('?q=zzzz'))

    await user.click(await screen.findByRole('button', { name: 'Clear search and filters' }))
    expect(await loaded()).toHaveLength(12)
    expect(screen.getByRole('searchbox')).toHaveValue('')
    expect(screen.getByRole('heading', { level: 1, name: 'All pieces' })).toHaveFocus()

    await user.click(screen.getByRole('button', { name: 'Back' }))
    await waitFor(() => expect(screen.getByRole('searchbox')).toHaveValue('zzzz'))
    expect(await screen.findByText('No pieces match "zzzz"')).toBeInTheDocument()
    await new Promise((resolve) => setTimeout(resolve, 400)) // let the debounce settle
    expect(urlSearch()).toBe('?q=zzzz')
  })

  it('names the filters when they, not just the search, empty the list', async () => {
    renderPage('/shop?q=polo&category=Bottoms')
    expect(await screen.findByText('No pieces match "polo" with your filters')).toBeInTheDocument()
  })

  it('shows the last catalogue at once on a return visit while a fresh copy loads', async () => {
    const first = renderPage()
    await loaded()
    first.unmount()

    fetchMock.mockReturnValueOnce(new Promise(() => {}))
    renderPage()
    expect(cards()).toHaveLength(12)
    expect(screen.queryByRole('status', { name: 'Loading the catalogue' })).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('aborts the request when the page unmounts', () => {
    fetchMock.mockReturnValueOnce(new Promise(() => {}))
    const { unmount } = renderPage()
    const { signal } = fetchMock.mock.calls[0][0]!
    expect(signal!.aborted).toBe(false)
    unmount()
    expect(signal!.aborted).toBe(true)
  })
})

describe('ShopPage metadata', () => {
  it('sets the title and a 150-160 character description, and restores both on leave', () => {
    document.title = 'Before'
    const meta = document.createElement('meta')
    meta.name = 'description'
    meta.content = 'Before description'
    document.head.appendChild(meta)

    const { unmount } = renderPage()
    expect(document.title).toBe('Shop the catalogue — SilhouFit')
    expect(meta.content.length).toBeGreaterThanOrEqual(150)
    expect(meta.content.length).toBeLessThanOrEqual(160)

    unmount()
    expect(document.title).toBe('Before')
    expect(meta.content).toBe('Before description')
    meta.remove()
  })
})

describe('ShopPage search, category and URL state', () => {
  it('debounces typing into q and resets the page', async () => {
    const user = userEvent.setup()
    renderPage('/shop?page=2')
    await loaded()

    await user.type(screen.getByRole('searchbox'), 'polo')
    await waitFor(() => expect(urlSearch()).toBe('?q=polo'))
    expect(cards().length).toBeGreaterThan(0)
    expect(cards().length > 0 && cards().every((card) => /polo/i.test(card.textContent ?? ''))).toBe(true)
  })

  it('marks the active pill, writes the category to the URL and drops the page', async () => {
    const user = userEvent.setup()
    renderPage('/shop?page=2')
    await loaded()

    const all = screen.getByRole('button', { name: /^All\s*24$/ })
    expect(all).toHaveAttribute('aria-pressed', 'true')

    const tops = screen.getByRole('button', { name: /^Tops/ })
    await user.click(tops)
    expect(tops).toHaveAttribute('aria-pressed', 'true')
    expect(all).toHaveAttribute('aria-pressed', 'false')
    expect(urlSearch()).toBe('?category=Tops')
    expect(screen.getByRole('heading', { level: 1, name: 'Tops' })).toBeInTheDocument()
    expect(cards().length > 0 && cards().every((card) => /Tops/.test(card.textContent ?? ''))).toBe(true)
  })

  it('reads its state from the URL', async () => {
    renderPage('/shop?category=Bottoms&sort=price-asc&view=list&perPage=24')
    await loaded()
    expect(screen.getByRole('button', { name: /^Bottoms/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByLabelText('Sort by')).toHaveTextContent('Sort: Price: low to high')
    expect(screen.getByLabelText('Pieces per page')).toHaveTextContent('24 per page')
    expect(screen.getByRole('button', { name: 'List view' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('changes sort through the select and resets the page', async () => {
    const user = userEvent.setup()
    renderPage('/shop?page=2')
    await loaded()
    await user.click(screen.getByLabelText('Sort by'))
    await user.click(screen.getByRole('option', { name: 'Price: high to low' }))
    expect(urlSearch()).toBe('?sort=price-desc')
    expect(within(cards()[0]).getByText('₱8,900.00')).toBeInTheDocument()
  })
})

describe('ShopPage pagination', () => {
  it('moves between pages, focuses the results heading and scrolls to it', async () => {
    const user = userEvent.setup()
    renderPage()
    await loaded()
    const nav = screen.getByRole('navigation', { name: 'Pagination' })
    expect(within(nav).getByRole('button', { name: 'Prev' })).toBeDisabled()
    expect(within(nav).getByRole('button', { name: 'Page 1' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByText('Page 1 of 2')).toBeInTheDocument()
    expect(screen.getByText('Displaying 1–12 of 24')).toBeInTheDocument()

    await user.click(within(nav).getByRole('button', { name: 'Next' }))
    expect(urlSearch()).toBe('?page=2')
    expect(screen.getByText('Displaying 13–24 of 24')).toBeInTheDocument()
    expect(within(nav).getByRole('button', { name: 'Page 2' })).toHaveAttribute('aria-current', 'page')
    expect(within(nav).getByRole('button', { name: 'Next' })).toBeDisabled()
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'All pieces' })).toHaveFocus())
    expect(scrollIntoView).toHaveBeenCalled()
  })

  it('shows more pieces per page and drops the extra page', async () => {
    const user = userEvent.setup()
    renderPage('/shop?page=2')
    await loaded()
    await user.click(screen.getByLabelText('Pieces per page'))
    await user.click(screen.getByRole('option', { name: '24 per page' }))
    expect(urlSearch()).toBe('?perPage=24')
    expect(cards()).toHaveLength(24)
    expect(screen.getByText('Page 1 of 1')).toBeInTheDocument()
  })
})

describe('ShopPage cards', () => {
  it('shows price, sale price, low stock, swatch names and loads the first four images eagerly', async () => {
    renderPage()
    await loaded()
    const images = screen.getAllByRole('img').filter((img) => img.tagName === 'IMG')
    expect(images.slice(0, 4).every((img) => img.getAttribute('loading') === 'eager')).toBe(true)
    expect(images[4]).toHaveAttribute('loading', 'lazy')
    expect(images[0]).toHaveAttribute('decoding', 'async')

    const blazer = cards().find((c) => c.textContent?.includes('Fence-Line Blazer'))!
    expect(within(blazer).getByText(/Original price/)).toBeInTheDocument()
    expect(blazer.querySelector('s')).toHaveTextContent('₱6,490.00')
    expect(blazer).toHaveTextContent('₱4,990.00')
    expect(within(blazer).getByText('Only 4 left')).toBeInTheDocument()
    expect(within(blazer).getByText('Available in Black')).toBeInTheDocument()
  })

  it('swaps a broken photo for a placeholder with the product name', async () => {
    renderPage()
    await loaded()
    const first = cards()[0]
    fireEvent.error(within(first).getByRole('img', { name: PRODUCTS[0].alt }))
    expect(first.querySelector('img')).toBeNull()
    expect(within(first).getByRole('img', { name: 'Heritage Polo (photo unavailable)' })).toBeInTheDocument()
  })

  it('toggles a wishlist heart, updates the count and persists it', async () => {
    const user = userEvent.setup()
    renderPage()
    await loaded()
    const heart = screen.getByRole('button', { name: 'Save Heritage Polo to wishlist' })
    expect(heart).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByText('Saved 0')).toBeInTheDocument()

    await user.click(heart)
    expect(heart).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('Saved 1')).toBeInTheDocument()
    expect(screen.getByText('Saved to wishlist')).toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem('silhoufit-wishlist')!)).toEqual(['p01'])

    await user.click(heart)
    expect(heart).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByText('Saved 0')).toBeInTheDocument()
    expect(screen.getByText('Removed from wishlist')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Undo' }))
    expect(heart).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('Saved 1')).toBeInTheDocument()
  })

  it('ignores saved ids that are not in the catalogue when counting', async () => {
    seedWishlist(['p01', 'gone'])
    renderPage()
    await loaded()
    expect(screen.getByText('Saved 1')).toBeInTheDocument()
    // Hidden from the count, not deleted: a piece that comes back is still saved.
    expect(JSON.parse(localStorage.getItem('silhoufit-wishlist')!)).toEqual(['p01', 'gone'])
  })

  it('restores saved pieces from storage and survives storage being blocked', async () => {
    seedWishlist(['p02'])
    const { unmount } = renderPage()
    await loaded()
    expect(screen.getByRole('button', { name: 'Save Fence-Line Blazer to wishlist' })).toHaveAttribute('aria-pressed', 'true')
    unmount()

    resetProductsCache()
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation((key) => {
      if (key === 'silhoufit-wishlist') throw new Error('blocked')
    })
    const user = userEvent.setup()
    renderPage()
    await loaded()
    await user.click(screen.getByRole('button', { name: 'Save Heritage Polo to wishlist' }))
    expect(screen.getByText('Saved 2')).toBeInTheDocument()
  })
})

describe('ShopPage header and motion', () => {
  it('has a breadcrumb back home and a heading that follows the view', async () => {
    const user = userEvent.setup()
    renderPage()
    await loaded()
    const crumbs = screen.getByRole('navigation', { name: 'Breadcrumb' })
    expect(within(crumbs).getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/')
    expect(within(crumbs).getByText('Shop')).toHaveAttribute('aria-current', 'page')
    expect(screen.queryByText('Shop the rail')).toBeNull()
    expect(screen.getByRole('heading', { level: 1, name: 'All pieces' })).toBeInTheDocument()
    expect(screen.getByText('24 pieces')).toBeInTheDocument() // the summary sits beside the heading

    await user.click(screen.getByRole('button', { name: /^Outerwear/ }))
    expect(screen.getByRole('heading', { level: 1, name: 'Outerwear' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 2, name: 'Outerwear' })).toBeNull()
  })

  it('derives the heading from the URL before any data arrives', () => {
    fetchMock.mockReturnValueOnce(new Promise(() => {}))
    renderPage('/shop?category=Knitwear')
    expect(screen.getByRole('heading', { level: 1, name: 'Knitwear' })).toBeInTheDocument()
    expect(screen.getByRole('status', { name: 'Loading the catalogue' })).toBeInTheDocument()
  })

  it('moves the sliding indicator with the pressed view and category', async () => {
    const user = userEvent.setup()
    renderPage()
    await loaded()
    const indicator = (button: HTMLElement) => button.querySelector('.skeuo-ink-face')
    const grid = screen.getByRole('button', { name: 'Grid view' })
    const list = screen.getByRole('button', { name: 'List view' })
    expect(indicator(grid)).not.toBeNull()
    expect(indicator(list)).toBeNull()
    await user.click(list)
    expect(indicator(list)).not.toBeNull()
    expect(indicator(grid)).toBeNull()

    await user.click(screen.getByRole('button', { name: /^Tops/ }))
    expect(indicator(screen.getByRole('button', { name: /^Tops/ }))).not.toBeNull()
    expect(indicator(screen.getByRole('button', { name: /^All/ }))).toBeNull()
  })
})

describe('ShopPage cart buttons', () => {
  const path = () => screen.getByTestId('path').textContent
  const signedIn = () => act(() => setSession({ name: 'Demo Shopper', email: 'demo@silhoufit.com' }))
  const dialog = () => screen.findByRole('dialog', { name: 'Choose options' })

  it("opens the sheet for a guest's Add to cart, with no sign-in hint and no redirect", async () => {
    const user = userEvent.setup()
    renderPage('/shop?category=Tops')
    await loaded()
    await user.click(screen.getByRole('button', { name: 'Add Heritage Polo to cart' }))
    const sheet = await dialog()
    expect(path()).toBe('/shop')
    expect(within(sheet).getByRole('button', { name: 'Add to cart' })).toBeInTheDocument()
    expect(within(sheet).queryByText("You'll sign in before you pay.")).toBeNull()
  })

  it("opens the sheet for a guest's Buy, says they will sign in before paying, and goes to checkout", async () => {
    const user = userEvent.setup()
    renderPage()
    await loaded()
    await user.click(screen.getByRole('button', { name: 'Buy Heritage Polo' }))
    const sheet = await dialog()
    expect(within(sheet).getByText("You'll sign in before you pay.")).toBeInTheDocument()
    await user.click(within(sheet).getByRole('radio', { name: 'M' }))
    await user.click(within(sheet).getByRole('radio', { name: 'Navy' }))
    await user.click(within(sheet).getByRole('button', { name: 'Buy now' }))
    expect(path()).toBe('/checkout') // the checkout page itself asks for the sign-in
    expect(urlSearch()).toBe('?item=p01&size=M&color=Navy&qty=1')
  })

  it('lets a guest add to the cart and raises the badge', async () => {
    const user = userEvent.setup()
    renderPage()
    await loaded()
    await user.click(screen.getByRole('button', { name: 'Add Heritage Polo to cart' }))
    const sheet = await dialog()
    await user.click(within(sheet).getByRole('radio', { name: 'S' }))
    await user.click(within(sheet).getByRole('radio', { name: 'White' }))
    await user.click(within(sheet).getByRole('button', { name: 'Add to cart' }))
    expect(await screen.findByText('Added to cart: Heritage Polo, S, White × 1')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cart, 1 item' })).toBeInTheDocument()
  })

  it('opens the spec sheet for a signed-in shopper, requires a size, then adds with an Undo', async () => {
    signedIn()
    const user = userEvent.setup()
    renderPage()
    await loaded()
    expect(screen.getByRole('button', { name: 'Cart, 0 items' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Add Heritage Polo to cart' }))
    const sheet = await dialog()
    await user.click(within(sheet).getByRole('button', { name: 'Add to cart' }))
    expect(within(sheet).getByRole('alert')).toHaveTextContent('Choose a size to continue.')

    await user.click(within(sheet).getByRole('radio', { name: 'M' }))
    await user.click(within(sheet).getByRole('radio', { name: 'Navy' }))
    await user.click(within(sheet).getByRole('button', { name: 'Increase quantity' }))
    await user.click(within(sheet).getByRole('button', { name: 'Add to cart' }))

    expect(await screen.findByText('Added to cart: Heritage Polo, M, Navy × 2')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cart, 2 items' })).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

    await user.click(screen.getByRole('button', { name: 'Undo' }))
    expect(screen.getByRole('button', { name: 'Cart, 0 items' })).toBeInTheDocument()
  })

  it('takes Buy now from the sheet to checkout with the chosen specs', async () => {
    signedIn()
    const user = userEvent.setup()
    renderPage()
    await loaded()
    await user.click(screen.getByRole('button', { name: 'Buy Heritage Polo' }))
    const sheet = await dialog()
    await user.click(within(sheet).getByRole('radio', { name: 'L' }))
    await user.click(within(sheet).getByRole('radio', { name: 'White' }))
    await user.click(within(sheet).getByRole('button', { name: 'Buy now' }))
    expect(path()).toBe('/checkout')
    expect(urlSearch()).toBe('?item=p01&size=L&color=White&qty=1')
    expect(screen.getByRole('button', { name: 'Cart, 0 items' })).toBeInTheDocument() // Buy does not touch the cart
  })

  it('opens the sheet from a ?item=&action= link and cleans the URL', async () => {
    signedIn()
    renderPage('/shop?category=Bottoms&item=p04&action=cart')
    const sheet = await dialog()
    expect(within(sheet).getByRole('heading', { name: 'Straight Leg Jean' })).toBeInTheDocument()
    expect(urlSearch()).toBe('?category=Bottoms')
  })

  it('opens the sheet from a link for a guest too', async () => {
    renderPage('/shop?item=p04&action=cart')
    const sheet = await dialog()
    expect(within(sheet).getByRole('heading', { name: 'Straight Leg Jean' })).toBeInTheDocument()
    expect(urlSearch()).toBe('')
  })

  it('says so when the linked piece is gone or sold out, for anyone', async () => {
    const first = renderPage('/shop?item=nope&action=buy')
    expect(await screen.findByText('That piece is no longer in the catalogue.')).toBeInTheDocument()
    expect(urlSearch()).toBe('')
    first.unmount()

    renderPage('/shop?item=p24&action=cart')
    expect(await screen.findByText('Field Denim Jacket is sold out.')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('falls back to Add to cart for an unknown action', async () => {
    renderPage('/shop?item=p04&action=zzz')
    const sheet = await dialog()
    expect(within(sheet).getByRole('button', { name: 'Add to cart' })).toBeInTheDocument()
  })

  it('disables both buttons on a sold-out piece', async () => {
    signedIn()
    const user = userEvent.setup()
    renderPage('/shop?perPage=24')
    await loaded()
    const add = screen.getByRole('button', { name: 'Add Field Denim Jacket to cart, sold out' })
    expect(add).toHaveAttribute('aria-disabled', 'true')
    await user.click(add)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByRole('button', { name: 'Cart, 0 items' })).toBeInTheDocument()
  })
})

describe('ShopPage saved-only view', () => {
  it('shows only saved pieces when the navbar wishlist is pressed, and the heart count matches', async () => {
    seedWishlist(['p02', 'p05'])
    const user = userEvent.setup()
    renderPage()
    await loaded()
    expect(screen.getByRole('button', { name: 'Wishlist, 2 saved' })).toBeInTheDocument()
    expect(screen.getByText('Saved 2')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Wishlist, 2 saved' }))
    await waitFor(() => expect(cards()).toHaveLength(2))
    expect(screen.getByRole('heading', { level: 1, name: 'Saved pieces' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Save Fence-Line Blazer to wishlist' }))
    expect(screen.getByRole('button', { name: 'Wishlist, 1 saved' })).toBeInTheDocument()
    expect(screen.getByText('Saved 1')).toBeInTheDocument()
  })

  it('explains an empty saved list and leaves it with "Browse all pieces"', async () => {
    const user = userEvent.setup()
    renderPage('/shop?saved=1&sort=newest')
    expect(await screen.findByText('No saved pieces yet')).toBeInTheDocument()
    expect(screen.getByText('Tap the heart on any piece to save it here.')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Browse all pieces' }))
    expect(await loaded()).toHaveLength(12)
    expect(urlSearch()).toBe('?sort=newest') // only saved is cleared
    expect(screen.getByRole('heading', { level: 1, name: 'All pieces' })).toHaveFocus()
  })

  it('keeps focus on the results heading when a card is unsaved in the saved-only view', async () => {
    seedWishlist(['p02', 'p05'])
    const user = userEvent.setup()
    renderPage('/shop?saved=1')
    await waitFor(() => expect(cards()).toHaveLength(2))

    await user.click(screen.getByRole('button', { name: 'Save Fence-Line Blazer to wishlist' }))
    await waitFor(() => expect(cards()).toHaveLength(1))
    expect(screen.getByRole('heading', { level: 1, name: 'Saved pieces' })).toHaveFocus()
  })
})

describe('ShopPage filter panel and view', () => {
  it('opens as a dialog, closes on Escape and returns focus to the Filters button', async () => {
    const user = userEvent.setup()
    renderPage()
    await loaded()
    const open = screen.getByRole('button', { name: 'Filters' })
    await user.click(open)

    const dialog = await screen.findByRole('dialog', { name: 'Filters' })
    expect(within(dialog).getByRole('checkbox', { name: 'AR-ready pieces only' })).toBeInTheDocument()
    expect(within(dialog).getByRole('checkbox', { name: 'In store' })).toBeInTheDocument()
    expect(within(dialog).getByRole('checkbox', { name: /Indigo/ })).toBeInTheDocument()

    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(open).toHaveFocus()
    expect(urlSearch()).toBe('')
  })

  it('applies filters to the URL and results, shows the badge, and clears them', async () => {
    const user = userEvent.setup()
    renderPage('/shop?page=2')
    await loaded()
    await user.click(screen.getByRole('button', { name: 'Filters' }))
    const dialog = await screen.findByRole('dialog', { name: 'Filters' })

    await user.click(within(dialog).getByRole('checkbox', { name: 'AR-ready pieces only' }))
    await user.type(within(dialog).getByLabelText('Maximum'), '3000')
    await user.click(within(dialog).getByRole('button', { name: 'Apply' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(urlSearch()).toBe('?max=3000&ar=1')
    const expected = PRODUCTS.filter((p) => p.arReady && (p.salePrice ?? p.price) <= 3000)
    expect(cards()).toHaveLength(expected.length)
    expect(screen.getByRole('button', { name: /^Filters.*2 active$/ })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /^Filters/ }))
    const reopened = await screen.findByRole('dialog', { name: 'Filters' })
    expect(within(reopened).getByRole('checkbox', { name: 'AR-ready pieces only' })).toBeChecked()
    await user.click(within(reopened).getByRole('button', { name: 'Reset' }))
    await user.click(within(reopened).getByRole('button', { name: 'Apply' }))
    await waitFor(() => expect(urlSearch()).toBe(''))
    expect(cards()).toHaveLength(12)
  })

  it('blocks Apply when the minimum price is above the maximum', async () => {
    const user = userEvent.setup()
    renderPage()
    await loaded()
    await user.click(screen.getByRole('button', { name: 'Filters' }))
    const dialog = await screen.findByRole('dialog', { name: 'Filters' })
    await user.type(within(dialog).getByLabelText('Minimum'), '5000')
    await user.type(within(dialog).getByLabelText('Maximum'), '1000')
    expect(within(dialog).getByRole('alert')).toHaveTextContent(/minimum is higher/i)
    expect(within(dialog).getByRole('button', { name: 'Apply' })).toBeDisabled()
  })

  it('switches between grid and list view through the URL', async () => {
    const user = userEvent.setup()
    renderPage()
    await loaded()
    const grid = screen.getByRole('button', { name: 'Grid view' })
    const list = screen.getByRole('button', { name: 'List view' })
    expect(grid).toHaveAttribute('aria-pressed', 'true')

    await user.click(list)
    expect(list).toHaveAttribute('aria-pressed', 'true')
    expect(grid).toHaveAttribute('aria-pressed', 'false')
    expect(urlSearch()).toBe('?view=list')
    expect(cards()[0]).toHaveClass('flex', 'gap-4')

    await user.click(grid)
    expect(urlSearch()).toBe('')
  })
})
