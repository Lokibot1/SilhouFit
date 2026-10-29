import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MotionGlobalConfig } from 'motion/react'
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../../src/components/toast/ToastProvider'
import { InventoryColgroup, rememberShowAlerts } from '../../src/components/staff/inventory/layout'
import { needsAlert, rowTint, StockBadge } from '../../src/components/staff/inventory/InventoryParts'
import { addVariant, deleteProduct, deleteVariant, setProductActive, updateProduct, updateStocks, updateVariant } from '../../src/service/productAdmin'
import {
  fetchProductById,
  fetchProductDetail,
  fetchProductList,
  ProductListError,
  type PaginatedProducts,
  type ProductListItem,
} from '../../src/service/fetchProductList'
import { fetchProductFilters } from '../../src/service/fetchProductFilters'
import { invalidateShopColours } from '../../src/hooks/useShopColours'
import { StaffInventoryPage } from '../../src/views/staff/StaffInventoryPage'

vi.mock('../../src/service/fetchProductList', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/service/fetchProductList')>()),
  fetchProductList: vi.fn(),
  fetchProductById: vi.fn(),
  fetchProductDetail: vi.fn(),
}))

vi.mock('../../src/service/productAdmin')
vi.mock('../../src/service/fetchProductFilters')

const list = vi.mocked(fetchProductList)
const byId = vi.mocked(fetchProductById)
const detail = vi.mocked(fetchProductDetail)
const filters = vi.mocked(fetchProductFilters)

const product = (n: number, overrides: Partial<ProductListItem> = {}): ProductListItem => ({
  id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
  name: `Tee ${n}`,
  category: 'Hoodie',
  brand: 'Silhou',
  minPrice: 1000,
  maxPrice: 1000,
  totalStock: 20,
  primaryImage: null,
  createdAt: '2026-01-05T00:00:00.000Z',
  ...overrides,
})

const answer = (items: ProductListItem[], total = items.length, page = 1, limit = 25): PaginatedProducts => ({
  data: items,
  meta: { total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)), hasNextPage: false, hasPreviousPage: page > 1 },
})

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => (resolve = r))
  return { promise, resolve }
}

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true
  Element.prototype.scrollIntoView = vi.fn()
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} }))
})

beforeEach(() => {
  rememberShowAlerts(true)
  vi.resetAllMocks()
  invalidateShopColours()
  // Without facets the panel falls back to the usual sizes and plain text fields.
  filters.mockRejectedValue(new ProductListError('network'))
  list.mockResolvedValue(answer([product(1), product(2)]))
  detail.mockResolvedValue({ variants: [{ id: 'v1', sku: 'TEE-1-S-BLK', size: 'S', color: 'Black', stock: 3, price: 1000, name: null, colorHex: null, imageUrl: null, measurements: null }] })
})

function Where() {
  const { pathname, search } = useLocation()
  const navigate = useNavigate()
  return (
    <>
      <p data-testid="where">{pathname + search}</p>
      <button type="button" onClick={() => navigate('?q=jean')}>
        go jean
      </button>
      <button type="button" onClick={() => navigate(-1)}>
        go back
      </button>
    </>
  )
}

function renderPage(search = '') {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={[`/staff/inventory${search}`]}>
        <Where />
        <Routes>
          <Route path="staff/inventory" element={<StaffInventoryPage />} />
        </Routes>
      </MemoryRouter>
    </ToastProvider>,
  )
}

const where = () => screen.getByTestId('where').textContent ?? ''
const table = () => screen.getByRole('table')
const lastParams = () => list.mock.calls.at(-1)![0]

async function choose(user: ReturnType<typeof userEvent.setup>, combobox: string, option: string) {
  await user.click(screen.getByRole('combobox', { name: combobox }))
  await user.click(await screen.findByRole('option', { name: option }))
}

