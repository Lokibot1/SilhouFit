import { act, configure, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MotionGlobalConfig } from 'motion/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { ShopNavbar } from '../../src/components/ShopNavbar'
import { ToastProvider } from '../../src/components/toast/ToastProvider'
import { ThemeProvider } from '../../src/contexts/ThemeContext'
import type { Product } from '../../src/data/products'
import { invalidateShopColours } from '../../src/hooks/useShopColours'
import { clearProductCache } from '../../src/hooks/useProducts'
import { fetchProductList, ProductListError, type PaginatedProducts } from '../../src/service/fetchProductList'
import { fetchShopProduct, fetchShopProducts } from '../../src/service/fetchShopProducts'
import { clearSession } from '../../src/service/session'
import { ShopPage } from '../../src/views/public/ShopPage'

// The shop on the products API: the server filters and pages, so the page only asks and shows.
vi.mock('../../src/service/fetchShopProducts', () => ({ fetchShopProducts: vi.fn(), fetchShopProduct: vi.fn() }))
vi.mock('../../src/service/fetchProductList', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/service/fetchProductList')>()),
  fetchProductList: vi.fn(),
}))
const shop = vi.mocked(fetchShopProducts)
const detail = vi.mocked(fetchShopProduct)
const list = vi.mocked(fetchProductList)
const lastParams = () => shop.mock.calls.at(-1)![0]

const variant = (id: string, color: string, colorHex: string | null, size: string, price: number, stock: number) => ({
  id, sku: id, name: null, size, color, colorHex, price, stock, imageUrl: null, measurements: null,
})

/** A product as the API adapter returns it: real price and stock, and none of the fields the API does not have. */
const piece = (n: number, overrides: Partial<Product> = {}): Product => ({
  id: `00000000-0000-4000-8000-00000000000${n}`,
  slug: `piece-${n}`,
  name: `Piece ${n}`,
  category: 'Hoodie',
  boutique: 'Ayala Atelier',
  price: 1000 + n * 100,
  image: `/p${n}.webp`,
  alt: `Piece ${n} front`,
  colors: [{ name: 'Black', hex: '#111111' }, { name: 'Navy', hex: '#1b2a49' }],
  badges: [],
  stock: 10,
  channels: [],
  arReady: false,
  addedAt: '2026-05-05T08:00:00.000Z',
  rating: 0,
  reviews: 0,
  variants: [variant(`v${n}a`, 'Black', '#111111', 'S', 1000 + n * 100, 5), variant(`v${n}b`, 'Navy', '#1b2a49', 'M', 1000 + n * 100, 5)],
  ...overrides,
})

const answer = (products: Product[], total = products.length) => ({ products, total, page: 1, pageCount: Math.max(1, Math.ceil(total / 12)) })
const apiPage = (ids: string[]): PaginatedProducts => ({
  data: ids.map((id) => ({ id, name: id, slug: id, category: 'Hoodie', brand: null, minPrice: 1, maxPrice: 1, totalStock: 1, primaryImage: null, createdAt: '' })),
  meta: { total: ids.length, page: 1, limit: 100, totalPages: 1, hasNextPage: false, hasPreviousPage: false },
})

beforeAll(() => {
  configure({ asyncUtilTimeout: 5000 })
  MotionGlobalConfig.skipAnimations = true
  vi.stubGlobal('IntersectionObserver', class { observe() {} unobserve() {} disconnect() {} })
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} }))
  Element.prototype.scrollIntoView = vi.fn()
})

