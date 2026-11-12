import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ExcelJS from 'exceljs'
import { MotionGlobalConfig } from 'motion/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { TransactionTotalsSkeleton } from '../../src/components/staff/TransactionsSkeleton'
import { TransactionTotals } from '../../src/components/staff/transactions/TransactionTotals'
import { ToastProvider } from '../../src/components/toast/ToastProvider'
import { fetchAdminTransactionMetrics, fetchAdminTransactions, type AdminTransactionMetrics, type AdminTransactionRow, type AdminTransactionsPage } from '../../src/service/adminTransactionsApi'
import { ProductListError } from '../../src/service/fetchProductList'
import { manilaToday } from '../../src/utils/period'
import { StaffTransactionsPage } from '../../src/views/staff/StaffTransactionsPage'

vi.mock('../../src/service/adminTransactionsApi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/service/adminTransactionsApi')>()),
  fetchAdminTransactions: vi.fn(),
  fetchAdminTransactionMetrics: vi.fn(),
}))
vi.mock('../../src/service/ordersApi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/service/ordersApi')>()),
  usesSampleOrders: () => false,
}))

const list = vi.mocked(fetchAdminTransactions)
const metrics = vi.mocked(fetchAdminTransactionMetrics)

const order = (n: number): AdminTransactionRow => ({
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
  fee: null,
  net: null,
  at: '2026-10-22T07:45:00.000Z',
})
const answer = (items: AdminTransactionRow[], total = items.length, page = 1, limit = 25): AdminTransactionsPage => ({
  data: items,
  meta: { total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) },
})
const figures: AdminTransactionMetrics = { totalTransactions: 1234, paidCount: 1000, refundedCount: 100, failedCount: 90, pendingCount: 44, totalGrossVolume: 2283000, totalFeeVolume: 57075, totalNetVolume: 2225925 }

/** A server of `total` payments that pages the way the API does. */
const serve = (total: number) =>
  list.mockImplementation(async ({ page = 1, limit = 25 }) => {
    const from = (page - 1) * limit
    const rows = Array.from({ length: Math.max(0, Math.min(limit, total - from)) }, (_, n) => order(from + n + 1))
    return answer(rows, total, page, limit)
  })

const saved: { name: string; blob: Blob }[] = []

/** The exported workbook's Transactions sheet: a title block and header (7 rows), then the payments, then Total and Count. */
const sheetOf = async (blob: Blob) => {
  const book = new ExcelJS.Workbook()
  await book.xlsx.load(await blob.arrayBuffer())
  return book.getWorksheet('Transactions')!
}

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true
  Element.prototype.scrollIntoView = vi.fn()
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} }))
  URL.revokeObjectURL = vi.fn()
})

beforeEach(() => {
  saved.length = 0
  vi.resetAllMocks()
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    saved[saved.length - 1].name = this.download
  })
  URL.createObjectURL = vi.fn((blob: Blob) => {
    saved.push({ name: '', blob })
    return 'blob:test'
  })
  serve(3)
  metrics.mockResolvedValue(figures)
})

function renderPage(search = '') {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={[`/staff/transactions${search}`]}>
        <Routes>
          <Route path="staff/transactions" element={<StaffTransactionsPage />} />
        </Routes>
      </MemoryRouter>
    </ToastProvider>,
  )
}

const totals = () => screen.findByLabelText('Totals across all transactions')
const exportButton = async () => {
  const button = await screen.findByRole('button', { name: 'Export Excel' })
  return button
}
/** The requests the export made: the page walk, which asks for 100 at a time. */
const walk = () => list.mock.calls.map(([params]) => params).filter((params) => params.limit === 100)

