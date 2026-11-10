import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MotionGlobalConfig } from 'motion/react'
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import * as adminOrders from '../../src/service/adminOrdersApi'
import type { Me } from '../../src/service/fetchMe'
import * as analytics from '../../src/service/fetchStaffAnalytics'
import { defaultFilter, describe as describePeriod } from '../../src/utils/period'
import { StaffDashboardPage } from '../../src/views/staff/StaffDashboardPage'

vi.mock('../../src/service/fetchStaffAnalytics', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/service/fetchStaffAnalytics')>()),
  fetchStaffSummary: vi.fn(),
  fetchSalesSeries: vi.fn(),
  fetchProductMix: vi.fn(),
  fetchTrendingItems: vi.fn(),
}))

// The Recent orders tile reads the real orders endpoint; everything else on the dashboard is still sample data.
vi.mock('../../src/service/adminOrdersApi', () => ({ fetchAdminOrders: vi.fn() }))

const ME = { firstName: 'Sam' } as Me
const ORDERS = Array.from({ length: 20 }, (_, n) => ({
  id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
  orderNumber: `SHF-20261022-${String(10020 - n).padStart(6, '0')}`,
  customerName: `Customer ${20 - n}`,
  customerEmail: `customer${20 - n}@example.com`,
  status: 'PAID' as const,
  paymentStatus: 'PAID' as const,
  placedAt: new Date(Date.UTC(2026, 9, 22, 7, 45 - n)).toISOString(),
  itemCount: 2,
  total: 1990,
  shipmentStatus: null,
}))
const answer = (rows: typeof ORDERS) => ({ data: rows, meta: { total: rows.length, page: 1, limit: rows.length, totalPages: 1, hasNextPage: false } })

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true
  // The sections reveal when scrolled into view; jsdom has no IntersectionObserver.
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  )
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} }))
})

