import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MotionGlobalConfig } from 'motion/react'
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../../src/components/toast/ToastProvider'
import { setSampleProducts } from '../../src/service/fetchStaffAnalytics'
import { ProductListError } from '../../src/service/fetchProductList'
import { fetchAdminOrder } from '../../src/service/adminOrdersApi'
import {
  fetchAdminTransaction,
  fetchAdminTransactionMetrics,
  fetchAdminTransactions,
  type AdminTransactionDetail,
  type AdminTransactionRow,
  type AdminTransactionsPage,
} from '../../src/service/adminTransactionsApi'
import { adminOrderDetail } from '../fixtures/orders'
import { SAMPLE_PRODUCTS } from '../fixtures/sampleProducts'
import { StaffTransactionsPage } from '../../src/views/staff/StaffTransactionsPage'

vi.mock('../../src/service/adminTransactionsApi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/service/adminTransactionsApi')>()),
  fetchAdminTransactions: vi.fn(),
  fetchAdminTransaction: vi.fn(),
  fetchAdminTransactionMetrics: vi.fn(),
}))

vi.mock('../../src/service/adminOrdersApi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/service/adminOrdersApi')>()),
  fetchAdminOrder: vi.fn(),
}))

// The page reads the real API; these tests flip it to the generated orders for a simulated account.
const sample = vi.hoisted(() => ({ on: false }))
vi.mock('../../src/service/ordersApi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/service/ordersApi')>()),
  usesSampleOrders: () => sample.on,
}))

const list = vi.mocked(fetchAdminTransactions)
const detail = vi.mocked(fetchAdminTransaction)
const metrics = vi.mocked(fetchAdminTransactionMetrics)
const orderDetail = vi.mocked(fetchAdminOrder)

const order = (n: number, overrides: Partial<AdminTransactionRow> = {}): AdminTransactionRow => ({
  id: `00000000-0000-4000-9000-${String(n).padStart(12, '0')}`,
  orderId: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
  orderNumber: `SF-${10000 + n}`,
  orderStatus: 'PAID',
  customerName: `Customer ${n}`,
  customerEmail: `customer${n}@example.com`,
  provider: 'paymongo',
  reference: `pay_${n}`,
  method: 'GCASH',
  status: 'PAID',
  amount: 4580,
  fee: 114.5,
  net: 4465.5,
  // 3:45 PM in Manila.
  at: '2026-10-22T07:45:00.000Z',
  ...overrides,
})

const answer = (items: AdminTransactionRow[], total = items.length, page = 1, limit = 25): AdminTransactionsPage => ({
  data: items,
  meta: { total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) },
})

