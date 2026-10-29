import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MotionGlobalConfig } from 'motion/react'
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../../src/components/toast/ToastProvider'
import { setSampleProducts } from '../../src/service/fetchStaffAnalytics'
import { ProductListError } from '../../src/service/fetchProductList'
import {
  fetchTransactionDetail,
  fetchTransactionList,
  fetchTransactionSummary,
  type PaginatedTransactions,
  type TransactionDetail,
  type TransactionListItem,
} from '../../src/service/fetchTransactions'
import { SAMPLE_PRODUCTS } from '../fixtures/sampleProducts'
import { StaffTransactionsPage } from '../../src/views/staff/StaffTransactionsPage'

vi.mock('../../src/service/fetchTransactions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/service/fetchTransactions')>()),
  fetchTransactionList: vi.fn(),
  fetchTransactionDetail: vi.fn(),
  fetchTransactionSummary: vi.fn(),
}))

// The page defaults to the generated orders; these tests flip it off for the real-API path and on for the sample path.
const sample = vi.hoisted(() => ({ on: false }))
vi.mock('../../src/service/sampleTransactions', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../src/service/sampleTransactions')>()
  return Object.defineProperty({ ...original }, 'TRANSACTIONS_SAMPLE_DATA', { get: () => sample.on, enumerable: true })
})

const list = vi.mocked(fetchTransactionList)
const detail = vi.mocked(fetchTransactionDetail)
const summary = vi.mocked(fetchTransactionSummary)

const order = (n: number, overrides: Partial<TransactionListItem> = {}): TransactionListItem => ({
  id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
  orderNo: `SF-${10000 + n}`,
  customerName: `Customer ${n}`,
  // 3:45 PM in Manila.
  placedAt: '2026-10-22T07:45:00.000Z',
  itemCount: 3,
  total: 4580,
  ...overrides,
})

const answer = (items: TransactionListItem[], total = items.length, page = 1, limit = 25): PaginatedTransactions => ({
  data: items,
  meta: { total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)), hasNextPage: false, hasPreviousPage: page > 1 },
})

const detailOf = (item: TransactionListItem, overrides: Partial<TransactionDetail> = {}): TransactionDetail => ({
  ...item,
  subtotal: item.total,
  lines: [
    { productId: 'p01', name: 'Heritage Polo', category: 'Hoodie', units: 2, unitPrice: 1290 },
    { productId: 'p02', name: 'Fence-Line Blazer', category: 'Hoodie', units: 1, unitPrice: 2000 },
  ],
  ...overrides,
})

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => (resolve = r))
  return { promise, resolve }
}

beforeAll(() => {
  setSampleProducts(SAMPLE_PRODUCTS)
  MotionGlobalConfig.skipAnimations = true
  Element.prototype.scrollIntoView = vi.fn()
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} }))
})

beforeEach(() => {
  sample.on = false
  vi.resetAllMocks()
  list.mockResolvedValue(answer([order(1), order(2)]))
  summary.mockResolvedValue({ count: 1234, gross: 2283000, vat: 244607.14, returnedCount: 0 })
  detail.mockImplementation(async (id) => detailOf([order(1), order(2)].find((o) => o.id === id)!))
})

