import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import * as service from '../../src/service/arInsights'
import { getSampleProducts, setSampleProducts } from '../../src/service/fetchStaffAnalytics'
import { ArInsightsPage } from '../../src/views/admin/ArInsightsPage'
import { renderAdmin, setUpAdminDom } from '../shared/adminSession'

vi.mock('../../src/service/simulateRequest', () => ({ simulateRequest: () => Promise.resolve({ ok: true }) }))
vi.mock('../../src/service/arInsights', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../src/service/arInsights')>()
  return {
    ...real,
    getArSummary: vi.fn(real.getArSummary),
    getArSessionsSeries: vi.fn(real.getArSessionsSeries),
    getArTopProducts: vi.fn(real.getArTopProducts),
    getArFitBreakdown: vi.fn(real.getArFitBreakdown),
    getSizeAgreement: vi.fn(real.getSizeAgreement),
    getNotArReady: vi.fn(real.getNotArReady),
  }
})

const PATH = '/admin/ar-insights'
const original = getSampleProducts()

beforeAll(setUpAdminDom)
afterEach(() => {
  vi.clearAllMocks()
  setSampleProducts(original)
})

const section = (name: string) => screen.findByRole('region', { name })

describe('AR Fitting Insights page', () => {
  it('shows the figures, the chart and every list from the sample data', async () => {
    renderAdmin(<ArInsightsPage />, PATH)
    expect(screen.getByRole('heading', { level: 1, name: 'AR Fitting Insights' })).toBeInTheDocument()
    expect(document.title).toBe('AR Fitting Insights — SilhouFit')

    const cards = await section('AR Fitting at a glance')
    for (const label of ['AR sessions', 'Try-on to purchase', 'AR-ready coverage', 'Average fit score']) expect(await within(cards).findByText(label)).toBeInTheDocument()
    expect(within(cards).getByRole('link', { name: /^AR-ready coverage: 67%, / })).toHaveAttribute('href', '/admin/inventory?ar=yes')

    expect(await screen.findByRole('img', { name: /AR sessions, .* so far\. Peak/ })).toBeInTheDocument()

    const top = await section('Most tried on')
    const rows = await within(top).findAllByRole('row')
    // The header, then the eight AR-ready sample products.
    expect(rows).toHaveLength(9)
    expect(within(top).getByRole('columnheader', { name: 'Try-ons' })).toBeInTheDocument()

    const fit = await section('Fit results')
    expect(await within(fit).findByText('Good fit')).toBeInTheDocument()
    const size = await section('Size advice followed')
    expect(await within(size).findByText('Same size')).toBeInTheDocument()

    const notReady = await section('Not AR-ready')
    expect(await within(notReady).findByText('Coach Jacket')).toBeInTheDocument()
    expect(within(notReady).getByRole('link', { name: 'Open Coach Jacket in inventory' })).toHaveAttribute('href', '/admin/inventory?ar=no&q=Coach%20Jacket')
  })

  it('says so when nothing was tried on and every product is AR-ready', async () => {
    setSampleProducts(original.map((p) => ({ ...p, arReady: true })))
    vi.mocked(service.getArSessionsSeries).mockResolvedValueOnce([{ date: '2026-01-01', sessions: 0 }])
    vi.mocked(service.getArTopProducts).mockResolvedValueOnce([])
    vi.mocked(service.getSizeAgreement).mockResolvedValueOnce({ recommended: 0, purchasedSame: 0, purchasedLarger: 0, purchasedSmaller: 0 })
    renderAdmin(<ArInsightsPage />, PATH)

    expect(await screen.findByText(/^No AR sessions /)).toBeInTheDocument()
    expect(await screen.findByText(/^No products were tried on /)).toBeInTheDocument()
    expect(await screen.findByText(/^No purchases after a size recommendation /)).toBeInTheDocument()
    expect(await screen.findByText('Every product can be tried on.')).toBeInTheDocument()
  })

  it('keeps the other sections when one fails, and loads it again on Retry', async () => {
    vi.mocked(service.getArTopProducts).mockRejectedValueOnce(Object.assign(new Error('network'), { kind: 'network' }))
    renderAdmin(<ArInsightsPage />, PATH)

    const top = await section('Most tried on')
    expect(await within(top).findByText("We couldn't load the most tried on products.")).toBeInTheDocument()
    // The rest of the page rendered.
    expect(await screen.findByText('Good fit')).toBeInTheDocument()
    expect(await screen.findByText('Coach Jacket')).toBeInTheDocument()
    expect(within(await section('AR Fitting at a glance')).getByText('AR sessions')).toBeInTheDocument()

    await userEvent.click(within(top).getByRole('button', { name: 'Retry' }))
    expect(await within(top).findByRole('table')).toBeInTheDocument()
    expect(within(top).queryByRole('alert')).toBeNull()
  })

  it('asks every period-dependent section again when the period changes, but not the product list', async () => {
    renderAdmin(<ArInsightsPage />, PATH)
    await screen.findByText('Good fit')
    await screen.findByText('Same size')
    expect(service.getArSummary).toHaveBeenCalledTimes(1)

    await userEvent.click(screen.getByRole('radio', { name: 'Week' }))

    const week = expect.objectContaining({ filter: expect.objectContaining({ period: 'week' }) })
    await waitFor(() => {
      for (const call of [service.getArSummary, service.getArSessionsSeries, service.getArTopProducts, service.getArFitBreakdown, service.getSizeAgreement]) {
        expect(call).toHaveBeenLastCalledWith(week)
      }
    })
    expect(service.getNotArReady).toHaveBeenCalledTimes(1)
  })
})