const detailOf = (item: AdminTransactionRow, overrides: Partial<AdminTransactionDetail> = {}): AdminTransactionDetail => ({
  ...item,
  orderTotal: item.amount,
  updatedAt: '2026-10-22T07:46:00.000Z',
  payload: { data: { id: item.reference, attributes: { client_key: 'pay_secret_client', amount: 458000 } } },
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
  metrics.mockResolvedValue({ totalTransactions: 1234, paidCount: 1000, refundedCount: 100, failedCount: 90, pendingCount: 44, totalGrossVolume: 2283000, totalFeeVolume: 57075, totalNetVolume: 2225925 })
  detail.mockImplementation(async (id) => detailOf([order(1), order(2)].find((o) => o.id === id)!))
  orderDetail.mockImplementation(async (id) => adminOrderDetail({ id }))
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
  it('shows skeleton rows while loading, then the payments, their count and 12-hour Manila times', async () => {
    const pending = deferred<AdminTransactionsPage>()
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
    expect(within(table()).getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['Order', 'Customer', 'Method', 'Status', 'Date and time', 'Provider', 'Amount'])
    const cells = within(opener.closest('tr')!).getAllByRole('cell')
    expect(cells[1]).toHaveTextContent('Customer 1')
    expect(cells[2]).toHaveTextContent('GCash')
    expect(cells[3]).toHaveTextContent('Paid')
    expect(cells[4]).toHaveTextContent(/^Oct 22, 2026, 3:45\sPM$/)
    expect(cells[5]).toHaveTextContent('PayMongo')
    expect(cells[6]).toHaveTextContent('₱4,580.00')
    expect(cells[6]).toHaveClass('text-right', 'tabular-nums')
    expect(document.title).toBe('Transactions — SilhouFit')
  })

  it('shows each payment status as a pill in the table and the cards', async () => {
    const refunded = order(2, { status: 'REFUNDED', orderStatus: 'REFUNDED' })
    list.mockResolvedValue(answer([order(1), refunded, order(3, { status: 'FAILED' })]))
    renderPage()
    const row = (await within(table()).findByRole('button', { name: /SF-10002/ })).closest('tr')!
    expect(within(row).getByText('Refunded')).toBeInTheDocument()
    expect(within(within(table()).getByRole('button', { name: /SF-10001/ }).closest('tr')!).getByText('Paid')).toBeInTheDocument()
    expect(within(within(table()).getByRole('button', { name: /SF-10003/ }).closest('tr')!).getByText('Payment failed')).toBeInTheDocument()
    const card = document.querySelector(`li[data-transaction="${refunded.id}"]`) as HTMLElement
    expect(within(card).getByText('Refunded')).toBeInTheDocument()
    expect(within(card).getByText('GCash')).toBeInTheDocument()
    expect(within(card).getByText('₱4,580.00')).toBeInTheDocument()
  })

  it('has the meta description, of 150 to 160 characters', () => {
    renderPage()
    const content = document.querySelector('meta[name="description"]')!.getAttribute('content')!
    expect(content).toBe('Search every SilhouFit payment by order, customer or reference, filter by status, method and date, and open one to see its fee, net amount and gateway record.')
    expect(content.length).toBeGreaterThanOrEqual(150)
    expect(content.length).toBeLessThanOrEqual(160)
  })

  it('asks for the newest first by default, in the URL whitelist order', async () => {
    renderPage()
    await within(table()).findByRole('button', { name: /SF-10001/ })
    expect(lastParams()).toMatchObject({ sortBy: 'createdAt', sortOrder: 'desc', page: 1, limit: 25 })
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

  it('says the API is limiting requests when it answers 429', async () => {
    list.mockRejectedValueOnce(new ProductListError('rate-limit'))
    renderPage()
    expect(await screen.findByRole('alert')).toHaveTextContent('limiting requests')
  })

  it('tells no payments yet from a search with no matches', async () => {
    list.mockResolvedValue(answer([]))
    const { unmount } = renderPage()
    expect(await screen.findByText('No transactions yet')).toBeInTheDocument()
    expect(screen.getByText('Payments show here once customers pay at checkout.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Clear filters' })).not.toBeInTheDocument()
    unmount()

    renderPage('?q=zzz&range=week')
    expect(await screen.findByText('No transactions match')).toBeInTheDocument()
    expect(screen.getByText(/clear the search and filters and try again/)).toBeInTheDocument()
    await userEvent.click(screen.getAllByRole('button', { name: 'Clear filters' }).at(-1)!)
    expect(where()).toBe('/staff/transactions')
    expect(screen.getByRole('textbox', { name: /Search transactions/ })).toHaveValue('')
  })

  it('sorts from the Date and Amount headers, and leaves the other columns unsortable', async () => {
    const user = userEvent.setup()
    renderPage()
    await within(table()).findByRole('button', { name: /SF-10001/ })
    for (const name of ['Order', 'Customer', 'Method', 'Status', 'Provider']) {
      const header = within(table()).getByRole('columnheader', { name })
      expect(header).not.toHaveAttribute('aria-sort')
      expect(within(header).queryByRole('button')).not.toBeInTheDocument()
    }

    const amount = within(table()).getByRole('columnheader', { name: 'Amount' })
    expect(amount).not.toHaveAttribute('aria-sort')
    await user.click(within(amount).getByRole('button'))
    expect(where()).toContain('sort=total')
    expect(where()).toContain('dir=desc')
    await waitFor(() => expect(amount).toHaveAttribute('aria-sort', 'descending'))
    expect(lastParams()).toMatchObject({ sortBy: 'amount', sortOrder: 'desc' })

    await user.click(within(amount).getByRole('button'))
    await waitFor(() => expect(amount).toHaveAttribute('aria-sort', 'ascending'))
    expect(lastParams()).toMatchObject({ sortBy: 'amount', sortOrder: 'asc' })

    const date = within(table()).getByRole('columnheader', { name: 'Date and time' })
    await user.click(within(date).getByRole('button'))
    await waitFor(() => expect(date).toHaveAttribute('aria-sort', 'descending'))
    expect(lastParams()).toMatchObject({ sortBy: 'createdAt', sortOrder: 'desc' })
  })

  it('sorts by amount from the Sort by select, which has no customer sort', async () => {
    const user = userEvent.setup()
    renderPage()
    await within(table()).findByRole('button', { name: /SF-10001/ })
    await user.click(screen.getByRole('combobox', { name: 'Sort by' }))
    expect(screen.queryByRole('option', { name: /Customer/ })).not.toBeInTheDocument()
    await user.click(await screen.findByRole('option', { name: 'Amount: high to low' }))
    expect(where()).toContain('sort=total')
    expect(where()).toContain('dir=desc')
    await waitFor(() => expect(lastParams()).toMatchObject({ sortBy: 'amount', sortOrder: 'desc' }))
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

    const box = screen.getByRole('textbox', { name: /Search transactions/ })
    expect(box).toHaveAttribute('placeholder', 'Order, customer, email or reference')
    await user.type(box, 'SF-100')
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

  it('lists the payments of a pasted full order ID by asking for that order, not searching', async () => {
    const found = order(7)
    list.mockResolvedValue(answer([found]))
    renderPage(`?q=${found.orderId}`)
    expect(await within(table()).findByRole('button', { name: /SF-10007/ })).toBeInTheDocument()
    expect(lastParams()).toMatchObject({ orderId: found.orderId })
    expect(lastParams().search).toBeUndefined()
    expect(detail).not.toHaveBeenCalled()
  })

  it('searches ordinary text, and sends no order ID for it', async () => {
    renderPage('?q=maria')
    await within(table()).findByRole('button', { name: /SF-10001/ })
    expect(lastParams()).toMatchObject({ search: 'maria' })
    expect(lastParams().orderId).toBeUndefined()
  })

  it('filters by status, method and provider, in the URL and the request, and clears them together', async () => {
    const user = userEvent.setup()
    renderPage('?sort=total')
    await within(table()).findByRole('button', { name: /SF-10001/ })
    expect(screen.getByText('Filters (0)')).toBeInTheDocument()

    await choose(user, 'Status', 'Payment failed')
    await waitFor(() => expect(lastParams()).toMatchObject({ status: 'FAILED' }))
    await choose(user, 'Payment method', 'GrabPay')
    await waitFor(() => expect(lastParams()).toMatchObject({ status: 'FAILED', method: 'GRAB_PAY' }))
    await choose(user, 'Provider', 'Xendit')
    await waitFor(() => expect(lastParams()).toMatchObject({ status: 'FAILED', method: 'GRAB_PAY', provider: 'xendit' }))
    expect(where()).toBe('/staff/transactions?sort=total&status=FAILED&method=GRAB_PAY&provider=xendit')
    expect(screen.getByText('Filters (3)')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(where()).toBe('/staff/transactions?sort=total')
    await waitFor(() => expect(lastParams().status).toBeUndefined())
    expect(lastParams().method).toBeUndefined()
    expect(lastParams().provider).toBeUndefined()
  })

  it('offers every payment status and method, and ignores a status or method in the URL it does not know', async () => {
    const user = userEvent.setup()
    renderPage('?status=completed&method=cash&provider=nope')
    await within(table()).findByRole('button', { name: /SF-10001/ })
    expect(lastParams().status).toBeUndefined()
    expect(lastParams().method).toBeUndefined()
    expect(lastParams().provider).toBeUndefined()
    await user.click(screen.getByRole('combobox', { name: 'Status' }))
    expect((await screen.findAllByRole('option')).map((o) => o.textContent)).toEqual(['All statuses', 'Awaiting payment', 'Payment pending', 'Paid', 'Payment failed', 'Refunded'])
    await user.keyboard('{Escape}')
    await user.click(screen.getByRole('combobox', { name: 'Payment method' }))
    expect((await screen.findAllByRole('option')).map((o) => o.textContent)).toEqual(['All methods', 'GCash', 'Maya', 'Card', 'GrabPay', 'BillEase', 'Other'])
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

  it('shows a calendar beside the list when Custom is chosen, takes a range from it, and a preset forgets it', async () => {
    const user = userEvent.setup()
    renderPage()
    await within(table()).findByRole('button', { name: /SF-10001/ })
    const calendar = () => screen.queryByRole('group', { name: 'Choose dates' })
    const rangeBox = () => screen.getByRole('combobox', { name: 'Date range' })
    expect(screen.queryByRole('button', { name: /^Dates/ })).not.toBeInTheDocument() // no extra field in the row

    await choose(user, 'Date range', 'Custom')
    expect(where()).toBe('/staff/transactions?range=custom')
    // the list stays open with the calendar beside it, like a submenu
    expect(screen.getByRole('listbox')).toBeInTheDocument()
    expect(calendar()).toBeInTheDocument()
    // no payment is dated after today, so later days cannot be picked and there is no month after this one
    expect(screen.getByRole('button', { name: 'Next month' })).toBeDisabled()
    const days = () => screen.getAllByRole('button', { name: /^[A-Za-z]+ \d{1,2}, \d{4}$/ }).filter((day) => !(day as HTMLButtonElement).disabled)
    await user.click(days()[0])
    await waitFor(() => expect(lastParams().from).toBeDefined())
    expect(lastParams().to).toBeUndefined()
    await user.click(days().at(-1)!)
    await waitFor(() => expect(lastParams().to).toBeDefined())
    expect(lastParams().from! <= lastParams().to!).toBe(true)
    expect(where()).toBe(`/staff/transactions?range=custom&from=${lastParams().from}&to=${lastParams().to}`)
    // finishing the range closes both, and the button shows the dates
    expect(calendar()).not.toBeInTheDocument()
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(rangeBox()).toHaveTextContent('–')
    expect(rangeBox()).toHaveFocus()

    await choose(user, 'Date range', 'Today')
    expect(where()).toBe('/staff/transactions?range=today')
    expect(rangeBox()).toHaveTextContent('Today')
  })

  it('closes only the calendar and list on Escape, and hovering another row hides the calendar', async () => {
    const user = userEvent.setup()
    renderPage()
    await within(table()).findByRole('button', { name: /SF-10001/ })
    await choose(user, 'Date range', 'Custom')
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('group', { name: 'Choose dates' })).not.toBeInTheDocument()
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Date range' })).toHaveFocus()

    await user.click(screen.getByRole('combobox', { name: 'Date range' }))
    await user.click(await screen.findByRole('option', { name: 'Custom' })) // already custom: just shows the calendar
    expect(screen.getByRole('group', { name: 'Choose dates' })).toBeInTheDocument()
    await user.hover(screen.getByRole('option', { name: 'Today' }))
    expect(screen.queryByRole('group', { name: 'Choose dates' })).not.toBeInTheDocument()
  })

  it('ignores a bad or backwards custom range in the URL', async () => {
    renderPage('?range=custom&from=2026-10-05&to=2026-10-01')
    await within(table()).findByRole('button', { name: /SF-10001/ })
    expect(lastParams().from).toBeUndefined()
    expect(lastParams().to).toBeUndefined()
    expect(screen.getByRole('combobox', { name: 'Date range' })).toHaveTextContent('Custom')
    expect(screen.queryByRole('group', { name: 'Choose dates' })).not.toBeInTheDocument() // arriving on a custom page does not pop the calendar open
  })

  it('keeps the previous rows, dimmed, while the next request loads', async () => {
    const user = userEvent.setup()
    renderPage()
    await within(table()).findByRole('button', { name: /SF-10001/ })
    const next = deferred<AdminTransactionsPage>()
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

  it('opens a payment in a drawer with its provider, reference, amount, fee and net, closes on Escape and returns focus', async () => {
    const user = userEvent.setup()
    renderPage()
    const opener = await within(table()).findByRole('button', { name: /SF-10001/ })
    expect(detail).not.toHaveBeenCalled()

    await user.click(opener)
    const drawer = await screen.findByRole('dialog', { name: 'SF-10001' })
    // The header comes from the list row before the detail arrives.
    expect(within(drawer).getByText('Customer 1')).toBeInTheDocument()
    expect(within(drawer).getAllByText(/^Oct 22, 2026, 3:45\sPM$/)[0]).toBeInTheDocument()
    const field = async (label: string) => (await within(drawer).findByText(label)).nextElementSibling as HTMLElement
    expect(await field('Provider')).toHaveTextContent('PayMongo')
    expect(detail).toHaveBeenCalledWith(order(1).id, expect.anything())
    expect(await field('Method')).toHaveTextContent('GCash')
    expect(await field('Reference')).toHaveTextContent('pay_1')
    expect(await field('Amount')).toHaveTextContent('₱4,580.00')
    expect(await field('Fee')).toHaveTextContent('₱114.50')
    expect(await field('Net')).toHaveTextContent('₱4,465.50')
    expect(await field('Created')).toHaveTextContent(/^Oct 22, 2026, 3:45\sPM$/)
    expect(await field('Updated')).toHaveTextContent(/^Oct 22, 2026, 3:46\sPM$/)
    expect(await field('Order total')).toHaveTextContent('₱4,580.00')
    expect(await field('Email')).toHaveTextContent('customer1@example.com')
    expect(within(drawer).getByRole('link', { name: 'Open in Online orders' })).toHaveAttribute('href', '/staff/online-orders?q=SF-10001')

    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(opener).toHaveFocus()
  })

  it('shows a skeleton in the drawer while the payment loads', async () => {
    const user = userEvent.setup()
    const pending = deferred<AdminTransactionDetail>()
    detail.mockReturnValue(pending.promise)
    renderPage()
    await user.click(await within(table()).findByRole('button', { name: /SF-10001/ }))
    const drawer = await screen.findByRole('dialog', { name: 'SF-10001' })
    expect(within(drawer).getByRole('status', { name: 'Loading payment details' })).toBeInTheDocument()
    pending.resolve(detailOf(order(1)))
    expect(await within(drawer).findByText('Provider')).toBeInTheDocument()
    expect(within(drawer).queryByRole('status', { name: 'Loading payment details' })).not.toBeInTheDocument()
  })

  it('says Not reported for a fee and net the gateway has not sent', async () => {
    const user = userEvent.setup()
    detail.mockResolvedValue(detailOf(order(1, { fee: null, net: null }), { fee: null, net: null }))
    renderPage()
    await user.click(await within(table()).findByRole('button', { name: /SF-10001/ }))
    const drawer = await screen.findByRole('dialog', { name: 'SF-10001' })
    expect((await within(drawer).findByText('Fee')).nextElementSibling).toHaveTextContent('Not reported')
    expect(within(drawer).getByText('Net').nextElementSibling).toHaveTextContent('Not reported')
  })

  it('keeps the gateway payload collapsed, hides its secrets, and shows markup in it as plain text', async () => {
    const user = userEvent.setup()
    detail.mockResolvedValue(detailOf(order(1), { payload: { note: '<img src=x onerror=alert(1)>', data: { client_key: 'pay_secret_client', keep: 'visible' } } }))
    renderPage()
    await user.click(await within(table()).findByRole('button', { name: /SF-10001/ }))
    const drawer = await screen.findByRole('dialog', { name: 'SF-10001' })
    const summary = await within(drawer).findByText('Gateway payload (JSON)')
    expect(summary.closest('details')).not.toHaveAttribute('open')
    const json = drawer.querySelector('pre')!
    expect(json).toHaveTextContent('<img src=x onerror=alert(1)>')
    expect(json).toHaveTextContent('"client_key": "[hidden]"')
    expect(json).toHaveTextContent('"keep": "visible"')
    expect(json.textContent).not.toContain('pay_secret_client')
    expect(drawer.querySelector('img')).toBeNull()
    expect(json.className).toContain('max-h-80')
  })

  it('says when the gateway sent no payload', async () => {
    const user = userEvent.setup()
    detail.mockResolvedValue(detailOf(order(1), { payload: {} }))
    renderPage()
    await user.click(await within(table()).findByRole('button', { name: /SF-10001/ }))
    const drawer = await screen.findByRole('dialog', { name: 'SF-10001' })
    expect(await within(drawer).findByText('No payload recorded')).toBeInTheDocument()
    expect(drawer.querySelector('pre')).toBeNull()
  })

  it('shows the order\'s items and an Invoice button for a real payment, built from the order', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(await within(table()).findByRole('button', { name: /SF-10001/ }))
    const drawer = await screen.findByRole('dialog', { name: 'SF-10001' })
    await within(drawer).findByText('Provider')
    expect(await within(drawer).findByText('Heritage Polo')).toBeInTheDocument()
    expect(orderDetail).toHaveBeenCalledWith(order(1).orderId, expect.anything())
    expect(within(drawer).getByText('Items')).toBeInTheDocument()
    expect(within(drawer).getByText('Subtotal')).toBeInTheDocument()
    await waitFor(() => expect(within(drawer).getByRole('button', { name: 'Invoice' })).toBeEnabled())
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

  it('copies the payment reference', async () => {
    const user = userEvent.setup()
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    renderPage()
    await user.click(await within(table()).findByRole('button', { name: /SF-10001/ }))
    const drawer = await screen.findByRole('dialog', { name: 'SF-10001' })
    await user.click(await within(drawer).findByRole('button', { name: 'Copy payment reference ID' }))
    expect(writeText).toHaveBeenCalledWith('pay_1')
    expect(await screen.findByText('ID copied')).toBeInTheDocument()
  })

  it('offers a retry when the payment details fail to load', async () => {
    const user = userEvent.setup()
    detail.mockRejectedValueOnce(new ProductListError('server'))
    renderPage()
    await user.click(await within(table()).findByRole('button', { name: /SF-10001/ }))
    const drawer = await screen.findByRole('dialog')
    expect(await within(drawer).findByRole('alert')).toHaveTextContent("We couldn't load the payment details.")
    // The header from the list row is still there.
    expect(within(drawer).getByText('Customer 1')).toBeInTheDocument()
    await user.click(within(drawer).getByRole('button', { name: 'Retry' }))
    expect(await within(drawer).findByText('Provider')).toBeInTheDocument()
  })

  it('says a payment that is gone no longer exists, with a retry', async () => {
    const user = userEvent.setup()
    detail.mockRejectedValueOnce(new ProductListError('not-found'))
    renderPage()
    await user.click(await within(table()).findByRole('button', { name: /SF-10001/ }))
    const drawer = await screen.findByRole('dialog')
    expect(await within(drawer).findByRole('alert')).toHaveTextContent('This transaction no longer exists.')
    await user.click(within(drawer).getByRole('button', { name: 'Retry' }))
    expect(await within(drawer).findByText('Provider')).toBeInTheDocument()
    expect(detail).toHaveBeenCalledTimes(2)
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
    expect(metrics).not.toHaveBeenCalled()
    expect(screen.getByText('Sample data')).toBeInTheDocument()
  })

  it('searches by order number and opens the payment with its items and an Invoice button', async () => {
    const user = userEvent.setup()
    renderPage('?q=sf-10001')
    const open = await within(table()).findByRole('button', { name: /SF-10001/ }, { timeout: 3000 })
    expect(within(table()).getAllByRole('row')).toHaveLength(2)
    await user.click(open)
    const drawer = await screen.findByRole('dialog', { name: 'SF-10001' })
    expect(await within(drawer).findByRole('table', {}, { timeout: 3000 })).toBeInTheDocument()
    expect(within(drawer).getByText('Subtotal')).toBeInTheDocument()
    expect(within(drawer).getByText('Provider')).toBeInTheDocument()
    expect(within(drawer).getByRole('button', { name: 'Invoice' })).toBeInTheDocument()
  })
})
