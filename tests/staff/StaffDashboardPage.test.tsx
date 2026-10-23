import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MotionGlobalConfig } from 'motion/react'
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Me } from '../../src/service/fetchMe'
import * as analytics from '../../src/service/fetchStaffAnalytics'
import { StaffDashboardPage } from '../../src/views/staff/StaffDashboardPage'

vi.mock('../../src/service/fetchStaffAnalytics', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/service/fetchStaffAnalytics')>()),
  fetchStaffSummary: vi.fn(),
  fetchSalesSeries: vi.fn(),
  fetchProductMix: vi.fn(),
  fetchTrendingItems: vi.fn(),
  fetchOrderLog: vi.fn(),
}))

const ME = { firstName: 'Sam' } as Me
const ORDERS = Array.from({ length: 20 }, (_, n) => ({
  orderId: `SF-${10020 - n}`,
  customerName: `Customer ${20 - n}`,
  placedAt: new Date(Date.UTC(2026, 9, 22, 7, 45 - n)).toISOString(),
  itemCount: 2,
  total: 1990,
}))

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
  vi.mocked(analytics.fetchStaffSummary).mockResolvedValue({ arSessions: 37, salesTotal: 482350, orderCount: 96, unitsSold: 214, periodStart: '2026-10-01', periodEnd: '2026-10-22' })
  vi.mocked(analytics.fetchSalesSeries).mockResolvedValue([
    { date: '2026-10-20', total: 1000 },
    { date: '2026-10-21', total: 4000 },
    { date: '2026-10-22', total: 2500 },
  ])
  vi.mocked(analytics.fetchProductMix).mockResolvedValue([
    { category: 'Tops', units: 60 },
    { category: 'Bottoms', units: 40 },
  ])
  vi.mocked(analytics.fetchTrendingItems).mockResolvedValue([
    { productId: 'p1', name: 'Washed Black Tee', category: 'Tops', orders: 30, stock: 20, arConversion: 42 },
    { productId: 'p2', name: 'Weekend Tapered Jean', category: 'Bottoms', orders: 12, stock: 3, arConversion: 0 },
    { productId: 'p3', name: 'Atelier Gown', category: 'Dresses', orders: 1, stock: 0, arConversion: null },
  ])
  vi.mocked(analytics.fetchOrderLog).mockResolvedValue(ORDERS)
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
    expect(await screen.findByText('Tried AR Fitting')).toBeInTheDocument()
    expect(await screen.findByText('37', { selector: '.sr-only' })).toBeInTheDocument()
    expect(await screen.findByText('₱482,350', { selector: '.sr-only' })).toBeInTheDocument()
    expect(await screen.findByRole('img', { name: /Daily sales, October 20 to 22\. Peak ₱4,000 on Oct 21; total ₱7,500\./ })).toBeInTheDocument()
    expect((await screen.findAllByText('Tops')).length).toBeGreaterThan(0)
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

  it('lists orders in the order given, eight at a time', async () => {
    renderPage()
    const log = await screen.findByRole('list', { description: 'Newest first' })
    expect(within(log).getAllByRole('listitem')).toHaveLength(8)
    expect(within(log).getAllByRole('listitem')[0]).toHaveTextContent('Customer 20')
    await userEvent.click(screen.getByRole('button', { name: 'View more' }))
    expect(within(log).getAllByRole('listitem')).toHaveLength(16)
    expect(within(log).getAllByRole('listitem')[8]).toHaveTextContent('Customer 12')
  })

  it('puts a one-line description under each tile title', async () => {
    renderPage()
    await screen.findByRole('list', { description: 'Newest first' })
    for (const [title, text] of [
      ['Sales this month', 'Daily totals since the 1st'],
      ['Products sold', 'Units by category this month'],
      ['Trendy items', 'Most ordered items this month'],
      ['Recent orders', 'Newest first'],
    ]) {
      const heading = screen.getByRole('heading', { name: title })
      expect(document.getElementById(`${heading.id}-desc`)).toHaveTextContent(text)
    }
  })

  it('pins a category from the donut legend and shows its units and share in the centre', async () => {
    renderPage()
    const region = await screen.findByRole('region', { name: 'Products sold' })
    const row = within(region).getByRole('button', { name: /Bottoms/ })
    expect(row).toHaveAttribute('aria-pressed', 'false')
    await userEvent.click(row)
    expect(row).toHaveAttribute('aria-pressed', 'true')
    expect(within(region).getByText('Bottoms · 40%')).toBeInTheDocument()
    // The pointer is still over the row, so it keeps previewing; only the pin is released.
    await userEvent.click(row)
    expect(row).toHaveAttribute('aria-pressed', 'false')
  })

  it('offers the daily values as a table', async () => {
    renderPage()
    const table = await screen.findByRole('table', { name: /Daily sales/, hidden: true })
    expect(within(table).getAllByRole('row', { hidden: true })).toHaveLength(4)
  })

  it('fails and retries one section without breaking the others', async () => {
    vi.mocked(analytics.fetchSalesSeries).mockRejectedValueOnce(Object.assign(new Error('x'), { kind: 'network' }))
    renderPage()
    expect(await screen.findByText("We couldn't load the sales chart.")).toBeInTheDocument()
    expect(await screen.findByText('Washed Black Tee')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByRole('img', { name: /Daily sales/ })).toBeInTheDocument()
  })

  it('shows an empty state with a next step when there are no orders', async () => {
    vi.mocked(analytics.fetchSalesSeries).mockResolvedValue([{ date: '2026-10-01', total: 0 }])
    vi.mocked(analytics.fetchProductMix).mockResolvedValue([])
    vi.mocked(analytics.fetchTrendingItems).mockResolvedValue([])
    vi.mocked(analytics.fetchOrderLog).mockResolvedValue([])
    renderPage()
    expect(await screen.findByText('No orders yet this month. Sales show here once the first order is placed.')).toBeInTheDocument()
    expect(await screen.findByText(/No orders yet\. Customers who order show here/)).toBeInTheDocument()
  })
})