beforeEach(() => {
  vi.resetAllMocks()
  clearProductCache()
  invalidateShopColours()
  localStorage.clear()
  act(() => clearSession())
  shop.mockResolvedValue(answer([piece(1), piece(2), piece(3)]))
  list.mockResolvedValue(apiPage(['a', 'b']))
  detail.mockImplementation(async (id) => piece(Number(id.slice(-1)) || 1))
})
afterEach(() => {
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

function renderPage(url = '/shop') {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <ThemeProvider>
        <ToastProvider>
          <ShopNavbar />
          <Where />
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
const openFilters = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole('button', { name: /^Filters/ }))
  return screen.findByRole('dialog', { name: 'Filters' })
}

describe('ShopPage states', () => {
  it('shows the skeleton while loading, then the pieces with their real price and no rating, sale or badge', async () => {
    let resolve!: (value: ReturnType<typeof answer>) => void
    shop.mockReturnValueOnce(new Promise((r) => (resolve = r)))
    renderPage()
    expect(screen.getByRole('status', { name: 'Loading the catalogue' })).toBeInTheDocument()
    expect(cards()).toHaveLength(0)

    resolve(answer([piece(1), piece(2), piece(3)]))
    expect(await loaded()).toHaveLength(3)
    expect(screen.getByText('3 pieces')).toBeInTheDocument()
    expect(within(cards()[0]).getByText('Piece 1')).toBeInTheDocument()
    expect(screen.queryByText(/reviews?\)?$/)).toBeNull()
    expect(screen.queryByText(/% off|Sale|AR-ready/i)).toBeNull()
  })

  it('says there are no pieces yet when the database is empty, with a way home', async () => {
    shop.mockResolvedValue(answer([]))
    renderPage()
    expect(await screen.findByText('No pieces yet')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to home' })).toBeInTheDocument()
    expect(screen.queryByText('No pieces match your filters')).toBeNull()
  })

  it('explains a failed load and recovers on "Try again"', async () => {
    const user = userEvent.setup()
    shop.mockRejectedValueOnce(new ProductListError('network'))
    renderPage()
    expect(await screen.findByText('The catalogue did not load')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await loaded()).toHaveLength(3)
  })

  it('shows the empty state with Clear all when filters match nothing, and a retry when the request then fails', async () => {
    const user = userEvent.setup()
    shop.mockResolvedValue(answer([]))
    renderPage('/shop?brand=Zzz')
    expect(await screen.findByText('No pieces match your filters')).toBeInTheDocument()

    shop.mockRejectedValueOnce(new Error('down'))
    await user.click(screen.getByRole('button', { name: 'Clear search and filters' }))
    expect(await screen.findByText('The catalogue did not load')).toBeInTheDocument()
    shop.mockResolvedValue(answer([piece(1)]))
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(cards()).toHaveLength(1))
    expect(urlSearch()).toBe('')
  })
})

describe('ShopPage categories', () => {
  it('offers exactly the four categories, and an unknown API category adds no pill', async () => {
    shop.mockResolvedValue(answer([piece(1, { category: 'Hats' }), piece(2)]))
    renderPage()
    await loaded()
    const pills = within(screen.getByRole('group', { name: 'Filter by category' })).getAllByRole('button')
    expect(pills.map((b) => b.textContent)).toEqual(['All', 'Hoodie', 'Pants', 'Headwear', 'Shorts'])
  })
})