function Where() {
  const { pathname, search } = useLocation()
  const navigate = useNavigate()
  return (
    <>
      <p data-testid="where">{pathname + search}</p>
      <button type="button" onClick={() => navigate('?q=maria')}>
        go maria
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
      <MemoryRouter initialEntries={[`/staff/transactions${search}`]}>
        <Where />
        <Routes>
          <Route path="staff/transactions" element={<StaffTransactionsPage />} />
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

describe('StaffTransactionsPage', () => {
  it('shows skeleton rows while loading, then the orders, their count and 12-hour Manila times', async () => {
    const pending = deferred<PaginatedTransactions>()
    list.mockReturnValue(pending.promise)
    renderPage()
    expect(screen.getByText('Loading transactions')).toBeInTheDocument()
    expect(table()).toHaveAttribute('aria-busy', 'true')
    // The header row, then one skeleton row per page-size slot, with the same seven columns.
    const rows = within(table()).getAllByRole('row')
    expect(rows).toHaveLength(26)
    rows.slice(1).forEach((row) => expect(row.querySelectorAll('td')).toHaveLength(7))

    pending.resolve(answer([order(1), order(2)]))
    const opener = await within(table()).findByRole('button', { name: /SF-10001/ })
    expect(table()).toHaveAttribute('aria-busy', 'false')
    expect(screen.getByRole('heading', { level: 1, name: 'Transactions' })).toBeInTheDocument()
    // The page title carries no count line any more.
    expect(screen.queryByText('2 transactions')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1 }).parentElement).not.toHaveTextContent(/\d+\s+(matching\s+)?transactions?/)
    const cells = within(opener.closest('tr')!).getAllByRole('cell')
    expect(cells[1]).toHaveTextContent('Customer 1')
    expect(cells[4]).toHaveTextContent(/^Oct 22, 2026, 3:45\sPM$/)
    expect(cells[5]).toHaveTextContent('3')
    expect(cells[6]).toHaveTextContent('₱4,580.00')
    expect(document.title).toBe('Transactions — SilhouFit')
  })

  it('marks returned orders with a Returned badge in the table and the cards, and not the others', async () => {
    const returned = order(2, { returnedAt: '2026-10-24T02:05:00.000Z', returnReason: 'Wrong size', refundAmount: 4580 })
    list.mockResolvedValue(answer([order(1), returned]))
    renderPage()
    const row = (await within(table()).findByRole('button', { name: /SF-10002/ })).closest('tr')!
    expect(within(row).getByText('Returned')).toBeInTheDocument()
    expect(within(within(table()).getByRole('button', { name: /SF-10001/ }).closest('tr')!).queryByText('Returned')).not.toBeInTheDocument()
    const card = document.querySelector(`li[data-transaction="${returned.id}"]`)!
    expect(within(card as HTMLElement).getByText('Returned')).toBeInTheDocument()
    expect(document.querySelector(`li[data-transaction="${order(1).id}"]`)!.textContent).not.toContain('Returned')
  })

  it('shows the return in the drawer: when, why and the full refund', async () => {
    const user = userEvent.setup()
    const returned = order(2, { returnedAt: '2026-10-24T02:05:00.000Z', returnReason: 'Defective item', refundAmount: 4580 })
    list.mockResolvedValue(answer([returned]))
    detail.mockResolvedValue(detailOf(returned))
    renderPage()
    await user.click(await within(table()).findByRole('button', { name: /SF-10002/ }))
    const drawer = await screen.findByRole('dialog', { name: 'SF-10002' })
    expect(within(drawer).getByText('Returned')).toBeInTheDocument()
    expect(within(drawer).getByText(/Returned on/)).toHaveTextContent(/^Returned on Oct 24, 2026, 10:05\sAM$/)
    expect(within(drawer).getByText('Reason: Defective item')).toBeInTheDocument()
    expect(within(drawer).getByText('Refunded in full: ₱4,580.00')).toBeInTheDocument()
  })

  it('has a meta description of 150 to 160 characters', () => {
    renderPage()
    const content = document.querySelector('meta[name="description"]')!.getAttribute('content')!
    expect(content.length).toBeGreaterThanOrEqual(150)
    expect(content.length).toBeLessThanOrEqual(160)
  })

  it('asks for the newest first by default, in the URL whitelist order', async () => {
    renderPage()
    await within(table()).findByRole('button', { name: /SF-10001/ })
    expect(lastParams()).toMatchObject({ sortBy: 'placedAt', sortOrder: 'desc', page: 1, limit: 25 })
    expect(lastParams().search).toBeUndefined()
    expect(lastParams().from).toBeUndefined()
    expect(within(table()).getByRole('columnheader', { name: 'Date and time' })).toHaveAttribute('aria-sort', 'descending')
  })

  it('names why loading failed and retries', async () => {
    list.mockRejectedValueOnce(new ProductListError('network'))
    renderPage()
    expect(await screen.findByRole('alert')).toHaveTextContent("We couldn't load the transactions.")
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await within(table()).findByRole('button', { name: /SF-10001/ })).toBeInTheDocument()
    expect(list).toHaveBeenCalledTimes(2)
  })

  it('tells no orders yet from a search with no matches', async () => {
    list.mockResolvedValue(answer([]))
    const { unmount } = renderPage()
    expect(await screen.findByText('No transactions yet')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Clear filters' })).not.toBeInTheDocument()
    unmount()

    renderPage('?q=zzz&range=week')
    expect(await screen.findByText('No transactions match')).toBeInTheDocument()
    expect(screen.getByText(/clear the search and filters and try again/)).toBeInTheDocument()
    await userEvent.click(screen.getAllByRole('button', { name: 'Clear filters' }).at(-1)!)
    expect(where()).toBe('/staff/transactions')
    expect(screen.getByRole('textbox', { name: /Search transactions/ })).toHaveValue('')
  })

  it('sorts from the Date and Total headers, and leaves Order, Items unsortable', async () => {
    const user = userEvent.setup()
    renderPage()
    await within(table()).findByRole('button', { name: /SF-10001/ })
    for (const name of ['Order', 'Items']) {
      const header = within(table()).getByRole('columnheader', { name })
      expect(header).not.toHaveAttribute('aria-sort')
      expect(within(header).queryByRole('button')).not.toBeInTheDocument()
    }

    const total = within(table()).getByRole('columnheader', { name: 'Total' })
    expect(total).not.toHaveAttribute('aria-sort')
    await user.click(within(total).getByRole('button'))
    expect(where()).toContain('sort=total')
    expect(where()).toContain('dir=desc')
    await waitFor(() => expect(total).toHaveAttribute('aria-sort', 'descending'))
    expect(lastParams()).toMatchObject({ sortBy: 'total', sortOrder: 'desc' })

    await user.click(within(total).getByRole('button'))
    await waitFor(() => expect(total).toHaveAttribute('aria-sort', 'ascending'))
    expect(lastParams()).toMatchObject({ sortBy: 'total', sortOrder: 'asc' })

    const date = within(table()).getByRole('columnheader', { name: 'Date and time' })
    await user.click(within(date).getByRole('button'))
    await waitFor(() => expect(date).toHaveAttribute('aria-sort', 'descending'))
    expect(lastParams()).toMatchObject({ sortBy: 'placedAt', sortOrder: 'desc' })
  })

  it('sorts by customer from the Sort by select', async () => {
    const user = userEvent.setup()
    renderPage()
    await within(table()).findByRole('button', { name: /SF-10001/ })
    await choose(user, 'Sort by', 'Customer: A to Z')
    expect(where()).toContain('sort=customer')
    expect(where()).toContain('dir=asc')
    await waitFor(() => expect(lastParams()).toMatchObject({ sortBy: 'customerName', sortOrder: 'asc' }))
  })

  it('shows the range of the page, and a page size change goes back to page 1', async () => {
    const user = userEvent.setup()
    list.mockResolvedValue(answer([order(26)], 60, 2))
    renderPage('?page=2')
    expect(await screen.findByText('Displaying 26–50 of 60')).toBeInTheDocument()
    expect(lastParams()).toMatchObject({ page: 2, limit: 25 })

    await choose(user, 'Rows per page', '10 per page')
    expect(where()).toBe('/staff/transactions?per=10')
    await waitFor(() => expect(lastParams()).toMatchObject({ page: 1, limit: 10 }))
    expect(within(table()).getAllByRole('row').length).toBeGreaterThan(1)
  })

  it('pages with the pagination buttons and keeps the sort', async () => {
    const user = userEvent.setup()
    list.mockResolvedValue(answer([order(1)], 60))
    renderPage('?sort=total')
    await screen.findByText('Displaying 1–25 of 60')
    await user.click(screen.getByRole('button', { name: 'Next' }))
    expect(where()).toBe('/staff/transactions?sort=total&page=2')
  })

  it('shows a way back when the page is past the last one', async () => {
    const user = userEvent.setup()
    list.mockResolvedValue({ ...answer([], 30, 9), data: [] })
    renderPage('?page=9')
    expect(await screen.findByText('There are no transactions on page 9.')).toBeInTheDocument()
    list.mockResolvedValue(answer([order(1)], 30))
    await user.click(screen.getByRole('button', { name: 'Go to the first page' }))
    expect(where()).toBe('/staff/transactions')
    expect(await within(table()).findByRole('button', { name: /SF-10001/ })).toBeInTheDocument()
  })

  it('sends one request for a search, 300ms after typing stops, and writes it to the URL', async () => {
    const user = userEvent.setup()
    renderPage()
    await within(table()).findByRole('button', { name: /SF-10001/ })
    expect(list).toHaveBeenCalledTimes(1)

    await user.type(screen.getByRole('textbox', { name: /Search transactions/ }), 'SF-100')
    expect(list).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(where()).toBe('/staff/transactions?q=SF-100'))
    expect(list).toHaveBeenCalledTimes(2)
    expect(lastParams()).toMatchObject({ search: 'SF-100', page: 1 })
  })

  it('puts the URL search back in the box on back and forward', async () => {
    const user = userEvent.setup()
    renderPage('?q=SF-100')
    const box = screen.getByRole('textbox', { name: /Search transactions/ })
    expect(box).toHaveValue('SF-100')
    await user.click(screen.getByRole('button', { name: 'go maria' }))
    await waitFor(() => expect(box).toHaveValue('maria'))
    await user.click(screen.getByRole('button', { name: 'go back' }))
    await waitFor(() => expect(box).toHaveValue('SF-100'))
    expect(lastParams()).toMatchObject({ search: 'SF-100' })
  })

  it('looks up a pasted full order ID by its own endpoint', async () => {
    const found = order(7)
    detail.mockResolvedValue(detailOf(found))
    renderPage(`?q=${found.id}`)
    expect(await within(table()).findByRole('button', { name: /SF-10007/ })).toBeInTheDocument()
    expect(detail).toHaveBeenCalledWith(found.id, expect.anything())
    expect(list).not.toHaveBeenCalled()

    detail.mockRejectedValue(new ProductListError('not-found'))
    renderPage(`?q=${order(8).id}`)
    expect((await screen.findAllByText('No transactions match')).length).toBeGreaterThan(0)
  })

  it('filters by a date preset, in the URL and the request, and clears it', async () => {
    const user = userEvent.setup()
    renderPage('?sort=total')
    await within(table()).findByRole('button', { name: /SF-10001/ })

    await choose(user, 'Date range', 'Last 7 days')
    await waitFor(() => expect(lastParams().from).toBeDefined())
    expect(where()).toBe('/staff/transactions?sort=total&range=week')
    expect(lastParams().from! < lastParams().to!).toBe(true)
    expect(screen.getByText('Filters (1)')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(where()).toBe('/staff/transactions?sort=total')
    await waitFor(() => expect(lastParams().from).toBeUndefined())
    expect(lastParams().to).toBeUndefined()
    expect(screen.queryByRole('button', { name: 'Clear filters' })).not.toBeInTheDocument()
  })

  it('takes a custom range from two date inputs limited by each other, and a preset forgets them', async () => {
    const user = userEvent.setup()
    renderPage()
    await within(table()).findByRole('button', { name: /SF-10001/ })
    expect(screen.queryByLabelText('From')).not.toBeInTheDocument()

    await choose(user, 'Date range', 'Custom')
    expect(where()).toBe('/staff/transactions?range=custom')
    const from = screen.getByLabelText('From')
    const to = screen.getByLabelText('To')
    fireEvent.change(from, { target: { value: '2026-09-01' } })
    await waitFor(() => expect(lastParams()).toMatchObject({ from: '2026-09-01' }))
    expect(lastParams().to).toBeUndefined()
    expect(to).toHaveAttribute('min', '2026-09-01')
    fireEvent.change(to, { target: { value: '2026-09-30' } })
    await waitFor(() => expect(lastParams()).toMatchObject({ from: '2026-09-01', to: '2026-09-30' }))
    expect(where()).toBe('/staff/transactions?range=custom&from=2026-09-01&to=2026-09-30')
    expect(from).toHaveAttribute('max', '2026-09-30')

    await choose(user, 'Date range', 'Today')
    expect(where()).toBe('/staff/transactions?range=today')
    expect(screen.queryByLabelText('From')).not.toBeInTheDocument()
  })

  it('ignores a bad or backwards custom range in the URL', async () => {
    renderPage('?range=custom&from=2026-10-05&to=2026-10-01')
    await within(table()).findByRole('button', { name: /SF-10001/ })
    expect(lastParams().from).toBeUndefined()
    expect(lastParams().to).toBeUndefined()
    expect(screen.getByLabelText('From')).toHaveValue('')
  })

  it('keeps the previous rows, dimmed, while the next request loads', async () => {
    const user = userEvent.setup()
    renderPage()
    await within(table()).findByRole('button', { name: /SF-10001/ })
    const next = deferred<PaginatedTransactions>()
    list.mockReturnValue(next.promise)

    await choose(user, 'Date range', 'Today')
    expect(within(table()).getByRole('button', { name: /SF-10001/ })).toBeInTheDocument()
    expect(table()).toHaveAttribute('aria-busy', 'true')
    expect(table().querySelector('tbody')).toHaveClass('opacity-60')

    next.resolve(answer([order(3)]))
    expect(await within(table()).findByRole('button', { name: /SF-10003/ })).toBeInTheDocument()
    expect(table().querySelector('tbody')).not.toHaveClass('opacity-60')
  })

  it('keeps the rows and count with a retry when a later request fails, and retries those params', async () => {
    const user = userEvent.setup()
    list.mockResolvedValue(answer([order(1)], 60))
    renderPage()
    await within(table()).findByRole('button', { name: /SF-10001/ })
    list.mockRejectedValueOnce(new ProductListError('network'))
    await choose(user, 'Date range', 'Today')
    expect(await screen.findByRole('alert')).toHaveTextContent("We couldn't load the latest transactions.")
    expect(within(table()).getByRole('button', { name: /SF-10001/ })).toBeInTheDocument()
    expect(screen.getByText('Displaying 1–25 of 60')).toBeInTheDocument()
    const failed = lastParams()
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
    expect(lastParams()).toEqual(failed)
    expect(list).toHaveBeenCalledTimes(3)
  })

  it('keeps focus in the pager when Next is disabled on the last page, and scrolls the list into view', async () => {
    const user = userEvent.setup()
    list.mockResolvedValue(answer([order(26)], 60, 2))
    renderPage('?page=2')
    await screen.findByText('Displaying 26–50 of 60')
    const section = screen.getByRole('region', { name: 'Transactions' })
    vi.spyOn(section, 'getBoundingClientRect').mockReturnValue({ top: -200 } as DOMRect)
    const next = screen.getByRole('button', { name: 'Next' })
    next.focus()
    await user.keyboard('{Enter}')
    await waitFor(() => expect(next).toBeDisabled())
    expect(screen.getByRole('button', { name: 'Page 3' })).toHaveFocus()
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({ block: 'start', behavior: 'smooth' })
  })

  it('opens an order in a drawer with its items and totals, closes on Escape and returns focus', async () => {
    const user = userEvent.setup()
    renderPage()
    const opener = await within(table()).findByRole('button', { name: /SF-10001/ })
    expect(detail).not.toHaveBeenCalled()

    await user.click(opener)
    const drawer = await screen.findByRole('dialog', { name: 'SF-10001' })
    // The header comes from the list row before the items arrive.
    expect(within(drawer).getByText('Customer 1')).toBeInTheDocument()
    expect(within(drawer).getAllByText(/^Oct 22, 2026, 3:45\sPM$/)[0]).toBeInTheDocument()
    expect(within(drawer).getByText(order(1).id)).toBeInTheDocument()
    expect(await within(drawer).findByText('Heritage Polo')).toBeInTheDocument()
    expect(detail).toHaveBeenCalledWith(order(1).id, expect.anything())
    const lines = within(within(drawer).getByRole('table')).getAllByRole('row').slice(1)
    expect(lines[0]).toHaveTextContent('2 × ₱1,290.00')
    expect(lines[0]).toHaveTextContent('₱2,580.00')
    expect(lines[1]).toHaveTextContent('Fence-Line Blazer')
    expect(within(drawer).getByText('Subtotal').nextElementSibling).toHaveTextContent('₱4,580.00')

    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(opener).toHaveFocus()
  })

  it('shows skeleton lines while the items load', async () => {
    const user = userEvent.setup()
    const pending = deferred<TransactionDetail>()
    detail.mockReturnValue(pending.promise)
    renderPage()
    await user.click(await within(table()).findByRole('button', { name: /SF-10001/ }))
    const drawer = await screen.findByRole('dialog', { name: 'SF-10001' })
    expect(within(drawer).getByRole('status', { name: 'Loading items' })).toBeInTheDocument()
    pending.resolve(detailOf(order(1), { lines: [] }))
    expect(await within(drawer).findByText('This order has no items.')).toBeInTheDocument()
  })

  it('opens the drawer from a click anywhere on the row, once, in the table and the card list', async () => {
    const user = userEvent.setup()
    renderPage()
    const opener = await within(table()).findByRole('button', { name: /SF-10001/ })

    await user.click(within(opener.closest('tr')!).getByText('₱4,580.00'))
    await screen.findByRole('dialog', { name: 'SF-10001' })
    expect(detail).toHaveBeenCalledTimes(1)
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(opener).toHaveFocus()

    const cards = screen.getByRole('list', { name: 'Transactions' })
    const cardOpener = within(cards).getByRole('button', { name: /SF-10002/ })
    await user.click(cardOpener.closest('li')!)
    await screen.findByRole('dialog', { name: 'SF-10002' })
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(cardOpener).toHaveFocus()
  })

  it('opens from the order button with the keyboard', async () => {
    const user = userEvent.setup()
    renderPage()
    const opener = await within(table()).findByRole('button', { name: /SF-10001/ })
    opener.focus()
    await user.keyboard('{Enter}')
    await screen.findByRole('dialog', { name: 'SF-10001' })
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    expect(detail).toHaveBeenCalledTimes(1)
  })

  it('copies the order ID', async () => {
    const user = userEvent.setup()
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    renderPage()
    await user.click(await within(table()).findByRole('button', { name: /SF-10001/ }))
    const drawer = await screen.findByRole('dialog', { name: 'SF-10001' })
    await user.click(within(drawer).getByRole('button', { name: 'Copy order ID' }))
    expect(writeText).toHaveBeenCalledWith(order(1).id)
    expect(await screen.findByText('ID copied')).toBeInTheDocument()
  })

  it('offers a retry when the items fail to load', async () => {
    const user = userEvent.setup()
    detail.mockRejectedValueOnce(new ProductListError('server'))
    renderPage()
    await user.click(await within(table()).findByRole('button', { name: /SF-10001/ }))
    const drawer = await screen.findByRole('dialog')
    expect(await within(drawer).findByRole('alert')).toHaveTextContent("We couldn't load the items.")
    await user.click(within(drawer).getByRole('button', { name: 'Retry' }))
    expect(await within(drawer).findByText('Heritage Polo')).toBeInTheDocument()
  })
})

describe('StaffTransactionsPage with generated orders', () => {
  beforeEach(() => {
    sample.on = true
  })

  it('lists the generated history without calling the API and says the data is a sample', async () => {
    renderPage()
    expect((await within(table()).findAllByRole('button', { name: /^SF-\d+/ }, { timeout: 3000 })).length).toBe(25)
    expect(list).not.toHaveBeenCalled()
    expect(screen.getByText('Sample data')).toBeInTheDocument()
  })

  it('searches by order number and opens the order with its items', async () => {
    const user = userEvent.setup()
    renderPage('?q=sf-10001')
    const open = await within(table()).findByRole('button', { name: /SF-10001/ }, { timeout: 3000 })
    expect(within(table()).getAllByRole('row')).toHaveLength(2)
    await user.click(open)
    const drawer = await screen.findByRole('dialog', { name: 'SF-10001' })
    expect(await within(drawer).findByRole('table', {}, { timeout: 3000 })).toBeInTheDocument()
    expect(within(drawer).getByText('Subtotal')).toBeInTheDocument()
  })
})
