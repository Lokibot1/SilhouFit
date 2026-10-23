import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MotionGlobalConfig } from 'motion/react'
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../../src/components/toast/ToastProvider'
import { InventoryColgroup, rememberShowAlerts } from '../../src/components/staff/inventory/layout'
import { needsAlert, rowTint, StockBadge } from '../../src/components/staff/inventory/InventoryParts'
import { setProductActive, updateStocks } from '../../src/service/productAdmin'
import { resetSampleInventory, sampleSetArchived } from '../../src/service/sampleInventory'
import {
  fetchProductById,
  fetchProductDetail,
  fetchProductList,
  ProductListError,
  type PaginatedProducts,
  type ProductListItem,
} from '../../src/service/fetchProductList'
import { StaffInventoryPage } from '../../src/views/staff/StaffInventoryPage'

vi.mock('../../src/service/fetchProductList', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/service/fetchProductList')>()),
  fetchProductList: vi.fn(),
  fetchProductById: vi.fn(),
  fetchProductDetail: vi.fn(),
}))

vi.mock('../../src/service/productAdmin')

// The page defaults to the sample catalogue; these tests flip it off for the real-API path and on for the sample path.
const sample = vi.hoisted(() => ({ on: false }))
vi.mock('../../src/service/sampleInventory', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../src/service/sampleInventory')>()
  return Object.defineProperty({ ...original }, 'INVENTORY_SAMPLE_DATA', { get: () => sample.on, enumerable: true })
})

const list = vi.mocked(fetchProductList)
const byId = vi.mocked(fetchProductById)
const detail = vi.mocked(fetchProductDetail)