beforeEach(() => {
  vi.mocked(analytics.fetchStaffSummary).mockResolvedValue({ arSessions: 37, salesTotal: 482350, aov: 5024.48, arChange: 18.4, salesChange: -8.7, ordersChange: 0, orderCount: 96, unitsSold: 214, periodStart: '2026-10-01', periodEnd: '2026-10-22' })
  vi.mocked(analytics.fetchSalesSeries).mockResolvedValue([
    { date: '2026-08-01', total: 1000 },
    { date: '2026-09-01', total: 4000 },
    { date: '2026-10-01', total: 2500 },
  ])
  vi.mocked(analytics.fetchProductMix).mockResolvedValue([
    { category: 'Hoodie', units: 60 },
    { category: 'Pants', units: 40 },
  ])
  vi.mocked(analytics.fetchTrendingItems).mockResolvedValue([
    { productId: 'p1', name: 'Washed Black Tee', category: 'Hoodie', orders: 30, stock: 20, arConversion: 42 },
    { productId: 'p2', name: 'Weekend Tapered Jean', category: 'Pants', orders: 12, stock: 3, arConversion: 0 },
    { productId: 'p3', name: 'Atelier Gown', category: 'Shorts', orders: 1, stock: 0, arConversion: null },
  ])
  vi.mocked(adminOrders.fetchAdminOrders).mockImplementation(async ({ limit = 10 }) => answer(ORDERS.slice(0, limit)))
})

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/staff']}>
      <Routes>
        <Route element={<Outlet context={{ me: ME }} />}>
          <Route path="staff" element={<StaffDashboardPage />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

describe('StaffDashboardPage', () => {
  it('shows the three figures, the charts and the sample data pill', async () => {
    renderPage()
    expect(await screen.findByText('Hello, Sam')).toBeInTheDocument()
    expect(screen.getByText('Sample data')).toBeInTheDocument()
    expect(await screen.findByText('AR Fitting Sessions')).toBeInTheDocument()
    expect(await screen.findByText('37', { selector: '.sr-only' })).toBeInTheDocument()
    expect(await screen.findByText('₱482,350', { selector: '.sr-only' })).toBeInTheDocument()
    expect(await screen.findByRole('img', { name: /Monthly sales, 2026 so far\. Peak ₱4,000 in September 2026; total ₱7,500\./ })).toBeInTheDocument()
    expect((await screen.findAllByText('Hoodie')).length).toBeGreaterThan(0)
    expect(screen.getByText('60%')).toBeInTheDocument()
    expect(screen.getByText('Washed Black Tee')).toBeInTheDocument()
  })

  it('shows orders, stock and AR Fitting use for each trendy item', async () => {
    renderPage()
    const section = await screen.findByRole('region', { name: 'Trendy items' })
    const rows = await within(section).findAllByRole('listitem')
    expect(rows).toHaveLength(3)
    expect(rows[0]).toHaveTextContent('30 orders')
    expect(rows[0]).toHaveTextContent('42% used AR Fitting')
    expect(rows[0]).toHaveTextContent('In stock')
    expect(rows[1]).toHaveTextContent('Low stock · 3 left')
    expect(rows[1]).toHaveTextContent('0% used AR Fitting')
    expect(rows[2]).toHaveTextContent('1 order')
    expect(rows[2]).not.toHaveTextContent('1 orders')
    expect(rows[2]).toHaveTextContent('No AR Fitting')
    expect(rows[2]).toHaveTextContent('Sold out')
    expect(section).not.toHaveTextContent(/units/i)
  })

  it('lists the newest orders in the order given, in a fixed window with no paging', async () => {
    renderPage()
    const log = await screen.findByRole('list', { description: 'Newest first' })
    expect(within(log).getAllByRole('listitem')).toHaveLength(14)
    expect(within(log).getAllByRole('listitem')[0]).toHaveTextContent('Customer 20')
    expect(within(log).getAllByRole('listitem')[0]).toHaveTextContent('SHF-20261022-010020')
    expect(adminOrders.fetchAdminOrders).toHaveBeenCalledWith({ limit: 14 }, expect.anything())
    expect(screen.queryByRole('button', { name: 'View more' })).not.toBeInTheDocument()
  })

  it('fails and retries the Recent orders tile on its own', async () => {
    vi.mocked(adminOrders.fetchAdminOrders).mockRejectedValueOnce(Object.assign(new Error('x'), { kind: 'server' }))
    renderPage()
    expect(await screen.findByText("We couldn't load the recent orders.")).toBeInTheDocument()
    expect(await screen.findByText('Washed Black Tee')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByText('Customer 20')).toBeInTheDocument()
  })

  it('puts a one-line description under each tile title', async () => {
    renderPage()
    await screen.findByRole('list', { description: 'Newest first' })
    for (const [title, text] of [
      ['Sales', 'Monthly totals · 2026 so far'],
      ['Products sold', describePeriod(defaultFilter(), 'Units by category')],
      ['Trendy items', describePeriod(defaultFilter(), 'Most ordered items')],
      ['Recent orders', 'Newest first'],
    ]) {
      const heading = screen.getByRole('heading', { name: title })
      expect(document.getElementById(`${heading.id}-desc`)).toHaveTextContent(text)
    }
  })

  it('shows up, down and flat changes and the average order value on the stat cards', async () => {
    renderPage()
    expect(await screen.findByText('+18.4%')).toBeInTheDocument()
    expect(screen.getByText('−8.7%')).toBeInTheDocument()
    expect(screen.getByText('0.0%')).toBeInTheDocument()
    expect(screen.getByText(/AOV/)).toHaveTextContent('AOV ₱5,024.48')
    expect(screen.getByText(', up from the same days last month')).toBeInTheDocument()
  })

  it('pins a category from the donut legend and shows its units and share in the centre', async () => {
    renderPage()
    const region = await screen.findByRole('region', { name: 'Products sold' })
    const row = within(region).getByRole('button', { name: /Pants/ })
    expect(row).toHaveAttribute('aria-pressed', 'false')
    await userEvent.click(row)
    expect(row).toHaveAttribute('aria-pressed', 'true')
    expect(within(region).getByText('Pants · 40%')).toBeInTheDocument()
    // The pointer is still over the row, so it keeps previewing; only the pin is released.
    await userEvent.click(row)
    expect(row).toHaveAttribute('aria-pressed', 'false')
  })

  it('offers the monthly values as a table', async () => {
    renderPage()
    const table = await screen.findByRole('table', { name: /Monthly sales/, hidden: true })
    expect(within(table).getAllByRole('row', { hidden: true })).toHaveLength(4)
  })

  it('fails and retries one section without breaking the others', async () => {
    vi.mocked(analytics.fetchSalesSeries).mockRejectedValueOnce(Object.assign(new Error('x'), { kind: 'network' }))
    renderPage()
    expect(await screen.findByText("We couldn't load the sales chart.")).toBeInTheDocument()
    expect(await screen.findByText('Washed Black Tee')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByRole('img', { name: /Monthly sales/ })).toBeInTheDocument()
  })

  it('shows an empty state with a next step when there are no orders', async () => {
    vi.mocked(analytics.fetchSalesSeries).mockResolvedValue([{ date: '2026-10-01', total: 0 }])
    vi.mocked(analytics.fetchProductMix).mockResolvedValue([])
    vi.mocked(analytics.fetchTrendingItems).mockResolvedValue([])
    vi.mocked(adminOrders.fetchAdminOrders).mockResolvedValue(answer([]))
    renderPage()
    expect(await screen.findByText('No orders this year. Sales show here once the first order is placed.')).toBeInTheDocument()
    expect(await screen.findByText(/No orders yet\. Customers who order show here/)).toBeInTheDocument()
    expect(screen.getByText('No products sold this month. The mix shows here once the first order is placed.')).toBeInTheDocument()
    expect(screen.getByText('No orders this month. The most ordered items show here once the first order is placed.')).toBeInTheDocument()
    // The empty cards keep their filters, so another period is one click away.
    expect(screen.getByRole('radiogroup', { name: 'Sales period' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Trendy items year' })).toBeInTheDocument()
  })

  describe('period filter', () => {
    const week = () => within(screen.getByRole('radiogroup', { name: 'Sales period' })).getByRole('radio', { name: 'Weekly' })
    const lastFilter = (fetcher: typeof analytics.fetchSalesSeries) => vi.mocked(fetcher).mock.lastCall?.[0]?.filter

    it('filters one card without touching the others', async () => {
      renderPage()
      await screen.findByRole('img', { name: /Monthly sales/ })
      expect(lastFilter(analytics.fetchSalesSeries)).toMatchObject({ period: 'month' })
      await userEvent.click(week())
      expect(lastFilter(analytics.fetchSalesSeries)).toMatchObject({ period: 'week' })
      expect(analytics.fetchSalesSeries).toHaveBeenCalledTimes(2)
      expect(analytics.fetchProductMix).toHaveBeenCalledTimes(1)
      expect(analytics.fetchTrendingItems).toHaveBeenCalledTimes(1)
      expect(await screen.findByRole('img', { name: /Weekly sales/ })).toBeInTheDocument()
    })

    it('shows a skeleton while loading and keeps the filter in place with its focus', async () => {
      renderPage()
      await screen.findByRole('img', { name: /Monthly sales/ })
      let finish!: (value: { date: string; total: number }[]) => void
      vi.mocked(analytics.fetchSalesSeries).mockReturnValueOnce(new Promise((resolve) => (finish = resolve)))
      week().focus()
      await userEvent.keyboard('{Enter}')
      expect(screen.getByRole('status', { name: 'Loading sales' })).toBeInTheDocument()
      expect(screen.queryByRole('img', { name: /Monthly sales/ })).not.toBeInTheDocument()
      expect(week()).toHaveFocus()
      expect(week()).toHaveAttribute('aria-checked', 'true')
      await act(async () => finish([{ date: '2026-10-19', total: 900 }, { date: '2026-10-20', total: 100 }]))
      expect(await screen.findByRole('img', { name: /Weekly sales/ })).toBeInTheDocument()
      expect(week()).toHaveFocus()
    })

    it('shows the error with the filter present, and Retry asks for the same filter again', async () => {
      renderPage()
      await screen.findByRole('img', { name: /Monthly sales/ })
      vi.mocked(analytics.fetchSalesSeries).mockRejectedValueOnce(Object.assign(new Error('x'), { kind: 'network' }))
      await userEvent.click(week())
      expect(await screen.findByText("We couldn't load the sales chart.")).toBeInTheDocument()
      expect(week()).toHaveAttribute('aria-checked', 'true')
      await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
      expect(lastFilter(analytics.fetchSalesSeries)).toMatchObject({ period: 'week' })
      expect(await screen.findByRole('img', { name: /Weekly sales/ })).toBeInTheDocument()
    })

    it('discards the answer to an earlier choice when a later one is made', async () => {
      renderPage()
      await screen.findByRole('img', { name: /Monthly sales/ })
      let finishWeek!: (value: { date: string; total: number }[]) => void
      vi.mocked(analytics.fetchSalesSeries)
        .mockReturnValueOnce(new Promise((resolve) => (finishWeek = resolve)))
        .mockResolvedValueOnce([{ date: '2026-10-01', total: 500 }, { date: '2026-10-02', total: 700 }])
      await userEvent.click(week())
      await userEvent.click(within(screen.getByRole('radiogroup', { name: 'Sales period' })).getByRole('radio', { name: 'Quarterly' }))
      expect(await screen.findByRole('img', { name: /Peak ₱700/ })).toBeInTheDocument()
      await act(async () => finishWeek([{ date: '2026-10-19', total: 9999 }]))
      expect(screen.getByRole('img', { name: /Peak ₱700/ })).toBeInTheDocument()
      expect(screen.queryByRole('img', { name: /9,999/ })).not.toBeInTheDocument()
    })
  })
})