describe('ShopPage requests', () => {
  it('asks the server for the URL filters and one colour, newest first', async () => {
    renderPage('/shop?brand=Nike&gender=male&size=M&color=Black&min=0&max=900&category=Hoodie')
    await loaded()
    expect(lastParams()).toEqual({
      search: undefined,
      category: 'Hoodie',
      brand: 'Nike',
      gender: 'male',
      size: 'M',
      color: 'Black',
      minPrice: 0,
      maxPrice: 900,
      inStockOnly: undefined,
      sortBy: 'createdAt',
      sortOrder: 'desc',
      page: 1,
      limit: 12,
    })
  })

  it('keeps the availability and AR filters in the URL and as chips, and sends only Online (as inStockOnly)', async () => {
    renderPage('/shop?avail=store,online,low&ar=1')
    await loaded()
    const sent = lastParams()
    expect(sent.inStockOnly).toBe(true)
    for (const key of ['avail', 'availability', 'ar', 'arReady']) expect(sent).not.toHaveProperty(key)
    expect(screen.getByRole('button', { name: 'Remove availability In store, Online, Low stock' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remove AR AR-ready only' })).toBeInTheDocument()
    expect(urlSearch()).toBe('?avail=store,online,low&ar=1')
  })

  it('sends no stock filter and no ar key for the store, low stock and AR choices alone', async () => {
    renderPage('/shop?avail=store,low&ar=1')
    await loaded()
    expect(lastParams().inStockOnly).toBeUndefined()
    expect(Object.keys(lastParams())).not.toContain('ar')
  })

  it('keeps Featured and the price sorts, and asks for newest first for them; name sorts reach the API', async () => {
    const user = userEvent.setup()
    renderPage()
    await loaded()
    await user.click(screen.getByRole('combobox', { name: 'Sort by' }))
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Featured',
      'Newest',
      'Price: low to high',
      'Price: high to low',
      'Name: A to Z',
      'Name: Z to A',
    ])
    await user.click(screen.getByRole('option', { name: 'Price: high to low' }))
    expect(urlSearch()).toBe('?sort=price-desc')
    await waitFor(() => expect(lastParams()).toMatchObject({ sortBy: 'createdAt', sortOrder: 'desc' }))
    for (const [params] of shop.mock.calls) expect(params.sortBy).not.toBe('basePrice')

    await user.click(screen.getByRole('combobox', { name: 'Sort by' }))
    await user.click(screen.getByRole('option', { name: 'Name: Z to A' }))
    await waitFor(() => expect(lastParams()).toMatchObject({ sortBy: 'name', sortOrder: 'desc' }))
  })

  it('debounces typing into the search, resets the page, and sends the text', async () => {
    const user = userEvent.setup()
    renderPage('/shop?page=2')
    await loaded()
    await user.type(screen.getAllByRole('searchbox')[0], 'linen')
    await waitFor(() => expect(lastParams()).toMatchObject({ search: 'linen', page: 1 }))
    expect(urlSearch()).toContain('q=linen')
  })
})

describe('ShopPage filter dialog', () => {
  it('offers Availability and the AR-ready toggle, and writes them to the URL on Apply', async () => {
    const user = userEvent.setup()
    renderPage()
    await loaded()
    const dialog = await openFilters(user)
    for (const name of [/In store/, /Online/, /Low stock/, /AR-ready/]) expect(within(dialog).getByRole('checkbox', { name })).toBeInTheDocument()

    await user.click(within(dialog).getByRole('checkbox', { name: /Online/ }))
    await user.click(within(dialog).getByRole('checkbox', { name: /AR-ready/ }))
    await user.click(within(dialog).getByRole('button', { name: 'Apply' }))
    expect(urlSearch()).toBe('?avail=online&ar=1')
    await waitFor(() => expect(lastParams().inStockOnly).toBe(true))
    expect(screen.getByRole('button', { name: /^Filters/ })).toHaveTextContent('2')
  })

  it('removes the availability and AR chips one by one, and Clear all clears the rest', async () => {
    const user = userEvent.setup()
    renderPage('/shop?avail=online&ar=1&brand=Nike')
    await loaded()
    await user.click(screen.getByRole('button', { name: 'Remove AR AR-ready only' }))
    expect(urlSearch()).toBe('?avail=online&brand=Nike')
    await user.click(screen.getByRole('button', { name: 'Remove availability Online' }))
    expect(urlSearch()).toBe('?brand=Nike')
    await user.click(screen.getByRole('button', { name: 'Clear all' }))
    expect(urlSearch()).toBe('')
  })

  it('lists the colours of the real products once each, with a swatch, and sends the chosen one', async () => {
    const user = userEvent.setup()
    detail.mockImplementation(async (id) =>
      id === 'a'
        ? piece(1, { variants: [variant('x1', 'Black', '#111111', 'S', 1, 1), variant('x2', 'Navy', null, 'M', 1, 1)] })
        : piece(2, { variants: [variant('x3', 'black', null, 'S', 1, 1), variant('x4', 'Navy', '#1b2a49', 'S', 1, 1), variant('x5', 'Sand', '#d8c3a5', 'S', 1, 1)] }),
    )
    renderPage()
    await loaded()
    const dialog = await openFilters(user)
    await within(dialog).findByRole('button', { name: 'Sand' })
    const colourNames = ['Black', 'Navy', 'Sand']
    const names = within(dialog).getAllByRole('button').map((b) => b.textContent ?? '')
    expect(names.filter((n) => colourNames.includes(n))).toEqual(colourNames)
    expect(within(dialog).getAllByRole('button', { name: /^(Black|black)$/ })).toHaveLength(1)

    await user.click(within(dialog).getByRole('button', { name: 'Navy' }))
    await user.click(within(dialog).getByRole('button', { name: 'Apply' }))
    expect(urlSearch()).toBe('?color=Navy')
    await waitFor(() => expect(lastParams()).toMatchObject({ color: 'Navy' }))
  })

  it('hides the Colour section when no product has a colour, or the colours cannot be read', async () => {
    const user = userEvent.setup()
    detail.mockImplementation(async () => piece(1, { variants: [] }))
    const first = renderPage()
    await loaded()
    let dialog = await openFilters(user)
    await waitFor(() => expect(within(dialog).queryByTestId('colour-skeleton')).toBeNull())
    expect(within(dialog).queryByText('Colour')).toBeNull()
    first.unmount()

    invalidateShopColours()
    list.mockRejectedValue(new ProductListError('network'))
    renderPage()
    await loaded()
    dialog = await openFilters(user)
    await waitFor(() => expect(within(dialog).queryByTestId('colour-skeleton')).toBeNull())
    expect(within(dialog).queryByText('Colour')).toBeNull()
    expect(within(dialog).getByRole('button', { name: 'Apply' })).toBeEnabled()
  })

  it('drops a URL colour that no product has when the filters are applied', async () => {
    const user = userEvent.setup()
    renderPage('/shop?color=Chartreuse')
    await loaded()
    const dialog = await openFilters(user)
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Black' })).toBeInTheDocument())
    await user.click(within(dialog).getByRole('button', { name: 'Apply' }))
    expect(urlSearch()).toBe('')
  })

  it('blocks Apply when the minimum price is above the maximum', async () => {
    const user = userEvent.setup()
    renderPage()
    await loaded()
    const dialog = await openFilters(user)
    await user.type(within(dialog).getByRole('textbox', { name: 'Minimum' }), '900')
    await user.type(within(dialog).getByRole('textbox', { name: 'Maximum' }), '100')
    expect(within(dialog).getByRole('alert')).toHaveTextContent('The minimum is higher than the maximum')
    expect(within(dialog).getByRole('button', { name: 'Apply' })).toBeDisabled()
  })
})

describe('ShopPage cards and cart', () => {
  it('toggles a wishlist heart and persists it', async () => {
    const user = userEvent.setup()
    renderPage()
    await loaded()
    const heart = screen.getByRole('button', { name: 'Save Piece 1 to wishlist' })
    await user.click(heart)
    expect(heart).toHaveAttribute('aria-pressed', 'true')
    expect(JSON.parse(localStorage.getItem('silhoufit-wishlist') ?? '[]')).toContain(piece(1).id)
  })

  it('loads the piece, then opens the sheet with the sizes and colours its variants have', async () => {
    const user = userEvent.setup()
    detail.mockResolvedValue(piece(1))
    renderPage()
    await loaded()
    await user.click(screen.getByRole('button', { name: 'Add Piece 1 to cart' }))
    const sheet = await screen.findByRole('dialog', { name: 'Choose options' })
    expect(within(sheet).getByRole('radio', { name: 'S' })).toBeInTheDocument()
    expect(within(sheet).queryByRole('radio', { name: 'XL' })).toBeNull()

    await user.click(within(sheet).getByRole('radio', { name: 'M' }))
    await user.click(within(sheet).getByRole('radio', { name: 'Navy' }))
    await user.click(within(sheet).getByRole('button', { name: 'Add to cart' }))
    expect(await screen.findByText('Added to cart: Piece 1, M, Navy × 1')).toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem('silhoufit-cart') ?? '[]')).toEqual([{ variantId: 'v1b', productId: piece(1).id, qty: 1 }])
  })

  it('takes Buy now from the sheet to checkout with the chosen specs', async () => {
    const user = userEvent.setup()
    detail.mockResolvedValue(piece(1))
    renderPage()
    await loaded()
    await user.click(screen.getByRole('button', { name: 'Buy Piece 1' }))
    const sheet = await screen.findByRole('dialog', { name: 'Choose options' })
    await user.click(within(sheet).getByRole('radio', { name: 'S' }))
    await user.click(within(sheet).getByRole('radio', { name: 'Black' }))
    await user.click(within(sheet).getByRole('button', { name: 'Buy now' }))
    expect(screen.getByTestId('path').textContent).toBe('/checkout')
    expect(urlSearch()).toBe(`?item=${piece(1).id}&variant=v1a&qty=1`)
  })

  it('disables both buttons on a sold-out piece', async () => {
    const user = userEvent.setup()
    shop.mockResolvedValue(answer([piece(1, { stock: 0 })]))
    renderPage()
    await loaded()
    const add = screen.getByRole('button', { name: 'Add Piece 1 to cart, sold out' })
    expect(add).toHaveAttribute('aria-disabled', 'true')
    await user.click(add)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('says so when a linked piece is gone, and cleans the URL', async () => {
    detail.mockRejectedValue(new ProductListError('not-found'))
    renderPage('/shop?item=nope&action=buy')
    expect(await screen.findByText('That piece is no longer in the catalogue.')).toBeInTheDocument()
    expect(urlSearch()).toBe('')
  })
})