const product = (n: number, overrides: Partial<ProductListItem> = {}): ProductListItem => ({
  id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
  name: `Tee ${n}`,
  category: 'Tops',
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
  sample.on = false
  rememberShowAlerts(true)
  vi.resetAllMocks()
  list.mockResolvedValue(answer([product(1), product(2)]))
  detail.mockResolvedValue({ variants: [{ id: 'v1', sku: 'TEE-1-S-BLK', size: 'S', color: 'Black', stock: 3, effectivePrice: 1000 }] })
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
// The drawer has a table of its own, so once it is open `table()` finds two.
const listTable = () => screen.getAllByRole('table')[0]
const lastParams = () => list.mock.calls.at(-1)![0]

async function choose(user: ReturnType<typeof userEvent.setup>, combobox: string, option: string) {
  await user.click(screen.getByRole('combobox', { name: combobox }))
  await user.click(await screen.findByRole('option', { name: option }))
}

describe('StaffInventoryPage', () => {
  it('shows an AR Fitting column: a badge for ready and not ready, and a dash where the API has no field', async () => {
    list.mockResolvedValue(answer([product(1, { arReady: true }), product(2, { arReady: false }), product(3)]))
    renderPage()
    await within(await screen.findByRole('table')).findByRole('button', { name: /^Tee 1/ })
    const header = within(table()).getByRole('columnheader', { name: 'AR Fitting' })
    expect(header).not.toHaveAttribute('aria-sort')
    expect(within(header).queryByRole('button')).not.toBeInTheDocument()
    const cell = (name: RegExp) => within(within(table()).getByRole('button', { name }).closest('tr')!).getAllByRole('cell')[2]
    expect(within(cell(/^Tee 1/)).getByText('AR ready')).toBeInTheDocument()
    expect(within(cell(/^Tee 2/)).getByText('Not AR ready')).toBeInTheDocument()
    expect(within(cell(/^Tee 3/)).getByText('Not specified')).toBeInTheDocument()
    expect(within(cell(/^Tee 3/)).queryByText(/AR ready/)).not.toBeInTheDocument()
    // The cards show the same badges on the category line.
    const card = (name: string) => screen.getAllByRole('list', { name: 'Products' })[0].querySelector(`[data-product$="${name}"]`) as HTMLElement
    expect(within(card('000000000001')).getByText('AR ready')).toBeInTheDocument()
    expect(within(card('000000000002')).getByText('Not AR ready')).toBeInTheDocument()
    expect(within(card('000000000003')).queryByText(/AR ready/)).not.toBeInTheDocument()
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
    expect(screen.queryByRole('button', { name: 'Clear filters' })).not.toBeInTheDocument()
    unmount()

    renderPage('?q=zzz')
    expect(await screen.findByText('No products match')).toBeInTheDocument()
    expect(screen.getByText(/clear the search and filters and try again/)).toBeInTheDocument()
    await userEvent.click(screen.getAllByRole('button', { name: 'Clear filters' }).at(-1)!)
    expect(where()).toBe('/staff/inventory')
    expect(screen.getByRole('textbox', { name: /Search products/ })).toHaveValue('')
  })

  it('sorts from a header: ascending, then descending, in the URL and the request', async () => {
    const user = userEvent.setup()
    renderPage()
    await within(table()).findByRole('button', { name: /Tee 1/ })
    const price = within(table()).getByRole('columnheader', { name: 'Price' })
    expect(price).not.toHaveAttribute('aria-sort')

    await user.click(within(price).getByRole('button'))
    expect(where()).toContain('sort=price')
    expect(where()).toContain('dir=asc')
    await waitFor(() => expect(price).toHaveAttribute('aria-sort', 'ascending'))
    expect(lastParams()).toMatchObject({ sortBy: 'basePrice', sortOrder: 'asc' })

    await user.click(within(price).getByRole('button'))
    await waitFor(() => expect(price).toHaveAttribute('aria-sort', 'descending'))
    expect(where()).toContain('dir=desc')
    expect(lastParams()).toMatchObject({ sortBy: 'basePrice', sortOrder: 'desc' })
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

  it('filters by category, gender and stock, and clears them together', async () => {
    const user = userEvent.setup()
    renderPage('?sort=name')
    await within(table()).findByRole('button', { name: /Tee 1/ })

    await choose(user, 'Category', 'Tops')
    await waitFor(() => expect(lastParams()).toMatchObject({ category: 'Tops' }))
    await choose(user, 'Gender', 'Women')
    await waitFor(() => expect(lastParams()).toMatchObject({ gender: 'female' }))
    await choose(user, 'Stock', 'In stock')
    await waitFor(() => expect(lastParams()).toMatchObject({ inStockOnly: true }))
    expect(where()).toBe('/staff/inventory?sort=name&category=Tops&gender=female&stock=in')
    expect(screen.getByText('Filters (3)')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(where()).toBe('/staff/inventory?sort=name')
    await waitFor(() => expect(lastParams().category).toBeUndefined())
    expect(lastParams().inStockOnly).toBeUndefined()
    expect(screen.queryByRole('button', { name: 'Clear filters' })).not.toBeInTheDocument()
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

    await user.click(within(opener.closest('tr')!).getByText('Tops'))
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

    expect(within(drawer).getByText('Tops, Silhou')).toBeInTheDocument()
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
        { id: 'v1', sku: 'T-S-BLK', size: 'S', color: 'Black', stock: 0, effectivePrice: 1000 },
        { id: 'v2', sku: 'T-S-WHT', size: 'S', color: 'White', stock: 9, effectivePrice: 1000 },
        { id: 'v3', sku: 'T-M-BLK', size: 'M', color: 'Black', stock: 4, effectivePrice: 1000 },
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

describe('StaffInventoryPage with the sample catalogue', () => {
  beforeEach(() => {
    sample.on = true
  })

  it('lists the shop catalogue without calling the API, hides Gender and says the data is a sample', async () => {
    renderPage('?gender=male')
    expect(await within(table()).findByRole('button', { name: /Heritage Polo/ }, { timeout: 3000 })).toBeInTheDocument()
    expect(list).not.toHaveBeenCalled()
    expect(screen.getByText('Sample data')).toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: 'Gender' })).not.toBeInTheDocument()
    expect(screen.queryByText(/Filters \(1\)/)).not.toBeInTheDocument()
  })

  it('searches by ID, filters by stock and opens variants that add up to the stock', async () => {
    const user = userEvent.setup()
    renderPage('?q=p02')
    const open = await within(table()).findByRole('button', { name: /Fence-Line Blazer/ }, { timeout: 3000 })
    expect(within(table()).getAllByRole('row')).toHaveLength(2)
    await user.click(open)
    const drawer = await screen.findByRole('dialog', { name: 'Fence-Line Blazer' })
    expect(await within(drawer).findByText('P02-XS-BLACK', {}, { timeout: 3000 })).toBeInTheDocument()
  })

  it('lists only sold-out products with the out of stock filter', async () => {
    renderPage('?stock=out')
    expect(await within(table()).findByRole('button', { name: /^Field Denim Jacket/ }, { timeout: 3000 })).toBeInTheDocument()
    expect(within(table()).getAllByText('Out of stock').length).toBe(within(table()).getAllByRole('row').length - 1)
    expect(screen.getByText('Filters (1)')).toBeInTheDocument()
  })
})

describe('StaffInventoryPage archive, restore and restock (sample catalogue)', () => {
  const T = { timeout: 4000 }

  beforeEach(() => {
    sample.on = true
    resetSampleInventory()
  })

  // The table is absent while the list is empty, so it is looked up again on each try.
  const row = (name: RegExp) => waitFor(() => within(table()).getByRole('button', { name }), T)

  it('switches between the Active and Archived tabs with the mouse and the arrow keys, in the URL', async () => {
    const user = userEvent.setup()
    renderPage()
    const tabs = screen.getByRole('tablist', { name: 'Product status' })
    const active = within(tabs).getByRole('tab', { name: 'Active' })
    const archived = within(tabs).getByRole('tab', { name: 'Archived' })
    expect(active).toHaveAttribute('aria-selected', 'true')
    expect(archived).toHaveAttribute('tabindex', '-1')
    await row(/^Heritage Polo/)

    await user.click(archived)
    expect(where()).toBe('/staff/inventory?status=archived')
    expect(await screen.findByText('No archived products', {}, T)).toBeInTheDocument()
    expect(screen.getByText(/hidden from the shop and listed here/)).toBeInTheDocument()
    expect(screen.getByText('Hidden from the shop until you restore them.')).toBeInTheDocument()
    expect(archived).toHaveAttribute('aria-selected', 'true')

    archived.focus()
    await user.keyboard('{ArrowLeft}')
    expect(where()).toBe('/staff/inventory')
    expect(active).toHaveFocus()
    await user.keyboard('{End}')
    expect(where()).toBe('/staff/inventory?status=archived')
    expect(archived).toHaveFocus()
  })

  it('shows the size chip only on products that still have stock, and filters to them', async () => {
    const user = userEvent.setup()
    renderPage('?q=p02')
    const open = await row(/^Fence-Line Blazer/)
    expect(within(open.closest('tr')!).getByText('1 size out')).toBeInTheDocument()
    // Sold out products get Restock instead of the chip.
    expect(screen.queryByRole('button', { name: /^Restock Fence-Line Blazer/ })).not.toBeInTheDocument()

    await user.clear(screen.getByRole('textbox', { name: /Search products/ }))
    await choose(user, 'Stock', 'Has out-of-stock sizes')
    await waitFor(() => expect(where()).toContain('stock=sizes'))
    await row(/^Field Denim Jacket/)
    const names = within(table()).getAllByRole('row').slice(1).length
    expect(names).toBeGreaterThan(1)
    expect(within(table()).queryByText('Heritage Polo')).not.toBeInTheDocument()
  })

  it('archives from the drawer after a confirm step, then undoes it from the toast', async () => {
    const user = userEvent.setup()
    renderPage('?q=p02')
    await user.click(await row(/^Fence-Line Blazer/))
    const drawer = await screen.findByRole('dialog', { name: 'Fence-Line Blazer' })
    await within(drawer).findByText('P02-XS-BLACK', {}, T)

    await user.click(within(drawer).getByRole('button', { name: 'Archive product' }))
    const confirm = await screen.findByRole('dialog', { name: 'Are you sure?' })
    expect(within(confirm).getByText('Fence-Line Blazer will be hidden from the shop and from Active inventory. You can restore it from the Archived tab.')).toBeInTheDocument()
    expect(within(confirm).getByRole('button', { name: 'Cancel' })).toHaveFocus()

    // Cancel goes back to the product, nothing archived.
    await user.click(within(confirm).getByRole('button', { name: 'Cancel' }))
    expect(await screen.findByRole('dialog', { name: 'Fence-Line Blazer' })).toBeInTheDocument()
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    await user.click(await row(/^Fence-Line Blazer/))
    await user.click(await screen.findByRole('button', { name: 'Archive product' }))
    const sure = await screen.findByRole('dialog', { name: 'Are you sure?' })
    await user.click(within(sure).getByRole('button', { name: 'Archive product' }))
    expect(within(sure).getByRole('button', { name: 'Archiving…' })).toBeDisabled()

    expect(await screen.findByText('Fence-Line Blazer archived', {}, T)).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(await screen.findByText('No products match', {}, T)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Undo' }))
    expect(await screen.findByText('Fence-Line Blazer restored', {}, T)).toBeInTheDocument()
    await row(/^Fence-Line Blazer/)
  })

  it('restores from a row without a confirm step, keeps the drawer shut, and undoes with a re-archive', async () => {
    const user = userEvent.setup()
    await sampleSetArchived('p02', true, { delayMs: 0 })
    renderPage('?status=archived')
    const open = await row(/^Fence-Line Blazer/)
    const tr = open.closest('tr')!
    expect(within(tr).getByText('Archived')).toBeInTheDocument()
    expect(within(tr).queryByText(/sizes? out/)).not.toBeInTheDocument()
    expect(document.body).toHaveTextContent('1 archived product')

    await user.click(within(tr).getByRole('button', { name: 'Restore Fence-Line Blazer' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(await screen.findByText('Fence-Line Blazer restored', {}, T)).toBeInTheDocument()
    expect(await screen.findByText('No archived products', {}, T)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Undo' }))
    expect(await screen.findByText('Fence-Line Blazer archived', {}, T)).toBeInTheDocument()
    await row(/^Fence-Line Blazer/)
  })

  it('restores from the drawer of an archived product', async () => {
    const user = userEvent.setup()
    await sampleSetArchived('p02', true, { delayMs: 0 })
    renderPage('?status=archived')
    await user.click(await row(/^Fence-Line Blazer/))
    const drawer = await screen.findByRole('dialog', { name: 'Fence-Line Blazer' })
    expect(within(drawer).queryByRole('button', { name: 'Edit product' })).not.toBeInTheDocument()
    await user.click(within(drawer).getByRole('button', { name: 'Restore product' }))
    expect(await screen.findByText('Fence-Line Blazer restored', {}, T)).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('opens the stock editor from a sold-out row without opening the drawer twice, then saves and undoes', async () => {
    const user = userEvent.setup()
    renderPage('?stock=out')
    const open = await row(/^Field Denim Jacket/)
    expect(within(table()).queryByRole('button', { name: /^Restock Heritage Polo/ })).not.toBeInTheDocument()

    await user.click(within(open.closest('tr')!).getByRole('button', { name: 'Restock Field Denim Jacket' }))
    const drawer = await screen.findByRole('dialog', { name: 'Field Denim Jacket' })
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    const box = await within(drawer).findByRole('textbox', { name: 'Stock for Indigo XS' }, T)
    expect(box).toHaveFocus()
    expect(within(drawer).getByRole('button', { name: 'Save changes' })).toBeDisabled()

    // Digits only, five at most; a step changes it by one.
    await user.clear(box)
    expect(within(drawer).getByText('Enter a number from 0 to 99,999.')).toBeInTheDocument()
    await user.type(box, '7a8')
    expect(box).toHaveValue('78')
    await user.click(within(drawer).getByRole('button', { name: 'Decrease stock for Indigo XS' }))
    expect(box).toHaveValue('77')
    expect(within(drawer).getByText('Was 0')).toBeInTheDocument()
    await user.type(box, '9999999')
    expect(box).toHaveValue('77999')
    await user.clear(box)
    await user.type(box, '8')
    await user.click(within(drawer).getByRole('button', { name: 'Increase stock for Indigo XS' }))
    expect(box).toHaveValue('9')

    await user.click(within(drawer).getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByText('Stock updated for 1 size', {}, T)).toBeInTheDocument()
    // The list and drawer load again: the jacket is no longer sold out.
    expect(await screen.findByText('No products match', {}, T)).toBeInTheDocument()
    expect(await within(drawer).findByRole('button', { name: 'Edit product' }, T)).toBeInTheDocument()
    expect(within(drawer).getByText('9 in total')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Undo' }))
    expect(await screen.findByText('Stock change undone for Field Denim Jacket.', {}, T)).toBeInTheDocument()
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await row(/^Field Denim Jacket/)
  })

  it('sets every sold-out size at once, and only the changed sizes are saved', async () => {
    const user = userEvent.setup()
    renderPage('?q=p02')
    await user.click(await row(/^Fence-Line Blazer/))
    const drawer = await screen.findByRole('dialog', { name: 'Fence-Line Blazer' })
    await within(drawer).findByText('P02-XS-BLACK', {}, T)
    await user.click(within(drawer).getByRole('button', { name: 'Edit product' }))

    const helper = within(drawer).getByLabelText('Set all sold-out sizes to')
    expect(helper).toHaveValue('10')
    await user.click(within(drawer).getByRole('button', { name: 'Set 1 sold-out size to 10' }))
    expect(within(drawer).getByRole('textbox', { name: 'Stock for Black XL' })).toHaveValue('10')
    expect(within(drawer).getByRole('textbox', { name: 'Stock for Black XS' })).toHaveValue('1')
    await user.click(within(drawer).getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByText('Stock updated for 1 size', {}, T)).toBeInTheDocument()
    expect(await within(drawer).findByText('14 in total', {}, T)).toBeInTheDocument()
  })

  it('asks before dropping unsaved edits, on Discard and on Escape, and keeps them on Cancel', async () => {
    const user = userEvent.setup()
    renderPage('?q=p08')
    await user.click(await row(/^Everyday Crew Tee/))
    const drawer = await screen.findByRole('dialog', { name: 'Everyday Crew Tee' })
    await within(drawer).findByText('P08-XS-BLACK', {}, T)
    // Nothing edited: Discard just leaves the editor.
    await user.click(within(drawer).getByRole('button', { name: 'Edit product' }))
    await user.click(within(drawer).getByRole('button', { name: 'Discard' }))
    expect(within(drawer).getByRole('button', { name: 'Edit product' })).toHaveFocus()

    await user.click(within(drawer).getByRole('button', { name: 'Edit product' }))
    const box = within(drawer).getByRole('textbox', { name: 'Stock for Black XS' })
    await user.click(within(drawer).getByRole('button', { name: 'Increase stock for Black XS' }))
    const edited = (box as HTMLInputElement).value

    await user.click(within(drawer).getByRole('button', { name: 'Discard' }))
    const sure = await screen.findByRole('dialog', { name: 'Are you sure?' })
    expect(within(sure).getByText('Your changes to 1 size of Everyday Crew Tee will be lost.')).toBeInTheDocument()
    await user.click(within(sure).getByRole('button', { name: 'Cancel' }))
    expect(within(screen.getByRole('dialog')).getByRole('textbox', { name: 'Stock for Black XS' })).toHaveValue(edited)

    // Escape asks too, and a second Escape cancels the question.
    await user.keyboard('{Escape}')
    await screen.findByRole('dialog', { name: 'Are you sure?' })
    await user.keyboard('{Escape}')
    expect(await screen.findByRole('dialog', { name: 'Everyday Crew Tee' })).toBeInTheDocument()
    await user.keyboard('{Escape}')
    await user.click(within(await screen.findByRole('dialog', { name: 'Are you sure?' })).getByRole('button', { name: 'Discard changes' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.queryByText(/Stock updated/)).not.toBeInTheDocument()
  })

  it('filters by AR Fitting from the Select, in the URL, the list and the Filters count, on both tabs', async () => {
    const user = userEvent.setup()
    renderPage()
    await row(/^Heritage Polo/)
    await choose(user, 'AR Fitting', 'AR Fitting ready')
    expect(where()).toBe('/staff/inventory?ar=yes')
    await waitFor(() => expect(within(table()).queryByRole('button', { name: /^Heritage Polo/ })).not.toBeInTheDocument(), T)
    expect(within(table()).getByRole('button', { name: /^Fence-Line Blazer/ })).toBeInTheDocument()
    expect(screen.getByText('Filters (1)')).toBeInTheDocument()

    await choose(user, 'AR Fitting', 'Not AR ready')
    expect(where()).toBe('/staff/inventory?ar=no')
    await row(/^Heritage Polo/)
    expect(within(table()).queryByRole('button', { name: /^Fence-Line Blazer/ })).not.toBeInTheDocument()

    await sampleSetArchived('p01', true, { delayMs: 0 })
    await user.click(screen.getByRole('tab', { name: 'Archived' }))
    expect(where()).toBe('/staff/inventory?ar=no&status=archived')
    await row(/^Heritage Polo/)

    await user.click(screen.getAllByRole('button', { name: 'Clear filters' }).at(-1)!)
    expect(where()).toBe('/staff/inventory?status=archived')
    expect(screen.queryByText(/Filters \(1\)/)).not.toBeInTheDocument()
  })

  it('turns AR Fitting on from the drawer, shows the badge, and undoes it', async () => {
    const user = userEvent.setup()
    renderPage('?q=p01')
    await user.click(await row(/^Heritage Polo/))
    const drawer = await screen.findByRole('dialog', { name: 'Heritage Polo' })
    await within(drawer).findByText('P01-XS-WHITE', {}, T)
    expect(within(drawer).queryByText('AR ready')).not.toBeInTheDocument()
    await user.click(within(drawer).getByRole('button', { name: 'Edit product' }))
    expect(within(drawer).getByText('Shoppers can try this item on in AR Fitting.')).toBeInTheDocument()
    expect(within(drawer).getByRole('button', { name: 'Save changes' })).toBeDisabled()

    await user.click(within(drawer).getByRole('checkbox', { name: 'AR Fitting ready' }))
    await user.click(within(drawer).getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByText('AR Fitting ready turned on', {}, T)).toBeInTheDocument()
    expect(await within(drawer).findByText('AR ready', {}, T)).toBeInTheDocument()
    await waitFor(() => expect(within(listTable()).getByText('AR ready')).toBeInTheDocument(), T)

    await user.click(screen.getByRole('button', { name: 'Undo' }))
    expect(await screen.findByText('AR Fitting change undone for Heritage Polo.', {}, T)).toBeInTheDocument()
    await waitFor(() => expect(within(listTable()).queryByText('AR ready')).not.toBeInTheDocument(), T)
    expect(within(drawer).queryByText('AR ready')).not.toBeInTheDocument()
  })

  it('turns AR Fitting off with a stock change in one save, and asks before dropping an AR-only edit', async () => {
    const user = userEvent.setup()
    renderPage('?q=p02')
    await user.click(await row(/^Fence-Line Blazer/))
    const drawer = await screen.findByRole('dialog', { name: 'Fence-Line Blazer' })
    await within(drawer).findByText('P02-XS-BLACK', {}, T)
    expect(within(drawer).getByText('AR ready')).toBeInTheDocument()
    await user.click(within(drawer).getByRole('button', { name: 'Edit product' }))
    expect(within(drawer).getByRole('checkbox', { name: 'AR Fitting ready' })).toBeChecked()

    // Only AR changed: Discard asks first.
    await user.click(within(drawer).getByRole('checkbox', { name: 'AR Fitting ready' }))
    await user.click(within(drawer).getByRole('button', { name: 'Discard' }))
    const sure = await screen.findByRole('dialog', { name: 'Are you sure?' })
    expect(within(sure).getByText('Your change to AR Fitting for Fence-Line Blazer will be lost.')).toBeInTheDocument()
    await user.click(within(sure).getByRole('button', { name: 'Cancel' }))
    expect(within(screen.getByRole('dialog')).getByRole('checkbox', { name: 'AR Fitting ready' })).not.toBeChecked()

    await user.click(within(drawer).getByRole('button', { name: 'Increase stock for Black XS' }))
    await user.click(within(drawer).getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByText('Stock and AR Fitting updated', {}, T)).toBeInTheDocument()
    await waitFor(() => expect(within(drawer).queryByText('AR ready')).not.toBeInTheDocument(), T)
    await waitFor(() => expect(within(listTable()).queryByText('AR ready')).not.toBeInTheDocument(), T)

    await user.click(screen.getByRole('button', { name: 'Undo' }))
    expect(await screen.findByText('Changes undone for Fence-Line Blazer.', {}, T)).toBeInTheDocument()
    await waitFor(() => expect(within(listTable()).getByText('AR ready')).toBeInTheDocument(), T)
  })

  it('keeps opening the drawer from a click on the row, once', async () => {
    const user = userEvent.setup()
    renderPage('?stock=out')
    const open = await row(/^Field Denim Jacket/)
    await user.click(within(open.closest('tr')!).getByText('Outerwear'))
    await screen.findByRole('dialog', { name: 'Field Denim Jacket' })
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    // A read-only start: no stock boxes until Edit product.
    expect(screen.queryByRole('textbox', { name: /^Stock for/ })).not.toBeInTheDocument()
  })
})

describe('StaffInventoryPage archive and restock (real API path)', () => {
  const T = { timeout: 3000 }
  const variants = [
    { id: 'v1', sku: 'TEE-1-S-BLK', size: 'S', color: 'Black', stock: 0, effectivePrice: 1000 },
    { id: 'v2', sku: 'TEE-1-M-BLK', size: 'M', color: 'Black', stock: 4, effectivePrice: 1000 },
  ]

  beforeEach(() => {
    sample.on = false
    list.mockResolvedValue(answer([product(1, { totalStock: 4 })]))
    detail.mockResolvedValue({ variants })
  })

  it('tells the Archived tab is not available yet instead of listing, and hides the unsupported filters', async () => {
    const user = userEvent.setup()
    renderPage('?status=archived&stock=sizes')
    expect(await screen.findByText("Archived products can't be listed yet")).toBeInTheDocument()
    expect(list).not.toHaveBeenCalled()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Show active products' }))
    expect(where()).toBe('/staff/inventory?stock=sizes')
    await within(table()).findByRole('button', { name: /^Tee 1/ })
    expect(lastParams().inStockOnly).toBeUndefined()
    await user.click(screen.getByRole('combobox', { name: 'Stock' }))
    expect(screen.queryByRole('option', { name: 'Has out-of-stock sizes' })).not.toBeInTheDocument()
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
    // The API has no arReady field, so neither the filter nor the checkbox is offered.
    expect(within(drawer).queryByRole('checkbox', { name: 'AR Fitting ready' })).not.toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: 'AR Fitting' })).not.toBeInTheDocument()
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
