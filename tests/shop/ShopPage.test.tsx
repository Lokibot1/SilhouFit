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
import { fetchProductFilters } from '../../src/service/fetchProductFilters'
import { ProductListError } from '../../src/service/fetchProductList'
import { fetchShopProduct, fetchShopProducts } from '../../src/service/fetchShopProducts'
import { clearSession } from '../../src/service/session'
import { ShopPage } from '../../src/views/public/ShopPage'

// The shop on the products API: the server filters and pages, so the page only asks and shows.
vi.mock('../../src/service/fetchShopProducts', () => ({ fetchShopProducts: vi.fn(), fetchShopProduct: vi.fn() }))
vi.mock('../../src/service/fetchProductFilters', () => ({ fetchProductFilters: vi.fn() }))
const shop = vi.mocked(fetchShopProducts)
const detail = vi.mocked(fetchShopProduct)
const filters = vi.mocked(fetchProductFilters)
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
const facets = {
  categories: [{ name: 'Hoodie', count: 4 }, { name: 'pants', count: 1 }],
  brands: ['Ayala Atelier'],
  sizes: ['L', 'M', 'S', 'XS'],
  colors: [{ name: 'Black', hex: '#111111' }, { name: 'Navy', hex: '#1b2a49' }, { name: 'Sand', hex: '#d8c3a5' }],
  minPrice: 1200,
  maxPrice: 2600,
}

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
  filters.mockResolvedValue(facets)
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
    expect(pills.map((b) => b.textContent?.replace(/, \d+ pieces?\d+$/, ''))).toEqual(['All', 'Hoodie', 'Pants', 'Headwear', 'Shorts'])
  })

  it('shows each category count (matched ignoring case) and the total on All, in the accessible names', async () => {
    renderPage()
    await loaded()
    const group = screen.getByRole('group', { name: 'Filter by category' })
    expect(await within(group).findByRole('button', { name: 'All, 5 pieces' })).toBeInTheDocument()
    expect(within(group).getByRole('button', { name: 'Hoodie, 4 pieces' })).toHaveTextContent('Hoodie, 4 pieces4')
    expect(within(group).getByRole('button', { name: 'Pants, 1 piece' })).toBeInTheDocument()
    expect(within(group).getByRole('button', { name: 'Shorts, 0 pieces' })).toBeInTheDocument()
  })

  it('shows the counts in the Filters dialog too', async () => {
    const user = userEvent.setup()
    renderPage()
    await loaded()
    const dialog = await openFilters(user)
    expect(await within(dialog).findByRole('button', { name: 'Hoodie, 4 pieces' })).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'All, 5 pieces' })).toBeInTheDocument()
  })

  it('shows plain names with no counts when the filter options cannot be read', async () => {
    filters.mockRejectedValue(new ProductListError('network'))
    renderPage()
    await loaded()
    const group = screen.getByRole('group', { name: 'Filter by category' })
    await waitFor(() => expect(filters).toHaveBeenCalled())
    expect(within(group).getAllByRole('button').map((b) => b.textContent)).toEqual(['All', 'Hoodie', 'Pants', 'Headwear', 'Shorts'])
    expect(within(group).getByRole('button', { name: 'Hoodie' })).toBeInTheDocument()
  })
})

