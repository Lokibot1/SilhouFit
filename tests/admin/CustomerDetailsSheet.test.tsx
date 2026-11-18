import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { CustomerDetailsSheet } from '../../src/components/admin/users/CustomerDetailsSheet'
import { getModerationStatus } from '../../src/service/moderation'
import type { CustomerAccount } from '../../src/types/accounts'
import { renderAdmin, resetAdminAccounts, setUpAdminDom } from '../shared/adminSession'

vi.mock('../../src/service/simulateRequest', () => ({ simulateRequest: () => Promise.resolve({ ok: true }) }))

const api = vi.hoisted(() => ({ fetchUserOrders: vi.fn(), fetchUserOrderSummary: vi.fn() }))
vi.mock('../../src/service/adminOrdersApi', async (importOriginal) => ({ ...(await importOriginal<typeof import('../../src/service/adminOrdersApi')>()), ...api }))

const row = (n: number, over: Record<string, unknown> = {}) => ({
  id: `o${n}`,
  orderNumber: `SHF-2026${n}`,
  customerName: 'Bea Test',
  customerEmail: 'Bea@example.com',
  status: 'PAID',
  paymentStatus: 'PAID',
  total: 1500 + n,
  itemCount: 1,
  shipmentStatus: null,
  placedAt: '2026-10-26T14:30:00.000Z',
  ...over,
})
const ordersPage = (data: unknown[], over: Record<string, unknown> = {}) => ({ data, meta: { total: data.length, page: 1, limit: 10, totalPages: 1, hasNextPage: false, ...over } })

const customer = (id: string, firstName: string): CustomerAccount => ({ id, role: 'customer', firstName, lastName: 'Test', email: `${firstName}@example.com`, phone: '', status: 'active', createdAt: '2026-01-01T00:00:00.000Z', lastSignInAt: null })

beforeAll(setUpAdminDom)
beforeEach(() => {
  resetAdminAccounts()
  api.fetchUserOrderSummary.mockReset().mockResolvedValue({ totalSpent: 0, totalOrders: 0 })
  api.fetchUserOrders.mockReset().mockResolvedValue(ordersPage([]))
})

describe('CustomerDetailsSheet purchases', () => {
  const open = () => renderAdmin(<CustomerDetailsSheet account={customer('cus-010', 'Carlo')} onClose={() => {}} />)

  it('shows skeletons while loading', () => {
    api.fetchUserOrderSummary.mockReturnValue(new Promise(() => {}))
    api.fetchUserOrders.mockReturnValue(new Promise(() => {}))
    open()
    expect(screen.getByText('Loading purchases')).toBeInTheDocument()
    expect(screen.getByRole('status', { name: 'Loading the total spent' })).toBeInTheDocument()
  })

  it('shows the total spent and each purchase with date, amount and status', async () => {
    api.fetchUserOrderSummary.mockResolvedValue({ totalSpent: 4500.5, totalOrders: 2 })
    api.fetchUserOrders.mockResolvedValue(ordersPage([row(1), row(2, { status: 'CANCELLED', paymentStatus: 'UNPAID' })]))
    open()
    const list = await screen.findByRole('list', { name: 'Purchases, newest first' })
    expect(within(list).getAllByRole('listitem')).toHaveLength(2)
    expect(list.textContent).toMatch(/\b(AM|PM)\b/)
    expect(within(list).getByText('₱1,501.00')).toBeInTheDocument()
    expect(within(list).getByText(/SHF-20261/)).toBeInTheDocument()
    expect(screen.getByText('₱4,500.50')).toBeInTheDocument()
    expect(screen.getByText(/2 orders/)).toBeInTheDocument()
    expect(api.fetchUserOrders).toHaveBeenCalledWith('cus-010', { page: 1, limit: 10 }, expect.anything())
  })

  it('says there are no purchases yet and shows a zero total', async () => {
    open()
    expect(await screen.findByText(/No purchases yet\. Orders this customer places/)).toBeInTheDocument()
    expect(screen.getByText('₱0.00')).toBeInTheDocument()
  })

  it('shows an error with Retry for the failing part only, and Retry asks again', async () => {
    const user = userEvent.setup()
    api.fetchUserOrders.mockRejectedValueOnce(Object.assign(new Error('x'), { kind: 'server' }))
    open()
    expect(await screen.findByText(/We couldn't load the purchases/)).toBeInTheDocument()
    expect(await screen.findByText('₱0.00')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByText(/No purchases yet/)).toBeInTheDocument()
    expect(api.fetchUserOrders).toHaveBeenCalledTimes(2)
  })

  it('pages with Pagination only when there is more than one page', async () => {
    const user = userEvent.setup()
    api.fetchUserOrders.mockResolvedValue(ordersPage([row(1)], { total: 12, totalPages: 2 }))
    open()
    await user.click(await screen.findByRole('button', { name: 'Next' }))
    await waitFor(() => expect(api.fetchUserOrders).toHaveBeenLastCalledWith('cus-010', { page: 2, limit: 10 }, expect.anything()))
  })

  it('keeps the previous rows and the focused pager button while the next page loads', async () => {
    const user = userEvent.setup()
    api.fetchUserOrders.mockResolvedValueOnce(ordersPage([row(1)], { total: 12, totalPages: 2 }))
    open()
    const next = await screen.findByRole('button', { name: 'Next' })
    api.fetchUserOrders.mockReturnValue(new Promise(() => {}))
    await user.click(next)
    expect(screen.getByRole('button', { name: 'Next' })).toBe(next)
    expect(next).toHaveFocus()
    expect(screen.getByRole('list', { name: 'Purchases, newest first' })).toBeInTheDocument()
  })
})

describe('CustomerDetailsSheet', () => {
  it('shows the offenses with 12-hour times and the current status', () => {
    renderAdmin(<CustomerDetailsSheet account={customer('cus-005', 'Bea')} onClose={() => {}} />)
    expect(screen.getByText('Messaging blocked', { selector: 'span' })).toBeInTheDocument()
    const list = screen.getByRole('list', { name: /Offenses/ })
    expect(within(list).getAllByRole('listitem')).toHaveLength(3)
    expect(list.textContent).toMatch(/\b(AM|PM)\b/)
  })

  it('asks first, then bans with the verb button and shows the action in the history', async () => {
    const user = userEvent.setup()
    renderAdmin(<CustomerDetailsSheet account={customer('cus-010', 'Carlo')} onClose={() => {}} />)
    await user.click(screen.getByRole('button', { name: 'Ban account' }))
    expect(screen.getByText('Are you sure?')).toBeInTheDocument()
    await user.type(screen.getByLabelText(/Reason/), 'Harassment')
    await user.click(screen.getByRole('button', { name: 'Ban Account' }))
    await waitFor(() => expect(getModerationStatus('cus-010')).toBe('banned'))
    expect(await screen.findByText(/Banned by/)).toBeInTheDocument()
    expect(screen.getByText('Reason: Harassment')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Unban account' })).toBeInTheDocument()
  })
})
