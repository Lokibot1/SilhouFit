import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MotionGlobalConfig } from 'motion/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { TransactionTotalsSkeleton } from '../../src/components/staff/TransactionsSkeleton'
import { TransactionTotals } from '../../src/components/staff/transactions/TransactionTotals'
import { ToastProvider } from '../../src/components/toast/ToastProvider'
import type { PaginatedTransactions, TransactionExportRow, TransactionListItem } from '../../src/service/fetchTransactions'
import { sampleTransactionExport, sampleTransactionList, sampleTransactionSummary } from '../../src/service/sampleTransactions'
import { manilaToday } from '../../src/utils/period'
import { StaffTransactionsPage } from '../../src/views/staff/StaffTransactionsPage'

vi.mock('../../src/service/sampleTransactions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/service/sampleTransactions')>()),
  sampleTransactionList: vi.fn(),
  sampleTransactionSummary: vi.fn(),
  sampleTransactionExport: vi.fn(),
}))

const list = vi.mocked(sampleTransactionList)
const summary = vi.mocked(sampleTransactionSummary)
const exportRows = vi.mocked(sampleTransactionExport)

const order = (n: number): TransactionListItem => ({
  id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
  orderNo: `SF-${10000 + n}`,
  customerName: `Customer ${n}`,
  placedAt: '2026-10-22T07:45:00.000Z',
  itemCount: 3,
  total: 4580,
})
const answer = (items: TransactionListItem[], total = items.length): PaginatedTransactions => ({
  data: items,
  meta: { total, page: 1, limit: 25, totalPages: Math.max(1, Math.ceil(total / 25)), hasNextPage: false, hasPreviousPage: false },
})
const csvRows: TransactionExportRow[] = [1, 2, 3].map((n) => ({ ...order(n), vat: 490.71, ...(n === 1 && { invoiceNo: 'SI-0000001' }) }))

const saved: { name: string; blob: Blob }[] = []

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
  list.mockResolvedValue(answer([order(1), order(2)], 3))
  summary.mockResolvedValue({ count: 1234, gross: 2283000, vat: 244607.14, returnedCount: 0 })
  exportRows.mockResolvedValue(csvRows)
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

const totals = () => screen.findByLabelText('Totals for the matching transactions')