describe('ShopPage requests', () => {
  it('asks the server for the URL filters, sizes and colours, newest first', async () => {
    renderPage('/shop?brand=Nike&gender=male&size=M&size=L&color=Black&color=Navy&min=0&max=900&category=Hoodie')
    await loaded()
    expect(lastParams()).toEqual({
      search: undefined,
      category: 'Hoodie',
      brand: 'Nike',
      gender: 'male',
      sizes: ['M', 'L'],
      colors: ['Black', 'Navy'],
      minPrice: 0,
      maxPrice: 900,
      sortBy: 'createdAt',
      sortOrder: 'desc',
      page: 1,
      limit: 12,
    })
  })

  it('keeps the AR filter in the URL and as a chip, and sends AR-ready only (as isArReady)', async () => {
    renderPage('/shop?ar=1')
    await loaded()
    const sent = lastParams()
    expect(sent.isArReady).toBe(true)
    for (const key of ['avail', 'availability', 'inStockOnly', 'ar', 'arReady']) expect(sent).not.toHaveProperty(key)
    expect(screen.getByRole('button', { name: 'Remove AR AR-ready only' })).toBeInTheDocument()
    expect(urlSearch()).toBe('?ar=1')
  })

  it('sends no isArReady until AR-ready only is on', async () => {
    renderPage('/shop')
    await loaded()
    expect(lastParams()).not.toHaveProperty('isArReady', true)
    expect(lastParams().isArReady).toBeUndefined()
  })

  it('ignores an old avail link, and sends no stock filter and no ar key', async () => {
    renderPage('/shop?avail=low&ar=1')
    await loaded()
    expect(lastParams()).not.toHaveProperty('inStockOnly')
    expect(Object.keys(lastParams())).not.toContain('ar')
    expect(screen.queryByRole('button', { name: /^Remove availability/ })).not.toBeInTheDocument()
  })

  it('sends the price sorts as sortBy=price with their direction, newest first for Featured, and name sorts reach the API', async () => {
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
      'Low stock first',
    ])
    await user.click(screen.getByRole('option', { name: 'Price: high to low' }))
    expect(urlSearch()).toBe('?sort=price-desc')
    await waitFor(() => expect(lastParams()).toMatchObject({ sortBy: 'price', sortOrder: 'desc' }))
    for (const [params] of shop.mock.calls) expect(params.sortBy).not.toBe('basePrice')

    await user.click(screen.getByRole('combobox', { name: 'Sort by' }))
    await user.click(screen.getByRole('option', { name: 'Price: low to high' }))
    await waitFor(() => expect(lastParams()).toMatchObject({ sortBy: 'price', sortOrder: 'asc' }))

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
  it('has no Availability section, and writes the AR-ready toggle to the URL on Apply', async () => {
    const user = userEvent.setup()
    renderPage()
    await loaded()
    const dialog = await openFilters(user)
    expect(within(dialog).queryByText('Availability')).not.toBeInTheDocument()
    await user.click(within(dialog).getByRole('checkbox', { name: /AR-ready/ }))
    await user.click(within(dialog).getByRole('button', { name: 'Apply' }))
    expect(urlSearch()).toBe('?ar=1')
    await waitFor(() => expect(lastParams().isArReady).toBe(true))
    expect(screen.getByRole('button', { name: /^Filters/ })).toHaveTextContent('1')
  })

  it('removes the AR chip, and Clear all clears the rest', async () => {
    const user = userEvent.setup()
    renderPage('/shop?ar=1&brand=Nike')
    await loaded()
    expect(lastParams().isArReady).toBe(true)
    await user.click(screen.getByRole('button', { name: 'Remove AR AR-ready only' }))
    expect(urlSearch()).toBe('?brand=Nike')
    await waitFor(() => expect(lastParams().isArReady).toBeUndefined())
    await user.click(screen.getByRole('button', { name: 'Clear all' }))
    expect(urlSearch()).toBe('')
  })

  it('lists the colours from the filters once each, with a swatch, and sends the chosen one', async () => {
    const user = userEvent.setup()
    renderPage()
    await loaded()
    const dialog = await openFilters(user)
    await within(dialog).findByRole('button', { name: 'Sand' })
    const colourNames = ['Black', 'Navy', 'Sand']
    const names = within(dialog).getAllByRole('button').map((b) => b.textContent ?? '')
    expect(names.filter((n) => colourNames.includes(n))).toEqual(colourNames)
    expect(within(dialog).getAllByRole('button', { name: 'Black' })).toHaveLength(1)
    expect(within(dialog).getByRole('button', { name: 'Navy' }).firstElementChild).toHaveStyle({ backgroundColor: '#1b2a49' })

    await user.click(within(dialog).getByRole('button', { name: 'Navy' }))
    await user.click(within(dialog).getByRole('button', { name: 'Apply' }))
    expect(urlSearch()).toBe('?color=Navy')
    await waitFor(() => expect(lastParams()).toMatchObject({ colors: ['Navy'] }))
    expect(lastParams()).not.toHaveProperty('color')
  })

  it('still reads an old single-value URL, and keeps several values when the shopper ticks them', async () => {
    const user = userEvent.setup()
    renderPage('/shop?size=M&color=Black')
    await loaded()
    expect(lastParams()).toMatchObject({ sizes: ['M'], colors: ['Black'] })
    expect(lastParams()).not.toHaveProperty('size')
    expect(lastParams()).not.toHaveProperty('color')

    const dialog = await openFilters(user)
    await within(dialog).findByRole('button', { name: 'Sand' })
    await user.click(within(dialog).getByRole('button', { name: 'L' }))
    await user.click(within(dialog).getByRole('button', { name: 'Navy' }))
    expect(within(dialog).getByRole('button', { name: 'M' })).toHaveAttribute('aria-pressed', 'true')
    await user.click(within(dialog).getByRole('button', { name: 'Apply' }))
    expect(urlSearch()).toBe('?color=Black&color=Navy&size=M&size=L')
    await waitFor(() => expect(lastParams()).toMatchObject({ sizes: ['M', 'L'], colors: ['Black', 'Navy'] }))

    await user.click(screen.getByRole('button', { name: 'Remove size M' }))
    expect(urlSearch()).toBe('?color=Black&color=Navy&size=L')
    await waitFor(() => expect(lastParams()).toMatchObject({ sizes: ['L'], colors: ['Black', 'Navy'] }))
    await user.click(screen.getByRole('button', { name: 'Remove colour Black' }))
    expect(urlSearch()).toBe('?size=L&color=Navy')
  })

  it('hides the Colour section when there are no colours, or the filters cannot be read, and Apply still works', async () => {
    const user = userEvent.setup()
    filters.mockResolvedValue({ ...facets, colors: [] })
    const first = renderPage()
    await loaded()
    let dialog = await openFilters(user)
    await waitFor(() => expect(within(dialog).queryByTestId('colour-skeleton')).toBeNull())
    expect(within(dialog).queryByText('Colour')).toBeNull()
    first.unmount()

    invalidateShopColours()
    filters.mockRejectedValue(new ProductListError('network'))
    renderPage()
    await loaded()
    dialog = await openFilters(user)
    await waitFor(() => expect(within(dialog).queryByTestId('colour-skeleton')).toBeNull())
    expect(within(dialog).queryByText('Colour')).toBeNull()
    // Without the facets the usual sizes and the plain price hints stay.
    expect(within(dialog).getByRole('button', { name: 'XXL' })).toBeInTheDocument()
    expect(within(dialog).getByRole('textbox', { name: 'Maximum' })).toHaveAttribute('placeholder', 'Any')
    expect(within(dialog).getByRole('button', { name: 'Apply' })).toBeEnabled()
  })

  it('offers the sizes in order, the brands as suggestions and the price range as hints, from the same one request', async () => {
    const user = userEvent.setup()
    renderPage()
    await loaded()
    const dialog = await openFilters(user)
    await within(dialog).findByRole('button', { name: 'Sand' })
    const sizes = ['XS', 'S', 'M', 'L'].map((name) => within(dialog).getByRole('button', { name }))
    expect(sizes.every((chip, i) => i === 0 || sizes[i - 1].compareDocumentPosition(chip) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true)
    expect(within(dialog).queryByRole('button', { name: 'XXL' })).toBeNull()
    expect(dialog.querySelector('datalist#shop-brand-options option')).toHaveValue('Ayala Atelier')
    expect(within(dialog).getByRole('textbox', { name: 'Minimum' })).toHaveAttribute('placeholder', '1200')
    expect(within(dialog).getByRole('textbox', { name: 'Maximum' })).toHaveAttribute('placeholder', '2600')
    expect(filters).toHaveBeenCalledTimes(1)
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