describe('the totals strip', () => {
  it('shows every payment, the paid volumes, fees and net, whatever the filters', async () => {
    renderPage('?range=today&status=FAILED')
    const strip = await totals()
    await waitFor(() => expect(metrics).toHaveBeenCalled())
    expect(within(strip).getByText('Transactions').nextSibling).toHaveTextContent('1,234')
    expect(within(strip).getByText('44 pending · 90 failed')).toBeInTheDocument()
    expect(within(strip).getByText('Paid volume').closest('div')).toHaveTextContent('₱2,283,000')
    expect(within(strip).getByText('1,000 paid · 100 refunded')).toBeInTheDocument()
    expect(within(strip).getByText('Fees').nextSibling).toHaveTextContent('₱57,075')
    expect(within(strip).getByText('Net').nextSibling).toHaveTextContent('₱2,225,925')
    expect(within(strip).getAllByText('Paid payments only')).toHaveLength(2)
  })

  it('explains on the Paid volume label that totals count paid payments only and ignore the filters', async () => {
    const user = userEvent.setup()
    renderPage()
    const strip = await totals()
    await user.hover(within(strip).getByText('Paid volume'))
    expect(await screen.findByText(/count paid payments only/)).toHaveTextContent(/ignore the filters/)
  })

  it('asks once, and not again when a filter, the page or the sort changes', async () => {
    const user = userEvent.setup()
    renderPage('?q=maria')
    await totals()
    await user.click(await screen.findByRole('button', { name: /Amount/ }))
    await waitFor(() => expect(list.mock.calls.length).toBeGreaterThan(1))
    expect(metrics).toHaveBeenCalledTimes(1)
  })

  it('stays when a search matches nothing, and is hidden only when there are no payments at all', async () => {
    list.mockResolvedValue(answer([], 0))
    const { unmount } = renderPage('?q=zzz')
    expect(await screen.findByText('No transactions match')).toBeInTheDocument()
    expect(await totals()).toBeInTheDocument()
    unmount()

    metrics.mockResolvedValue({ ...figures, totalTransactions: 0 })
    renderPage()
    expect(await screen.findByText('No transactions yet')).toBeInTheDocument()
    await waitFor(() => expect(metrics).toHaveBeenCalledTimes(2))
    expect(screen.queryByLabelText('Totals across all transactions')).not.toBeInTheDocument()
  })

  it('keeps its own error with a retry, and the list stays', async () => {
    const user = userEvent.setup()
    metrics.mockRejectedValueOnce(new ProductListError('network'))
    renderPage()
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent("We couldn't load the totals.")
    expect((await screen.findAllByRole('button', { name: /SF-10001/ })).length).toBeGreaterThan(0)
    await user.click(within(alert).getByRole('button', { name: 'Retry' }))
    expect(await totals()).toBeInTheDocument()
  })

  it('has a skeleton with the same grid and tiles, so nothing shifts when it loads', () => {
    const realWrap = render(<TransactionTotals metrics={figures} stale={false} />).container.firstElementChild as HTMLElement
    const skeletonWrap = render(<TransactionTotalsSkeleton />).container.firstElementChild as HTMLElement
    const base = (el: Element) => el.className.split(/\s+/).filter((c) => c && !['animate-pulse', 'transition-opacity', 'duration-150'].includes(c)).sort()
    expect(base(skeletonWrap)).toEqual(base(realWrap))
    const real = realWrap.firstElementChild as HTMLElement
    const skeleton = skeletonWrap.firstElementChild as HTMLElement
    expect(base(skeleton)).toEqual(base(real))
    expect(skeleton.children).toHaveLength(real.children.length)
    expect(base(skeleton.children[0])).toEqual(base(real.children[0]))
  })

  it('dims while the totals load again', () => {
    render(<TransactionTotals metrics={figures} stale />)
    expect(screen.getByLabelText('Totals across all transactions')).toHaveClass('opacity-60')
  })

  it('sits under the page title, above the table panel and not inside it', async () => {
    renderPage()
    const strip = await totals()
    const panel = screen.getByRole('heading', { level: 2, name: 'Transactions' }).closest('section')!
    expect(panel.contains(strip)).toBe(false)
    expect(strip.compareDocumentPosition(panel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.getByRole('heading', { level: 1 }).compareDocumentPosition(strip) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})

describe('Export Excel', () => {
  it('walks the pages one request at a time and joins them into one file, with the filters and sort', async () => {
    const user = userEvent.setup()
    serve(150)
    renderPage('?q=maria&range=week&status=PAID&sort=total&dir=asc&page=2&per=10')
    const button = await exportButton()
    await waitFor(() => expect(button).toHaveAttribute('aria-disabled', 'false'))
    await user.click(button)

    await waitFor(() => expect(saved).toHaveLength(1))
    expect(walk()).toHaveLength(2)
    expect(walk().map((params) => params.page)).toEqual([1, 2])
    expect(walk()[0]).toMatchObject({ search: 'maria', status: 'PAID', sortBy: 'amount', sortOrder: 'asc', limit: 100 })
    expect(saved[0].name).toBe(`transactions-${manilaToday().date}.xlsx`)
    expect(saved[0].blob.type).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    const sheet = await sheetOf(saved[0].blob)
    expect(sheet.getCell('A1').value).toBe('KRAL Transactions')
    expect(sheet.getCell('B4').value).toBe('Search "maria"; Status Paid; Dates Last 7 days')
    expect(sheet.getCell('B5').value).toBe(150)
    expect(sheet.getCell('A7').value).toBe('Order No.')
    expect(sheet.getCell('B7').value).toBe('Date (Manila)')
    expect(sheet.getCell('A8').value).toBe('SF-10001')
    expect(sheet.getCell('A157').value).toBe('SF-10150')
    expect(sheet.getCell('A158').value).toBe('Total')
    expect(await screen.findByText('150 transactions exported')).toBeInTheDocument()
  })

  it('is off above 1,000 matches, says why on hover, and does nothing when pressed', async () => {
    const user = userEvent.setup()
    serve(1001)
    renderPage()
    const button = await exportButton()
    await waitFor(() => expect(button).toHaveAttribute('aria-disabled', 'true'))
    await screen.findByText(/Displaying 1–25 of 1,?001/)
    const calls = list.mock.calls.length
    await user.click(button)
    expect(list.mock.calls.length).toBe(calls)
    await user.unhover(button)
    await user.hover(button)
    expect(await screen.findByText('Narrow the filters to 1,000 transactions or fewer to export')).toBeInTheDocument()
  })

  it('exports exactly 1,000 matches, stopping at the cap', async () => {
    const user = userEvent.setup()
    serve(1000)
    renderPage()
    const button = await exportButton()
    await waitFor(() => expect(button).toHaveAttribute('aria-disabled', 'false'))
    await user.click(button)
    await waitFor(() => expect(saved).toHaveLength(1), { timeout: 3000 })
    expect(walk()).toHaveLength(10)
    expect((await sheetOf(saved[0].blob)).getCell('B5').value).toBe(1000)
  })

  it('is disabled, and does nothing, when no transaction matches', async () => {
    const user = userEvent.setup()
    list.mockResolvedValue(answer([], 0))
    renderPage('?q=zzz')
    await screen.findByText('No transactions match')
    const button = screen.getByRole('button', { name: 'Export Excel' })
    expect(button).toHaveAttribute('aria-disabled', 'true')
    await user.click(button)
    expect(walk()).toHaveLength(0)
  })

  it('makes no file when a page fails part way, says what failed, and retries from the start', async () => {
    const user = userEvent.setup()
    serve(150)
    renderPage()
    const button = await exportButton()
    await waitFor(() => expect(button).toHaveAttribute('aria-disabled', 'false'))
    const serving = list.getMockImplementation()!
    list.mockImplementation(async (params, options) => {
      if (params.limit === 100 && params.page === 2) throw new ProductListError('rate-limit')
      return serving(params, options)
    })
    await user.click(button)
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent("Couldn't export the transactions")
    expect(saved).toHaveLength(0)

    list.mockImplementation(serving)
    await user.click(within(alert).getByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(saved).toHaveLength(1))
    expect((await sheetOf(saved[0].blob)).getCell('B5').value).toBe(150)
  })
})