describe('the totals strip', () => {
  it('shows the count, gross sales, VAT portion and average order of the filtered range', async () => {
    renderPage('?range=today')
    const strip = await totals()
    await waitFor(() => expect(summary).toHaveBeenCalled())
    const today = manilaToday().date
    expect(summary.mock.calls[0][0]).toEqual({ search: undefined, from: today, to: today })
    expect(within(strip).getByText('Orders').nextSibling).toHaveTextContent('1,234')
    expect(within(strip).getByText('Gross sales').nextSibling).toHaveTextContent('₱2,283,000')
    expect(within(strip).getByText('VAT (12%)').nextSibling).toHaveTextContent('₱244,607')
    expect(within(strip).getByText('Avg. order').nextSibling).toHaveTextContent('₱1,850')
  })

  it('does not ask again when only the page or sort changes', async () => {
    const user = userEvent.setup()
    renderPage('?q=maria')
    await totals()
    await user.click(await screen.findByRole('button', { name: /Total/ }))
    await waitFor(() => expect(list.mock.calls.length).toBeGreaterThan(1))
    expect(summary).toHaveBeenCalledTimes(1)
    expect(summary.mock.calls[0][0]).toMatchObject({ search: 'maria' })
  })

  it('is hidden when nothing matches', async () => {
    list.mockResolvedValue(answer([], 0))
    summary.mockResolvedValue({ count: 0, gross: 0, vat: 0, returnedCount: 0 })
    renderPage('?q=zzz')
    expect(await screen.findByText('No transactions match')).toBeInTheDocument()
    expect(screen.queryByLabelText('Totals for the matching transactions')).not.toBeInTheDocument()
  })

  it('keeps its own error with a retry, and the list stays', async () => {
    const user = userEvent.setup()
    summary.mockRejectedValueOnce(Object.assign(new Error('x'), { kind: 'network' }))
    renderPage()
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent("We couldn't load the totals.")
    expect((await screen.findAllByRole('button', { name: /SF-10001/ })).length).toBeGreaterThan(0)
    await user.click(within(alert).getByRole('button', { name: 'Retry' }))
    expect(await screen.findByLabelText('Totals for the matching transactions')).toBeInTheDocument()
  })

  it('has a skeleton with the same grid and tiles, so nothing shifts when it loads', () => {
    const realWrap = render(<TransactionTotals summary={{ count: 1, gross: 1, vat: 0, returnedCount: 0 }} stale={false} />).container.firstElementChild as HTMLElement
    const skeletonWrap = render(<TransactionTotalsSkeleton />).container.firstElementChild as HTMLElement
    const base = (el: Element) => el.className.split(/\s+/).filter((c) => c && !['animate-pulse', 'transition-opacity', 'duration-150'].includes(c)).sort()
    expect(base(skeletonWrap)).toEqual(base(realWrap))
    const real = realWrap.firstElementChild as HTMLElement
    const skeleton = skeletonWrap.firstElementChild as HTMLElement
    expect(base(skeleton)).toEqual(base(real))
    expect(skeleton.children).toHaveLength(real.children.length)
    expect(base(skeleton.children[0])).toEqual(base(real.children[0]))
  })

  it('dims while the next range loads', () => {
    render(<TransactionTotals summary={{ count: 1, gross: 1, vat: 0, returnedCount: 0 }} stale />)
    expect(screen.getByLabelText('Totals for the matching transactions')).toHaveClass('opacity-60')
  })

  it('sits under the page title, above the table panel and not inside it', async () => {
    renderPage()
    const strip = await totals()
    const panel = screen.getByRole('heading', { level: 2, name: 'Transactions' }).closest('section')!
    expect(panel.contains(strip)).toBe(false)
    expect(strip.compareDocumentPosition(panel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.getByRole('heading', { level: 1 }).compareDocumentPosition(strip) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('counts every order, sums the net of returns, and says how many were returned', async () => {
    summary.mockResolvedValue({ count: 10, gross: 4000, vat: 428.57, returnedCount: 2 })
    renderPage()
    const strip = await totals()
    expect(within(strip).getByText('Orders').nextSibling).toHaveTextContent('10')
    expect(within(strip).getByText('2 returned')).toBeInTheDocument()
    // Net 4,000 over the 8 orders that were kept.
    expect(within(strip).getByText('Avg. order').nextSibling).toHaveTextContent('₱500')
  })

  it('shows no returned caption when nothing was returned', async () => {
    const strip = await (renderPage(), totals())
    expect(within(strip).queryByText(/returned/)).not.toBeInTheDocument()
  })
})

describe('Export CSV', () => {
  it('exports every filtered transaction, not the page, with the filters and sort but no paging', async () => {
    const user = userEvent.setup()
    renderPage('?q=maria&range=week&sort=total&dir=asc&page=2&per=10')
    const button = await screen.findByRole('button', { name: 'Export CSV' })
    await waitFor(() => expect(button).toHaveAttribute('aria-disabled', 'false'))
    await user.click(button)

    await waitFor(() => expect(saved).toHaveLength(1))
    const params = exportRows.mock.calls[0][0]
    expect(params).toMatchObject({ search: 'maria', sortBy: 'total', sortOrder: 'asc' })
    expect(params).not.toHaveProperty('page')
    expect(params).not.toHaveProperty('limit')
    expect(saved[0].name).toBe(`transactions-${manilaToday().date}.csv`)
    const text = await saved[0].blob.text()
    expect(text.split('\r\n').filter(Boolean)).toHaveLength(4)
    expect(text).toContain('SI-0000001')
    expect(await screen.findByText('3 transactions exported')).toBeInTheDocument()
  })

  it('is disabled, and does nothing, when no transaction matches', async () => {
    const user = userEvent.setup()
    list.mockResolvedValue(answer([], 0))
    summary.mockResolvedValue({ count: 0, gross: 0, vat: 0, returnedCount: 0 })
    renderPage('?q=zzz')
    await screen.findByText('No transactions match')
    const button = screen.getByRole('button', { name: 'Export CSV' })
    expect(button).toHaveAttribute('aria-disabled', 'true')
    await user.click(button)
    expect(exportRows).not.toHaveBeenCalled()
  })

  it('says what failed and retries', async () => {
    const user = userEvent.setup()
    exportRows.mockRejectedValueOnce(new Error('network'))
    renderPage()
    const button = await screen.findByRole('button', { name: 'Export CSV' })
    await waitFor(() => expect(button).toHaveAttribute('aria-disabled', 'false'))
    await user.click(button)
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent("Couldn't export the transactions")
    await user.click(within(alert).getByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(saved).toHaveLength(1))
  })
})