describe('StaffInventoryPage', () => {
  it('offers exactly the four categories in the Category filter', async () => {
    const user = userEvent.setup()
    renderPage()
    await within(await screen.findByRole('table')).findByRole('button', { name: /^Tee 1/ })
    await user.click(screen.getByRole('combobox', { name: 'Category' }))
    const options = (await screen.findAllByRole('option')).map((o) => o.textContent)
    expect(options).toEqual(['All categories', 'Hoodie', 'Pants', 'Headwear', 'Shorts'])
  })

  it('keeps the Gender, Stock and AR Fitting filters, and sends only what the API accepts', async () => {
    renderPage('?gender=male&ar=yes&stock=out&sort=name')
    await within(await screen.findByRole('table')).findByRole('button', { name: /^Tee 1/ })
    // The API has no AR flag, so the AR column shows a dash and the AR filter is kept but sends nothing.
    expect(within(table()).getByRole('columnheader', { name: 'AR Fitting' })).toBeInTheDocument()
    expect(screen.queryByText(/AR ready/)).not.toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Gender' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'AR Fitting' })).toBeInTheDocument()
    expect(screen.getByText('Filters (3)')).toBeInTheDocument()
    expect(lastParams()).toMatchObject({ gender: 'male' })
    for (const [params] of list.mock.calls) {
      expect(params).not.toHaveProperty('arReady')
      expect(params).not.toHaveProperty('ar')
      expect(params).not.toHaveProperty('outOfStockOnly')
      expect(params).not.toHaveProperty('sizesOutOnly')
      expect(params.inStockOnly).toBeUndefined()
    }
    await userEvent.click(screen.getByRole('combobox', { name: 'Stock' }))
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['All stock levels', 'In stock', 'Out of stock', 'Has out-of-stock sizes'])
  })

  it('shows skeleton rows while loading, then the products and their count', async () => {
    const pending = deferred<PaginatedProducts>()
    list.mockReturnValue(pending.promise)
    renderPage()
    expect(screen.getByText('Loading products')).toBeInTheDocument()
    expect(table()).toHaveAttribute('aria-busy', 'true')
    // The header row, then one skeleton row per page-size slot.
    expect(within(table()).getAllByRole('row')).toHaveLength(26)

    pending.resolve(answer([product(1), product(2)]))
    expect(await within(table()).findByRole('button', { name: /Tee 1/ })).toBeInTheDocument()
    expect(table()).toHaveAttribute('aria-busy', 'false')
    expect(screen.getByRole('heading', { level: 1, name: 'Inventory' })).toBeInTheDocument()
    expect(screen.getByText('Active products, as the shop lists them.')).toBeInTheDocument()
    expect(screen.getByText('2').closest('p')).toHaveTextContent('2 products')
  })

  it.each([
    [true, 8, 'the Stock alert column'],
    [false, 7, 'no Stock alert column'],
  ])('draws the skeleton with %s columns (%i) when the last table had %s', async (showAlerts, columns) => {
    rememberShowAlerts(showAlerts)
    list.mockReturnValue(deferred<PaginatedProducts>().promise)
    renderPage('?per=25')
    expect(within(table()).getAllByRole('columnheader')).toHaveLength(columns)
    const body = within(table()).getAllByRole('row').slice(1)
    expect(body).toHaveLength(25)
    body.forEach((row) => expect(row.querySelectorAll('td')).toHaveLength(columns))
  })

  it('remembers whether the loaded table had the Stock alert column for the next skeleton', async () => {
    list.mockResolvedValue(answer([{ ...product(1), totalStock: 50 }]))
    const first = renderPage()
    await within(table()).findByRole('button', { name: /Tee 1/ })
    first.unmount()
    list.mockReturnValue(deferred<PaginatedProducts>().promise)
    renderPage()
    expect(within(table()).getAllByRole('columnheader')).toHaveLength(7)
  })

  it('names why loading failed and retries', async () => {
    list.mockRejectedValueOnce(new ProductListError('network'))
    renderPage()
    expect(await screen.findByRole('alert')).toHaveTextContent("We couldn't load the products.")
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await within(table()).findByRole('button', { name: /Tee 1/ })).toBeInTheDocument()
    expect(list).toHaveBeenCalledTimes(2)
  })

  it('tells an empty catalogue from a search with no matches', async () => {
    list.mockResolvedValue(answer([]))
    const { unmount } = renderPage()
    expect(await screen.findByText('No products yet')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Clear all' })).not.toBeInTheDocument()
    unmount()

    renderPage('?q=zzz')
    expect(await screen.findByText('No products match')).toBeInTheDocument()
    expect(screen.getByText(/clear the search and filters and try again/)).toBeInTheDocument()
    await userEvent.click(screen.getAllByRole('button', { name: 'Clear all' }).at(-1)!)
    expect(where()).toBe('/staff/inventory')
    expect(screen.getByRole('textbox', { name: /Search products/ })).toHaveValue('')
  })

  it('sorts from a header: ascending, then descending, in the URL and the request', async () => {
    const user = userEvent.setup()
    renderPage()
    await within(table()).findByRole('button', { name: /Tee 1/ })
    const name = within(table()).getByRole('columnheader', { name: 'Product' })
    expect(name).not.toHaveAttribute('aria-sort')

    await user.click(within(name).getByRole('button'))
    expect(where()).toContain('sort=name')
    expect(where()).toContain('dir=asc')
    await waitFor(() => expect(name).toHaveAttribute('aria-sort', 'ascending'))
    expect(lastParams()).toMatchObject({ sortBy: 'name', sortOrder: 'asc' })

    await user.click(within(name).getByRole('button'))
    await waitFor(() => expect(name).toHaveAttribute('aria-sort', 'descending'))
    expect(where()).toContain('dir=desc')
    expect(lastParams()).toMatchObject({ sortBy: 'name', sortOrder: 'desc' })
  })

  it('keeps the price sort, but the API is asked for the default order and never for basePrice', async () => {
    const user = userEvent.setup()
    renderPage('?sort=price&dir=asc')
    await within(table()).findByRole('button', { name: /Tee 1/ })
    const price = within(table()).getByRole('columnheader', { name: 'Price' })
    expect(within(price).getByRole('button')).toBeInTheDocument()
    expect(price).toHaveAttribute('aria-sort', 'ascending')
    expect(where()).toContain('sort=price')
    expect(lastParams()).toMatchObject({ sortBy: 'createdAt', sortOrder: 'desc' })
    await user.click(screen.getByRole('combobox', { name: 'Sort by' }))
    expect(screen.getByRole('option', { name: 'Price: low to high' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Price: high to low' })).toBeInTheDocument()
    for (const [params] of list.mock.calls) expect(params.sortBy).not.toBe('basePrice')
  })

  it('shows the range of the page, and a page size change goes back to page 1', async () => {
    const user = userEvent.setup()
    list.mockResolvedValue(answer([product(26)], 60, 2))
    renderPage('?page=2')
    expect(await screen.findByText('Displaying 26–50 of 60')).toBeInTheDocument()
    expect(lastParams()).toMatchObject({ page: 2, limit: 25 })

    await choose(user, 'Rows per page', '10 per page')
    expect(where()).toBe('/staff/inventory?per=10')
    await waitFor(() => expect(lastParams()).toMatchObject({ page: 1, limit: 10 }))
  })

  it('pages with the pagination buttons and keeps the sort', async () => {
    const user = userEvent.setup()
    list.mockResolvedValue(answer([product(1)], 60))
    renderPage('?sort=name')
    await screen.findByText('Displaying 1–25 of 60')
    await user.click(screen.getByRole('button', { name: 'Next' }))
    expect(where()).toBe('/staff/inventory?sort=name&page=2')
  })

  it('sends one request for a search, 300ms after typing stops, and writes it to the URL', async () => {
    const user = userEvent.setup()
    renderPage()
    await within(table()).findByRole('button', { name: /Tee 1/ })
    expect(list).toHaveBeenCalledTimes(1)

    await user.type(screen.getByRole('textbox', { name: /Search products/ }), 'tee')
    expect(list).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(where()).toBe('/staff/inventory?q=tee'))
    expect(list).toHaveBeenCalledTimes(2)
    expect(lastParams()).toMatchObject({ search: 'tee', page: 1 })
  })

  it('puts the URL search back in the box on back and forward', async () => {
    const user = userEvent.setup()
    renderPage('?q=tee')
    const box = screen.getByRole('textbox', { name: /Search products/ })
    expect(box).toHaveValue('tee')
    await user.click(screen.getByRole('button', { name: 'go jean' }))
    await waitFor(() => expect(box).toHaveValue('jean'))
    await user.click(screen.getByRole('button', { name: 'go back' }))
    await waitFor(() => expect(box).toHaveValue('tee'))
    expect(lastParams()).toMatchObject({ search: 'tee' })
  })

  it('looks up a pasted full product ID by its own endpoint', async () => {
    const found = product(7)
    byId.mockResolvedValue(found)
    renderPage(`?q=${found.id}`)
    expect(await within(table()).findByRole('button', { name: /Tee 7/ })).toBeInTheDocument()
    expect(byId).toHaveBeenCalledWith(found.id, expect.anything())
    expect(list).not.toHaveBeenCalled()

    byId.mockRejectedValue(new ProductListError('not-found'))
    const { unmount } = renderPage(`?q=${product(8).id}`)
    expect((await screen.findAllByText('No products match')).length).toBeGreaterThan(0)
    unmount()
  })

  it('filters by category and stock, and clears them together', async () => {
    const user = userEvent.setup()
    renderPage('?sort=name')
    await within(table()).findByRole('button', { name: /Tee 1/ })

    await choose(user, 'Category', 'Hoodie')
    await waitFor(() => expect(lastParams()).toMatchObject({ category: 'Hoodie' }))
    await choose(user, 'Stock', 'In stock')
    await waitFor(() => expect(lastParams()).toMatchObject({ inStockOnly: true }))
    expect(where()).toBe('/staff/inventory?sort=name&category=Hoodie&stock=in')
    expect(screen.getByText('Filters (2)')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Clear all' }))
    expect(where()).toBe('/staff/inventory?sort=name')
    await waitFor(() => expect(lastParams().category).toBeUndefined())
    expect(lastParams().inStockOnly).toBeUndefined()
    expect(screen.queryByRole('button', { name: 'Clear all' })).not.toBeInTheDocument()
  })

  it('keeps the previous rows, dimmed, while the next request loads', async () => {
    const user = userEvent.setup()
    renderPage()
    await within(table()).findByRole('button', { name: /Tee 1/ })
    const next = deferred<PaginatedProducts>()
    list.mockReturnValue(next.promise)

    await choose(user, 'Stock', 'In stock')
    expect(within(table()).getByRole('button', { name: /Tee 1/ })).toBeInTheDocument()
    expect(table()).toHaveAttribute('aria-busy', 'true')
    expect(table().querySelector('tbody')).toHaveClass('opacity-60')

    next.resolve(answer([product(3)]))
    expect(await within(table()).findByRole('button', { name: /Tee 3/ })).toBeInTheDocument()
    expect(table().querySelector('tbody')).not.toHaveClass('opacity-60')
  })

  it('keeps the rows and count with a retry when a later request fails, and retries those params', async () => {
    const user = userEvent.setup()
    list.mockResolvedValue(answer([product(1)], 60))
    renderPage()
    await within(table()).findByRole('button', { name: /Tee 1/ })
    list.mockRejectedValueOnce(new ProductListError('network'))
    await choose(user, 'Stock', 'In stock')
    expect(await screen.findByRole('alert')).toHaveTextContent("We couldn't load the latest products.")
    expect(within(table()).getByRole('button', { name: /Tee 1/ })).toBeInTheDocument()
    expect(screen.getByText('60').closest('p')).toHaveTextContent('60 matching products')
    const failed = lastParams()
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
    expect(lastParams()).toEqual(failed)
    expect(list).toHaveBeenCalledTimes(3)
  })

  it('keeps focus in the pager when Next is disabled on the last page, and scrolls the list into view', async () => {
    const user = userEvent.setup()
    list.mockResolvedValue(answer([product(26)], 60, 2))
    renderPage('?page=2')
    await screen.findByText('Displaying 26–50 of 60')
    const section = screen.getByRole('region', { name: 'Products' })
    vi.spyOn(section, 'getBoundingClientRect').mockReturnValue({ top: -200 } as DOMRect)
    const next = screen.getByRole('button', { name: 'Next' })
    next.focus()
    await user.keyboard('{Enter}')
    await waitFor(() => expect(next).toBeDisabled())
    expect(screen.getByRole('button', { name: 'Page 3' })).toHaveFocus()
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({ block: 'start', behavior: 'smooth' })
  })

  it('does not scroll on a filter change', async () => {
    const user = userEvent.setup()
    renderPage()
    await within(table()).findByRole('button', { name: /Tee 1/ })
    await choose(user, 'Stock', 'In stock')
    await waitFor(() => expect(lastParams()).toMatchObject({ inStockOnly: true }))
    // The dropdown scrolls its own options; the list itself must not move.
    expect(Element.prototype.scrollIntoView).not.toHaveBeenCalledWith({ block: 'start', behavior: 'smooth' })
    expect(Element.prototype.scrollIntoView).not.toHaveBeenCalledWith({ block: 'start', behavior: 'auto' })
  })

  it('opens a product in a drawer with its variants, closes on Escape and returns focus', async () => {
    const user = userEvent.setup()
    renderPage()
    const opener = await within(table()).findByRole('button', { name: /Tee 1/ })
    expect(detail).not.toHaveBeenCalled()

    await user.click(opener)
    const drawer = await screen.findByRole('dialog', { name: 'Tee 1' })
    expect(await within(drawer).findByText('TEE-1-S-BLK')).toBeInTheDocument()
    expect(detail).toHaveBeenCalledWith(product(1).id, expect.anything())
    // The header and the one variant, both read from the variants.
    expect(within(drawer).getAllByText('Low stock')).toHaveLength(2)

    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(opener).toHaveFocus()
  })

  it('opens the drawer from a click anywhere on the row, once, in the table and the card list', async () => {
    const user = userEvent.setup()
    renderPage()
    const opener = await within(table()).findByRole('button', { name: /Tee 1/ })

    await user.click(within(opener.closest('tr')!).getByText('Hoodie'))
    await screen.findByRole('dialog', { name: 'Tee 1' })
    expect(detail).toHaveBeenCalledTimes(1)
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(opener).toHaveFocus()

    const cards = screen.getByRole('list', { name: 'Products' })
    const cardOpener = within(cards).getByRole('button', { name: /Tee 2/ })
    await user.click(cardOpener.closest('li')!)
    await screen.findByRole('dialog', { name: 'Tee 2' })
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(cardOpener).toHaveFocus()
  })

  it('opens from the name button with the keyboard, and shows the product header before the variants arrive', async () => {
    const user = userEvent.setup()
    const pending = deferred<{ variants: [] }>()
    detail.mockReturnValue(pending.promise)
    list.mockResolvedValue(answer([product(1, { minPrice: 1000, maxPrice: 1500, totalStock: 0 })]))
    renderPage()
    const opener = await within(table()).findByRole('button', { name: /^Tee 1/ })
    opener.focus()
    await user.keyboard('{Enter}')
    const drawer = await screen.findByRole('dialog', { name: 'Tee 1' })
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    expect(detail).toHaveBeenCalledTimes(1)

    expect(within(drawer).getByText('Hoodie, Silhou')).toBeInTheDocument()
    expect(within(drawer).getByText(/1,000/)).toBeInTheDocument()
    expect(within(drawer).getByText('Out of stock')).toBeInTheDocument()
    expect(within(drawer).getByText(product(1).id)).toBeInTheDocument()
    expect(within(drawer).getByRole('status', { name: 'Loading variants' })).toBeInTheDocument()

    pending.resolve({ variants: [] })
    expect(await within(drawer).findByText('This product has no variants yet.')).toBeInTheDocument()
  })

  it('groups variants by colour and copies the product ID', async () => {
    const user = userEvent.setup()
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    detail.mockResolvedValue({
      variants: [
        { id: 'v1', sku: 'T-S-BLK', size: 'S', color: 'Black', stock: 0, price: 1000, name: null, colorHex: null, imageUrl: null, measurements: null },
        { id: 'v2', sku: 'T-S-WHT', size: 'S', color: 'White', stock: 9, price: 1000, name: null, colorHex: null, imageUrl: null, measurements: null },
        { id: 'v3', sku: 'T-M-BLK', size: 'M', color: 'Black', stock: 4, price: 1000, name: null, colorHex: null, imageUrl: null, measurements: null },
      ],
    })
    renderPage()
    await user.click(await within(table()).findByRole('button', { name: /Tee 1/ }))
    const drawer = await screen.findByRole('dialog', { name: 'Tee 1' })
    const variants = await within(drawer).findByRole('table')
    // Black's two sizes sit together under one colour row, then White.
    expect(within(variants).getAllByRole('row').map((r) => r.textContent?.match(/^(Black|White)|T-[A-Z]-[A-Z]{3}/)?.[0])).toEqual([undefined, 'Black', 'T-S-BLK', 'T-M-BLK', 'White', 'T-S-WHT'])

    await user.click(within(drawer).getByRole('button', { name: 'Copy product ID' }))
    expect(writeText).toHaveBeenCalledWith(product(1).id)
    expect(await screen.findByText('ID copied')).toBeInTheDocument()
  })

  it('offers a retry when the variants fail to load', async () => {
    const user = userEvent.setup()
    detail.mockRejectedValueOnce(new ProductListError('server'))
    renderPage()
    await user.click(await within(table()).findByRole('button', { name: /Tee 1/ }))
    const drawer = await screen.findByRole('dialog')
    expect(await within(drawer).findByRole('alert')).toHaveTextContent("We couldn't load the variants.")
    await user.click(within(drawer).getByRole('button', { name: 'Retry' }))
    expect(await within(drawer).findByText('TEE-1-S-BLK')).toBeInTheDocument()
  })
})

describe('StaffInventoryPage archive and restock (real API path)', () => {
  const T = { timeout: 3000 }
  const variants = [
    { id: 'v1', sku: 'TEE-1-S-BLK', size: 'S', color: 'Black', stock: 0, price: 1000, name: null, colorHex: null, imageUrl: null, measurements: null },
    { id: 'v2', sku: 'TEE-1-M-BLK', size: 'M', color: 'Black', stock: 4, price: 1000, name: null, colorHex: null, imageUrl: null, measurements: null },
  ]

  beforeEach(() => {
    list.mockResolvedValue(answer([product(1, { totalStock: 4 })]))
    detail.mockResolvedValue({ variants })
  })

  it('asks for archived products on the Archived tab, and for none of them on Active', async () => {
    const user = userEvent.setup()
    list.mockResolvedValue(answer([product(1, { isActive: false, totalStock: 0 })]))
    renderPage('?status=archived&stock=sizes')
    await within(table()).findByRole('button', { name: /^Tee 1/ })
    expect(screen.queryByText(/can.t be listed yet/)).not.toBeInTheDocument()
    expect(lastParams()).toMatchObject({ status: 'archived' })
    await user.click(screen.getByRole('tab', { name: /^Active/ }))
    expect(where()).toBe('/staff/inventory?stock=sizes')
    await waitFor(() => expect(lastParams().status).toBeUndefined())
    // The sizes-out filter has no API field: it stays selected and sends nothing.
    expect(lastParams().inStockOnly).toBeUndefined()
    await user.click(screen.getByRole('combobox', { name: 'Stock' }))
    expect(screen.getByRole('option', { name: 'Has out-of-stock sizes' })).toBeInTheDocument()
  })

  it('says so when there are no archived products', async () => {
    list.mockResolvedValue(answer([]))
    renderPage('?status=archived')
    expect(await screen.findByText('No archived products')).toBeInTheDocument()
  })

  it('archives with only { isActive: false }, and shows why when it fails', async () => {
    const user = userEvent.setup()
    vi.mocked(setProductActive).mockRejectedValueOnce(new ProductListError('forbidden')).mockResolvedValue(undefined)
    renderPage()
    await user.click(await within(table()).findByRole('button', { name: /^Tee 1/ }))
    await user.click(await screen.findByRole('button', { name: 'Archive product' }))
    await user.click(within(await screen.findByRole('dialog', { name: 'Are you sure?' })).getByRole('button', { name: 'Archive product' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent("Couldn't archive Tee 1. Your account is not allowed to change inventory.")
    expect(setProductActive).toHaveBeenCalledWith(product(1).id, false, expect.anything())

    await user.click(screen.getByRole('button', { name: 'Archive product' }))
    expect(await screen.findByText('Tee 1 archived', {}, T)).toBeInTheDocument()
    expect(setProductActive).toHaveBeenCalledTimes(2)
    // The list loads again; the real API cannot say the product is archived, so only its refetch is asserted.
    await waitFor(() => expect(list.mock.calls.length).toBeGreaterThan(1))
  })

  it('reports a partly saved restock, keeps the failed size edited, and retries only that size', async () => {
    const user = userEvent.setup()
    vi.mocked(updateStocks)
      .mockResolvedValueOnce({ saved: ['v1'], failed: [{ variantId: 'v2', error: new ProductListError('conflict') }] })
      .mockResolvedValueOnce({ saved: ['v2'], failed: [] })
    renderPage()
    await user.click(await within(table()).findByRole('button', { name: /^Tee 1/ }))
    const drawer = await screen.findByRole('dialog', { name: 'Tee 1' })
    await user.click(await within(drawer).findByRole('button', { name: 'Edit product' }))
    // The API has no arReady field to save, so the AR Fitting checkbox is inert: it ticks, but is no edit to save.
    const ar = within(drawer).getByRole('checkbox', { name: 'AR Fitting ready' })
    await user.click(ar)
    expect(ar).toBeChecked()
    expect(within(drawer).getByRole('button', { name: 'Save changes' })).toBeDisabled()
    await user.click(within(drawer).getByRole('button', { name: 'Increase stock for Black S' }))
    await user.click(within(drawer).getByRole('button', { name: 'Increase stock for Black M' }))
    // What the reload after the save will say: v1 is saved, v2 is not.
    detail.mockResolvedValue({ variants: [{ ...variants[0], stock: 1 }, variants[1]] })
    await user.click(within(drawer).getByRole('button', { name: 'Save changes' }))

    expect(updateStocks).toHaveBeenCalledWith(product(1).id, [{ variantId: 'v1', stock: 1 }, { variantId: 'v2', stock: 5 }], expect.anything())
    const alert = await within(drawer).findByRole('alert')
    expect(alert).toHaveTextContent('1 of 2 saved.')
    expect(alert).toHaveTextContent("1 size didn't save and stay edited below. Someone else changed this product")

    // v2 is still the edit once the reload is back.
    await within(drawer).findByRole('textbox', { name: 'Stock for Black M' }, T)
    expect(within(drawer).getByRole('textbox', { name: 'Stock for Black M' })).toHaveValue('5')
    await user.click(within(drawer).getByRole('button', { name: 'Retry' }))
    expect(updateStocks).toHaveBeenLastCalledWith(product(1).id, [{ variantId: 'v2', stock: 5 }], expect.anything())
    expect(await screen.findByText('Stock updated for 1 size', {}, T)).toBeInTheDocument()
  })
})

describe('StaffInventoryPage delete, add and edit (real API path)', () => {
  const T = { timeout: 3000 }
  const variant = (over: Record<string, unknown>) => ({ price: 1000, name: null, colorHex: '#1b1d21', imageUrl: null, measurements: null, ...over })
  const variants = [
    variant({ id: 'v1', sku: 'TEE-1-S-BLK', size: 'S', color: 'Black', stock: 0 }),
    variant({ id: 'v2', sku: 'TEE-1-M-BLK', size: 'M', color: 'Black', stock: 4 }),
  ] as Awaited<ReturnType<typeof fetchProductDetail>>['variants']
  const fields = {
    description: 'Soft',
    gender: null,
    brand: 'Silhou',
    category: 'Hoodie',
    images: [
      { url: 'https://x/a.jpg', altText: 'Front', displayOrder: 0, isPrimary: true },
      { url: 'https://x/b.jpg', altText: 'Back', displayOrder: 1, isPrimary: false },
    ],
  }

  beforeEach(() => {
    list.mockResolvedValue(answer([product(1, { totalStock: 4 })]))
    detail.mockResolvedValue({ variants, product: fields })
  })

  async function openDrawer(user: ReturnType<typeof userEvent.setup>) {
    renderPage()
    await user.click(await within(table()).findByRole('button', { name: /^Tee 1/ }))
    const drawer = await screen.findByRole('dialog', { name: 'Tee 1' })
    await within(drawer).findByText('TEE-1-S-BLK', {}, T)
    return drawer
  }

  it('asks "Are you sure?" before deleting a product, focuses Cancel, keeps an error in the modal and retries with the same button', async () => {
    const user = userEvent.setup()
    vi.mocked(deleteProduct).mockRejectedValueOnce(new ProductListError('forbidden')).mockResolvedValue(undefined)
    const drawer = await openDrawer(user)
    await user.click(within(drawer).getByRole('button', { name: 'Delete product' }))

    const confirm = await screen.findByRole('dialog', { name: 'Are you sure?' })
    expect(within(confirm).getByText(/^Tee 1 and its 2 variants, images and AR measurements will be permanently deleted, and removed from shoppers' carts\. This can't be undone\. To hide it from the shop instead, archive it\.$/)).toBeInTheDocument()
    expect(within(confirm).getByRole('button', { name: 'Cancel' })).toHaveFocus()
    expect(deleteProduct).not.toHaveBeenCalled()

    await user.click(within(confirm).getByRole('button', { name: 'Delete Product' }))
    expect(deleteProduct).toHaveBeenCalledWith(product(1).id, expect.anything())
    const alert = await within(confirm).findByRole('alert')
    expect(alert).toHaveTextContent("Couldn't delete Tee 1. Your account is not allowed to delete products.")
    expect(screen.getByRole('dialog', { name: 'Are you sure?' })).toBeInTheDocument()

    await user.click(within(confirm).getByRole('button', { name: 'Delete Product' }))
    expect(await screen.findByText('Tee 1 deleted', {}, T)).toBeInTheDocument()
    expect(deleteProduct).toHaveBeenCalledTimes(2)
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await waitFor(() => expect(list.mock.calls.length).toBeGreaterThan(1))
  })

  it('treats a product that is already gone as deleted', async () => {
    const user = userEvent.setup()
    vi.mocked(deleteProduct).mockRejectedValue(new ProductListError('not-found'))
    const drawer = await openDrawer(user)
    await user.click(within(drawer).getByRole('button', { name: 'Delete product' }))
    await user.click(within(await screen.findByRole('dialog', { name: 'Are you sure?' })).getByRole('button', { name: 'Delete Product' }))
    expect(await screen.findByText('Tee 1 deleted', {}, T)).toBeInTheDocument()
  })

  it('cancelling the delete prompt goes back to the product without deleting', async () => {
    const user = userEvent.setup()
    const drawer = await openDrawer(user)
    await user.click(within(drawer).getByRole('button', { name: 'Delete product' }))
    await user.click(within(await screen.findByRole('dialog', { name: 'Are you sure?' })).getByRole('button', { name: 'Cancel' }))
    expect(await screen.findByRole('dialog', { name: 'Tee 1' })).toBeInTheDocument()
    expect(deleteProduct).not.toHaveBeenCalled()
  })

  it('confirms before deleting a variant, warns about the last one, then refreshes and says so', async () => {
    const user = userEvent.setup()
    vi.mocked(deleteVariant).mockResolvedValue(undefined)
    const drawer = await openDrawer(user)
    await user.click(within(drawer).getByRole('button', { name: 'Delete Black S' }))
    const confirm = await screen.findByRole('dialog', { name: 'Are you sure?' })
    expect(within(confirm).getByText("Black S (SKU TEE-1-S-BLK) will be permanently deleted, and removed from shoppers' carts. This can't be undone.")).toBeInTheDocument()
    detail.mockResolvedValue({ variants: [variants[1]], product: fields })
    await user.click(within(confirm).getByRole('button', { name: 'Delete Variant' }))
    expect(deleteVariant).toHaveBeenCalledWith(product(1).id, 'v1', expect.anything())
    expect(await screen.findByText('Variant deleted', {}, T)).toBeInTheDocument()
    const back = await screen.findByRole('dialog', { name: 'Tee 1' })
    await waitFor(() => expect(within(back).queryByText('TEE-1-S-BLK')).not.toBeInTheDocument())

    await user.click(within(back).getByRole('button', { name: 'Delete Black M' }))
    expect(await screen.findByText(/It is the last variant, so Tee 1 will have no price or stock\./)).toBeInTheDocument()
  })

  it('shows why a variant could not be deleted, inside the prompt', async () => {
    const user = userEvent.setup()
    vi.mocked(deleteVariant).mockRejectedValue(new ProductListError('network'))
    const drawer = await openDrawer(user)
    await user.click(within(drawer).getByRole('button', { name: 'Delete Black S' }))
    await user.click(within(await screen.findByRole('dialog', { name: 'Are you sure?' })).getByRole('button', { name: 'Delete Variant' }))
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't delete Black S. The connection dropped")
  })

  it('adds a variant: validates inline, sends only what was filled in, and comes back to the product', async () => {
    const user = userEvent.setup()
    vi.mocked(addVariant).mockResolvedValue({ ...variants[0], id: 'v3', sku: 'AUTO-1', size: 'XL' })
    const drawer = await openDrawer(user)
    await user.click(within(drawer).getByRole('button', { name: 'Add variant' }))
    const sheet = await screen.findByRole('dialog', { name: 'Add variant' })
    expect(screen.queryByRole('dialog', { name: 'Tee 1' })).not.toBeInTheDocument()

    await user.click(within(sheet).getByRole('button', { name: 'Add variant' }))
    expect(addVariant).not.toHaveBeenCalled()
    expect(within(sheet).getByText(/Enter a size, a colour or a variant name/)).toBeInTheDocument()
    expect(within(sheet).getByText(/Enter an amount above 0/)).toBeInTheDocument()
    expect(within(sheet).getByRole('textbox', { name: /^Size/ })).toHaveFocus()

    await user.type(within(sheet).getByRole('textbox', { name: /^Size/ }), 'xl')
    await user.type(within(sheet).getByRole('textbox', { name: /^Price/ }), '500')
    await user.click(within(sheet).getByRole('button', { name: 'Add variant' }))
    expect(addVariant).toHaveBeenCalledWith(product(1).id, { size: 'XL', price: 500, stock: 0 }, expect.anything())
    expect(await screen.findByText('Variant added', {}, T)).toBeInTheDocument()
    expect(await screen.findByRole('dialog', { name: 'Tee 1' })).toBeInTheDocument()
  })

  it('puts a duplicate SKU (409) on the SKU field and keeps the sheet open', async () => {
    const user = userEvent.setup()
    vi.mocked(addVariant).mockRejectedValue(new ProductListError('conflict', 'SKU "DUP" is already in use'))
    const drawer = await openDrawer(user)
    await user.click(within(drawer).getByRole('button', { name: 'Add variant' }))
    const sheet = await screen.findByRole('dialog', { name: 'Add variant' })
    await user.type(within(sheet).getByRole('textbox', { name: /^Size/ }), 'M')
    await user.type(within(sheet).getByRole('textbox', { name: /^SKU/ }), 'dup')
    await user.type(within(sheet).getByRole('textbox', { name: /^Price/ }), '10')
    await user.click(within(sheet).getByRole('button', { name: 'Add variant' }))

    const sku = await within(sheet).findByRole('textbox', { name: /^SKU/ })
    await waitFor(() => expect(sku).toHaveAttribute('aria-invalid', 'true'))
    expect(within(sheet).getAllByText(/SKU DUP is already used by another variant/).length).toBeGreaterThan(0)
    expect(within(sheet).getByRole('alert')).toHaveTextContent("Couldn't add the variant.")
    await waitFor(() => expect(sku).toHaveFocus())
    expect(screen.getByRole('dialog', { name: 'Add variant' })).toBeInTheDocument()
  })

  it('edits a variant with only the price in the body, and Save waits for a change', async () => {
    const user = userEvent.setup()
    vi.mocked(updateVariant).mockResolvedValue(variants[0])
    const drawer = await openDrawer(user)
    await user.click(within(drawer).getByRole('button', { name: 'Edit Black S' }))
    const sheet = await screen.findByRole('dialog', { name: 'Edit variant' })
    expect(within(sheet).getByRole('textbox', { name: /^SKU/ })).toHaveValue('TEE-1-S-BLK')
    expect(within(sheet).queryByRole('textbox', { name: /^Stock/ })).not.toBeInTheDocument()
    expect(within(sheet).getByRole('button', { name: 'Save variant' })).toBeDisabled()

    const price = within(sheet).getByRole('textbox', { name: /^Price/ })
    await user.clear(price)
    await user.type(price, '1200')
    await user.click(within(sheet).getByRole('button', { name: 'Save variant' }))
    expect(updateVariant).toHaveBeenCalledWith(product(1).id, 'v1', { price: 1200 }, expect.anything())
    expect(await screen.findByText('Variant updated', {}, T)).toBeInTheDocument()
  })

  it('shows Edit details only once the details loaded, prefilled without base price or variants, and sends only the name', async () => {
    const user = userEvent.setup()
    vi.mocked(updateProduct).mockResolvedValue(undefined)
    const drawer = await openDrawer(user)
    await user.click(within(drawer).getByRole('button', { name: 'Edit details' }))
    const sheet = await screen.findByRole('dialog', { name: 'Edit details' })
    expect(within(sheet).getByRole('textbox', { name: /^Name/ })).toHaveValue('Tee 1')
    expect(within(sheet).getByRole('textbox', { name: /^Brand/ })).toHaveValue('Silhou')
    expect(within(sheet).getByRole('textbox', { name: /^Description/ })).toHaveValue('Soft')
    expect(within(sheet).getByText("Changing the name also changes the product's web address.")).toBeInTheDocument()
    expect(within(sheet).queryByRole('textbox', { name: /Base price/ })).not.toBeInTheDocument()
    expect(within(sheet).queryByText('Colours', { exact: false })).not.toBeInTheDocument()
    expect(within(sheet).getByRole('button', { name: 'Save changes' })).toBeDisabled()

    await user.type(within(sheet).getByRole('textbox', { name: /^Name/ }), 'X')
    await user.click(within(sheet).getByRole('button', { name: 'Save changes' }))
    expect(updateProduct).toHaveBeenCalledWith(product(1).id, { name: 'Tee 1X' }, expect.anything())
    expect(await screen.findByText('Tee 1X updated', {}, T)).toBeInTheDocument()
  })

  it('sends the whole image list when an image is removed', async () => {
    const user = userEvent.setup()
    vi.mocked(updateProduct).mockResolvedValue(undefined)
    const drawer = await openDrawer(user)
    await user.click(within(drawer).getByRole('button', { name: 'Edit details' }))
    const sheet = await screen.findByRole('dialog', { name: 'Edit details' })
    await user.click(within(sheet).getByRole('button', { name: 'Remove image 2' }))
    await user.click(within(sheet).getByRole('button', { name: 'Save changes' }))
    expect(updateProduct).toHaveBeenCalledWith(
      product(1).id,
      { images: [{ url: 'https://x/a.jpg', altText: 'Front', displayOrder: 0, isPrimary: true }] },
      expect.anything(),
    )
  })

  it('asks before discarding unsaved detail edits, and shows why a save failed', async () => {
    const user = userEvent.setup()
    vi.mocked(updateProduct).mockRejectedValue(new ProductListError('server'))
    const drawer = await openDrawer(user)
    await user.click(within(drawer).getByRole('button', { name: 'Edit details' }))
    const sheet = await screen.findByRole('dialog', { name: 'Edit details' })
    await user.type(within(sheet).getByRole('textbox', { name: /^Name/ }), 'X')
    await user.click(within(sheet).getByRole('button', { name: 'Save changes' }))
    const alert = await within(sheet).findByRole('alert')
    expect(alert).toHaveTextContent("Couldn't save the changes to Tee 1.")
    expect(within(sheet).getByRole('button', { name: 'Try again' })).toBeInTheDocument()

    await user.click(within(sheet).getByRole('button', { name: 'Cancel' }))
    const discard = await screen.findByRole('dialog', { name: 'Are you sure?' })
    expect(within(discard).getByText(/Your changes to Tee 1 haven't been saved yet\./)).toBeInTheDocument()
    await user.click(within(discard).getByRole('button', { name: 'Discard changes' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('does not offer the manage actions on an archived product, but still offers Delete product', async () => {
    const user = userEvent.setup()
    list.mockResolvedValue(answer([product(1, { isActive: false })]))
    renderPage()
    await user.click(await within(table()).findByRole('button', { name: /^Tee 1/ }))
    const drawer = await screen.findByRole('dialog', { name: 'Tee 1' })
    await within(drawer).findByText('TEE-1-S-BLK', {}, T)
    expect(within(drawer).queryByRole('button', { name: 'Add variant' })).not.toBeInTheDocument()
    expect(within(drawer).queryByRole('button', { name: 'Edit details' })).not.toBeInTheDocument()
    expect(within(drawer).queryByRole('button', { name: 'Edit Black S' })).not.toBeInTheDocument()
    expect(within(drawer).getByRole('button', { name: 'Delete product' })).toBeInTheDocument()
    expect(within(drawer).getByRole('button', { name: 'Restore product' })).toBeInTheDocument()
  })

  it('offers Add variant from the empty state of a product with none', async () => {
    const user = userEvent.setup()
    detail.mockResolvedValue({ variants: [], product: fields })
    renderPage()
    await user.click(await within(table()).findByRole('button', { name: /^Tee 1/ }))
    const drawer = await screen.findByRole('dialog', { name: 'Tee 1' })
    expect(await within(drawer).findByText('This product has no variants yet.')).toBeInTheDocument()
    await user.click(within(drawer).getByRole('button', { name: 'Add variant' }))
    expect(await screen.findByRole('dialog', { name: 'Add variant' })).toBeInTheDocument()
  })
})

describe('Stock alert column', () => {
  const alertHeader = () => within(table()).queryByRole('columnheader', { name: 'Stock alert' })
  const rowOf = (name: RegExp) => within(table()).getByRole('button', { name }).closest('tr')!

  it('is absent while every row is plain in stock, and the rows show only the count', async () => {
    renderPage()
    await within(await screen.findByRole('table')).findByRole('button', { name: /^Tee 1/ })
    expect(alertHeader()).not.toBeInTheDocument()
    expect(table().querySelectorAll('col')).toHaveLength(7)
    const cells = within(rowOf(/^Tee 1/)).getAllByRole('cell')
    expect(cells[5]).toHaveTextContent('In stock 20')
    expect(within(cells[5]).getByText('In stock')).toHaveClass('sr-only')
    expect(within(screen.getByRole('list', { name: 'Products' })).queryByText('Low stock')).not.toBeInTheDocument()
  })

  it('shows Low stock, Out of stock and a grey sizes-out chip, and the chip alone', async () => {
    list.mockResolvedValue(
      answer([
        product(1, { totalStock: 3 }),
        product(2, { totalStock: 0 }),
        product(3, { totalStock: 40, outOfStockVariants: 2 }),
        product(4, { totalStock: 2, outOfStockVariants: 1 }),
      ]),
    )
    renderPage()
    await within(await screen.findByRole('table')).findByRole('button', { name: /^Tee 1/ })
    expect(alertHeader()).toBeInTheDocument()
    const alertCell = (name: RegExp) => within(rowOf(name)).getAllByRole('cell')[6]
    expect(within(alertCell(/^Tee 1/)).getByText('Low stock')).toBeInTheDocument()
    expect(within(alertCell(/^Tee 2/)).getByText('Out of stock')).toBeInTheDocument()
    expect(within(alertCell(/^Tee 3/)).queryByText(/stock/)).not.toBeInTheDocument()
    const chip = within(alertCell(/^Tee 3/)).getByText('2 sizes out')
    expect(chip).toHaveClass('bg-fg/15', 'text-fg/80', 'text-[11px]')
    expect(chip.className).not.toMatch(/border-danger/)
    expect(within(alertCell(/^Tee 4/)).getByText('Low stock')).toBeInTheDocument()
    expect(within(alertCell(/^Tee 4/)).getByText('1 size out')).toBeInTheDocument()
  })

  it('goes away and comes back as the rows change', async () => {
    const user = userEvent.setup()
    list.mockImplementation(async (params) => (params.search ? answer([product(1)]) : answer([product(1), product(2, { totalStock: 0 })])))
    renderPage()
    await within(await screen.findByRole('table')).findByRole('button', { name: /^Tee 2/ })
    expect(alertHeader()).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'go jean' }))
    await waitFor(() => expect(alertHeader()).not.toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: 'go back' }))
    await waitFor(() => expect(alertHeader()).toBeInTheDocument())
  })
})

describe('needsAlert', () => {
  it('flags low, out and sizes-out products, never plain or archived ones', () => {
    expect(needsAlert(product(1))).toBe(false)
    expect(needsAlert(product(1, { totalStock: 5 }))).toBe(true)
    expect(needsAlert(product(1, { totalStock: 0 }))).toBe(true)
    expect(needsAlert(product(1, { outOfStockVariants: 1 }))).toBe(true)
    expect(needsAlert(product(1, { isActive: false, totalStock: 0, outOfStockVariants: 2 }))).toBe(false)
  })
})

describe('StockBadge', () => {
  it.each([
    [0, 'Out of stock'],
    [1, 'Low stock'],
    [5, 'Low stock'],
    [6, 'In stock'],
  ])('reads %i as %s', (stock, label) => {
    render(<StockBadge stock={stock} />)
    expect(screen.getByText(label)).toBeInTheDocument()
  })
})

describe('rowTint', () => {
  it.each([
    [0, 'row-out'],
    [-2, 'row-out'],
    [1, 'row-low'],
    [5, 'row-low'],
    [6, ''],
  ])('tints %i in stock as "%s"', (stock, tint) => {
    expect(rowTint(product(1, { totalStock: stock }))).toBe(tint)
  })

  it('leaves archived rows plain, tints by total stock and ignores sizes out when stock is healthy', () => {
    expect(rowTint(product(1, { isActive: false, totalStock: 0 }))).toBe('')
    expect(rowTint(product(1, { totalStock: 3, outOfStockVariants: 2 }))).toBe('row-low')
    expect(rowTint(product(1, { totalStock: 20, outOfStockVariants: 2 }))).toBe('')
  })
})

describe('Row tint and Added date', () => {
  it('tints the table row and the card by stock level, and shows a short date with the full one for assistive tech', async () => {
    list.mockResolvedValue(
      answer([product(1, { totalStock: 3, createdAt: '2026-10-23T12:00:00.000Z' }), product(2, { totalStock: 0, createdAt: '' }), product(3, { totalStock: 40, outOfStockVariants: 2 })]),
    )
    renderPage()
    const tee = (n: number) => within(table()).getByRole('button', { name: new RegExp(`^Tee ${n}`) }).closest('tr')!
    await within(await screen.findByRole('table')).findByRole('button', { name: /^Tee 1/ })
    expect(tee(1)).toHaveClass('row-low')
    expect(tee(1)).toHaveAttribute('data-stock', 'low')
    expect(tee(2)).toHaveClass('row-out')
    expect(tee(2)).toHaveAttribute('data-stock', 'out')
    expect(tee(3).className).not.toMatch(/row-/)
    expect(tee(3)).toHaveAttribute('data-stock', 'in')
    const card = (n: number) => within(screen.getByRole('list', { name: 'Products' })).getByRole('button', { name: new RegExp(`^Tee ${n}`) }).closest('li')!
    expect(card(1)).toHaveClass('row-low')
    expect(card(2)).toHaveClass('row-out')
    expect(card(3).className).not.toMatch(/row-/)

    const added = within(tee(1)).getAllByRole('cell')[4]
    expect(within(added).getByText('Oct 23, 2026')).toBeInTheDocument()
    expect(added.querySelector('time')).toHaveAttribute('datetime', '2026-10-23T12:00:00.000Z')
    expect(added).toHaveTextContent('October 23, 2026')
    expect(added.querySelector('[title]')).toBeNull()
    expect(within(tee(2)).getAllByRole('cell')[4]).toHaveTextContent('—')
  })

  it('puts the Archived badge in the Product cell, not the Stock cell, and does not tint it', async () => {
    list.mockResolvedValue(answer([product(1, { isActive: false, totalStock: 0 })]))
    renderPage()
    const tr = (await within(await screen.findByRole('table')).findByRole('button', { name: /^Tee 1/ })).closest('tr')!
    const cells = within(tr).getAllByRole('cell')
    expect(within(cells[0]).getByText('Archived')).toBeInTheDocument()
    expect(within(cells[5]).queryByText('Archived')).not.toBeInTheDocument()
    expect(tr.className).not.toMatch(/row-/)
  })
})

describe('InventoryColgroup', () => {
  it.each([
    [true, 8],
    [false, 7],
  ])('with alerts %s has %i columns, Product takes the rest, Actions is fixed', (showAlerts, count) => {
    const { container } = render(
      <table>
        <InventoryColgroup showAlerts={showAlerts} />
      </table>,
    )
    const cols = [...container.querySelectorAll('col')]
    expect(cols).toHaveLength(count)
    expect(cols[0].className).toBe('')
    cols.slice(1, -1).forEach((col) => expect(col.className).toMatch(/^w-\[[\d.]+%\]( @\[\d+px\]:w-\[[\d.]+%\]){3}$/))
    expect(cols.at(-1)).toHaveClass('w-12')
    cols.forEach((col) => expect(col.className).not.toContain('@6xl'))
  })
})

describe('StaffInventoryPage brand, size, colour and price filters (real API)', () => {
  it('sends them to the API, shows a chip for each, and removes one at a time', async () => {
    const user = userEvent.setup()
    renderPage('?brand=Nike&size=M&color=Black&minPrice=100&maxPrice=900&page=2')
    await within(table()).findByRole('button', { name: /Tee 1/ })
    expect(lastParams()).toMatchObject({ brand: 'Nike', size: 'M', color: 'Black', minPrice: 100, maxPrice: 900, page: 2 })
    expect(screen.getByText('Filters (4)')).toBeInTheDocument()

    const chips = within(screen.getByRole('list', { name: 'Active filters' }))
    expect(chips.getByRole('button', { name: 'Remove brand Nike' })).toBeInTheDocument()
    expect(chips.getByRole('button', { name: 'Remove size M' })).toBeInTheDocument()
    expect(chips.getByRole('button', { name: 'Remove color Black' })).toBeInTheDocument()
    expect(chips.getByRole('button', { name: /^Remove price / })).toHaveAccessibleName(/₱100\.00 to ₱900\.00/)

    await user.click(chips.getByRole('button', { name: 'Remove brand Nike' }))
    expect(where()).not.toContain('brand')
    expect(where()).not.toContain('page=')
    await waitFor(() => expect(lastParams().brand).toBeUndefined())
    expect(lastParams()).toMatchObject({ size: 'M', minPrice: 100 })

    await user.click(screen.getByRole('button', { name: /^Remove price / }))
    expect(where()).not.toContain('Price')
    await waitFor(() => expect(lastParams().minPrice).toBeUndefined())
    expect(lastParams().maxPrice).toBeUndefined()

    await user.click(screen.getByRole('button', { name: 'Clear all' }))
    expect(where()).toBe('/staff/inventory')
    expect(screen.queryByRole('list', { name: 'Active filters' })).not.toBeInTheDocument()
  })

  it('applies the panel in one go, with the size chips and typed values, and goes back to page 1', async () => {
    const user = userEvent.setup()
    renderPage('?page=3')
    await within(table()).findByRole('button', { name: /Tee 1/ })
    await user.click(screen.getByRole('button', { name: /More filters/ }))
    const panel = await screen.findByRole('dialog', { name: 'More filters' })

    await user.type(within(panel).getByRole('combobox', { name: /^Brand/ }), 'Nike')
    await user.click(within(panel).getByRole('button', { name: 'M' }))
    expect(within(panel).getByRole('button', { name: 'M' })).toHaveAttribute('aria-pressed', 'true')
    await user.type(within(panel).getByRole('combobox', { name: /^Colour/ }), 'Black')
    await user.type(within(panel).getByRole('textbox', { name: 'Minimum' }), '0')
    await user.type(within(panel).getByRole('textbox', { name: 'Maximum' }), '500.505abc')
    expect(within(panel).getByRole('textbox', { name: 'Maximum' })).toHaveValue('500.50')
    // Nothing is asked until Apply.
    expect(lastParams()).not.toMatchObject({ brand: 'Nike' })

    await user.click(within(panel).getByRole('button', { name: 'Apply filters' }))
    expect(where()).toBe('/staff/inventory?brand=Nike&size=M&color=Black&minPrice=0&maxPrice=500.5')
    await waitFor(() => expect(lastParams()).toMatchObject({ brand: 'Nike', size: 'M', color: 'Black', minPrice: 0, maxPrice: 500.5, page: 1 }))
  })

  it('offers the sizes, brands and colours the products really have, still as free text', async () => {
    const user = userEvent.setup()
    filters.mockResolvedValue({ categories: [], brands: ['Atelier Manila'], sizes: ['30', 'L', 'M', 'One size', 'XS'], colors: [{ name: 'Navy', hex: '#1b2a49' }], minPrice: 1200, maxPrice: 2600 })
    renderPage()
    await within(table()).findByRole('button', { name: /Tee 1/ })
    await user.click(screen.getByRole('button', { name: /More filters/ }))
    const panel = await screen.findByRole('dialog', { name: 'More filters' })
    await waitFor(() => expect(within(panel).getByRole('button', { name: 'One size' })).toBeInTheDocument())
    const chips = ['XS', 'M', 'L', '30', 'One size'].map((name) => within(panel).getByRole('button', { name }))
    expect(chips.every((chip, i) => i === 0 || chips[i - 1].compareDocumentPosition(chip) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true)
    expect(within(panel).queryByRole('button', { name: 'XXL' })).not.toBeInTheDocument()
    expect(within(panel).getByRole('textbox', { name: 'Another size' })).toBeInTheDocument()
    expect(panel.querySelector('datalist#filter-brand-options option')).toHaveValue('Atelier Manila')
    expect(panel.querySelector('datalist#filter-color-options option')).toHaveValue('Navy')
    await user.type(within(panel).getByRole('combobox', { name: /^Brand/ }), 'Other')
    await user.click(within(panel).getByRole('button', { name: 'Apply filters' }))
    expect(where()).toContain('brand=Other')
    expect(filters).toHaveBeenCalledTimes(1)
  })

  it('refuses a minimum above the maximum in the panel, with an inline error', async () => {
    const user = userEvent.setup()
    renderPage()
    await within(table()).findByRole('button', { name: /Tee 1/ })
    await user.click(screen.getByRole('button', { name: /More filters/ }))
    const panel = await screen.findByRole('dialog', { name: 'More filters' })
    await user.type(within(panel).getByRole('textbox', { name: 'Minimum' }), '900')
    await user.type(within(panel).getByRole('textbox', { name: 'Maximum' }), '100')
    expect(within(panel).getByRole('alert')).toHaveTextContent('The minimum is higher than the maximum')
    expect(within(panel).getByRole('button', { name: 'Apply filters' })).toBeDisabled()
  })

  it('does not ask the API for a URL whose minimum is above its maximum, and says so', async () => {
    const user = userEvent.setup()
    renderPage('?minPrice=900&maxPrice=100')
    expect(await screen.findByRole('alert')).toHaveTextContent('The minimum price (₱900.00) is higher than the maximum (₱100.00)')
    expect(list).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Clear price range' }))
    expect(where()).toBe('/staff/inventory')
    await within(table()).findByRole('button', { name: /Tee 1/ })
    expect(list).toHaveBeenCalled()
  })

  it('shows only the alert for a bad price range, with no empty-state copy and no second Clear all', async () => {
    renderPage('?minPrice=900&maxPrice=100')
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.queryByText('No products match')).not.toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /^Clear all$/ })).toHaveLength(1)
  })

  it('hands focus to the next chip, then the previous, then More filters as chips are removed', async () => {
    const user = userEvent.setup()
    renderPage('?brand=Nike&size=M&minPrice=1')
    await within(table()).findByRole('button', { name: /Tee 1/ })
    await user.click(screen.getByRole('button', { name: 'Remove brand Nike' }))
    expect(screen.getByRole('button', { name: 'Remove size M' })).toHaveFocus()
    await user.click(screen.getByRole('button', { name: /^Remove price / }))
    expect(screen.getByRole('button', { name: 'Remove size M' })).toHaveFocus()
    await user.click(screen.getByRole('button', { name: 'Remove size M' }))
    expect(screen.getByRole('button', { name: /More filters/ })).toHaveFocus()
  })

  it('keeps focus on More filters after Clear price range', async () => {
    const user = userEvent.setup()
    renderPage('?minPrice=900&maxPrice=100')
    await user.click(await screen.findByRole('button', { name: 'Clear price range' }))
    expect(screen.getByRole('button', { name: /More filters/ })).toHaveFocus()
  })

  it('refuses - and e in a price, caps 9 whole digits with or without a dot, and collapses brand whitespace', async () => {
    const user = userEvent.setup()
    renderPage()
    await within(table()).findByRole('button', { name: /Tee 1/ })
    await user.click(screen.getByRole('button', { name: /More filters/ }))
    const panel = await screen.findByRole('dialog', { name: 'More filters' })
    const min = within(panel).getByRole('textbox', { name: 'Minimum' })
    await user.type(min, '-5')
    expect(min).toHaveValue('5')
    await user.clear(min)
    await user.type(min, '1e5')
    expect(min).toHaveValue('15')
    await user.clear(min)
    await user.type(min, '12345678901')
    expect(min).toHaveValue('123456789')
    await user.clear(min)
    await user.click(min)
    await user.paste('-5')
    expect(min).toHaveValue('')
    await user.type(within(panel).getByRole('combobox', { name: /^Brand/ }), '  Ayala    Atelier  ')
    await user.click(within(panel).getByRole('button', { name: 'Apply filters' }))
    expect(where()).toContain('brand=Ayala+Atelier')
  })

  it('names the active filters in the empty state and clears them all', async () => {
    const user = userEvent.setup()
    list.mockResolvedValue(answer([]))
    renderPage('?q=tee&brand=Zzz&size=XXL')
    expect(await screen.findByText('No products match')).toBeInTheDocument()
    expect(screen.getByText(/search "tee", brand Zzz, size XXL\./)).toBeInTheDocument()
    list.mockResolvedValue(answer([product(1)]))
    await user.click(screen.getAllByRole('button', { name: 'Clear all' }).at(-1)!)
    expect(where()).toBe('/staff/inventory')
    expect(await within(table()).findByRole('button', { name: /Tee 1/ })).toBeInTheDocument()
  })
})
