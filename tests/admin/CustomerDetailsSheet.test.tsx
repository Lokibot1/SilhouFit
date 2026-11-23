import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { CustomerDetailsSheet } from '../../src/components/admin/users/CustomerDetailsSheet'
import { clearSession, setSession } from '../../src/service/session'
import { StaffApiError } from '../../src/service/staffApi'
import type { CustomerAccount } from '../../src/types/accounts'
import { renderAdmin, resetAdminAccounts, setUpAdminDom } from '../shared/adminSession'

vi.mock('../../src/service/simulateRequest', () => ({ simulateRequest: () => Promise.resolve({ ok: true }) }))

const api = vi.hoisted(() => ({ fetchUserOrders: vi.fn(), fetchUserOrderSummary: vi.fn() }))
vi.mock('../../src/service/adminOrdersApi', async (importOriginal) => ({ ...(await importOriginal<typeof import('../../src/service/adminOrdersApi')>()), ...api }))
const offensesApi = vi.hoisted(() => ({ listOffenses: vi.fn() }))
vi.mock('../../src/service/profanity', async (importOriginal) => ({ ...(await importOriginal<typeof import('../../src/service/profanity')>()), ...offensesApi }))
const staff = vi.hoisted(() => ({ blockMessagingApi: vi.fn(), unblockMessagingApi: vi.fn() }))
vi.mock('../../src/service/staffApi', async (importOriginal) => ({ ...(await importOriginal<typeof import('../../src/service/staffApi')>()), ...staff }))

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

const customer = (id: string, firstName: string, over: Partial<CustomerAccount> = {}): CustomerAccount => ({
  id,
  role: 'customer',
  firstName,
  lastName: 'Test',
  email: `${firstName}@example.com`,
  phone: '',
  status: 'active',
  createdAt: '2026-01-01T00:00:00.000Z',
  lastSignInAt: null,
  offenseCount: 0,
  messagingBlockedAt: null,
  messagingBlockedReason: null,
  ...over,
})
const signInAs = (role: 'admin' | 'superadmin' | 'staff') => act(() => setSession({ name: 'Dev', email: 'dev@silhoufit.dev', role }))
const offense = (n: number, over: Record<string, unknown> = {}) => ({
  id: `f${n}`,
  userId: 'cus-005',
  source: 'CHAT_MESSAGE',
  maskedContent: `you are ***** ${n}`,
  matchedWords: ['stupid'],
  matchCount: 1,
  createdAt: '2026-10-26T14:30:00.000Z',
  user: null,
  ...over,
})
const offensesPage = (data: unknown[], over: Record<string, unknown> = {}) => ({ data, meta: { total: data.length, page: 1, limit: 10, totalPages: 1, ...over } })

beforeAll(setUpAdminDom)
beforeEach(() => {
  resetAdminAccounts()
  api.fetchUserOrderSummary.mockReset().mockResolvedValue({ totalSpent: 0, totalOrders: 0 })
  api.fetchUserOrders.mockReset().mockResolvedValue(ordersPage([]))
  offensesApi.listOffenses.mockReset().mockResolvedValue(offensesPage([]))
  staff.blockMessagingApi.mockReset()
  staff.unblockMessagingApi.mockReset()
  signInAs('superadmin')
})
afterEach(() => act(() => clearSession()))

describe('CustomerDetailsSheet purchases', () => {
  const open = () => renderAdmin(<CustomerDetailsSheet account={customer('cus-010', 'Carlo')} onClose={() => {}} onChanged={() => {}} />)

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


describe('CustomerDetailsSheet offenses', () => {
  const open = (over: Partial<CustomerAccount> = {}) => renderAdmin(<CustomerDetailsSheet account={customer('cus-005', 'Bea', { offenseCount: 3, ...over })} onClose={() => {}} onChanged={() => {}} />)

  it('shows a skeleton while the offenses load', () => {
    offensesApi.listOffenses.mockReturnValue(new Promise(() => {}))
    open()
    expect(screen.getByText('Loading offenses')).toBeInTheDocument()
  })

  it('lists the masked text with a 12-hour time and a source label, and never the original text', async () => {
    offensesApi.listOffenses.mockResolvedValue(offensesPage([{ ...offense(1), originalContent: 'you are stupid 1' }, offense(2, { source: 'PRODUCT_REVIEW', matchedWords: ['bad', 'worse'] })]))
    open()
    const list = await screen.findByRole('list', { name: 'Offenses, newest first' })
    expect(within(list).getAllByRole('listitem')).toHaveLength(2)
    expect(list.textContent).toMatch(/\b(AM|PM)\b/)
    expect(within(list).getByText('you are ***** 1')).toBeInTheDocument()
    expect(within(list).getByText(/Chat message/)).toBeInTheDocument()
    expect(within(list).getByText(/Product review/)).toBeInTheDocument()
    expect(within(list).getByText('Matched: bad, worse')).toBeInTheDocument()
    expect(document.body.textContent).not.toContain('stupid 1')
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(offensesApi.listOffenses).toHaveBeenCalledWith({ userId: 'cus-005', page: 1, limit: 10 }, expect.anything())
  })

  it('says there are no offenses yet', async () => {
    open({ offenseCount: 0 })
    expect(await screen.findByText(/No offenses\. Chat messages and reviews with hidden words/)).toBeInTheDocument()
  })

  it('shows an error with Retry, and Retry asks again', async () => {
    const user = userEvent.setup()
    offensesApi.listOffenses.mockRejectedValueOnce(Object.assign(new Error('x'), { kind: 'server' }))
    open()
    expect(await screen.findByText(/We couldn't load the offenses/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByText(/No offenses\./)).toBeInTheDocument()
    expect(offensesApi.listOffenses).toHaveBeenCalledTimes(2)
  })

  it('pages the offenses', async () => {
    const user = userEvent.setup()
    offensesApi.listOffenses.mockResolvedValue(offensesPage([offense(1)], { total: 12, totalPages: 2 }))
    open()
    await user.click(await screen.findByRole('button', { name: 'Next' }))
    await waitFor(() => expect(offensesApi.listOffenses).toHaveBeenLastCalledWith({ userId: 'cus-005', page: 2, limit: 10 }, expect.anything()))
  })

  it('shows an admin the count only and never asks for the offenses', () => {
    signInAs('admin')
    open()
    expect(screen.getByText('Only a superadmin can read the flagged messages.')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(offensesApi.listOffenses).not.toHaveBeenCalled()
  })
})

describe('CustomerDetailsSheet messaging block', () => {
  const blockedAt = '2026-10-26T14:30:00.000Z'
  const open = (over: Partial<CustomerAccount> = {}) => {
    const onChanged = vi.fn()
    renderAdmin(<CustomerDetailsSheet account={customer('cus-010', 'Carlo', over)} onClose={() => {}} onChanged={onChanged} />)
    return onChanged
  }

  it('shows the blocked status, when and why', () => {
    open({ messagingBlockedAt: blockedAt, messagingBlockedReason: 'Spam' })
    expect(screen.getByText('Messaging blocked', { selector: 'span' })).toBeInTheDocument()
    expect(screen.getByText(/Reason: Spam/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Unblock messaging' })).toBeInTheDocument()
  })

  it('asks first, then blocks with the reason and reports the updated customer', async () => {
    const user = userEvent.setup()
    const updated = customer('cus-010', 'Carlo', { messagingBlockedAt: blockedAt, messagingBlockedReason: 'Harassment' })
    staff.blockMessagingApi.mockResolvedValue(updated)
    const onChanged = open()
    await user.click(screen.getByRole('button', { name: 'Block messaging' }))
    expect(screen.getByText('Are you sure?')).toBeInTheDocument()
    await user.type(screen.getByLabelText(/Reason/), 'Harassment')
    await user.click(screen.getByRole('button', { name: 'Block Messaging' }))
    await waitFor(() => expect(staff.blockMessagingApi).toHaveBeenCalledWith('cus-010', 'Harassment'))
    expect(onChanged).toHaveBeenCalledWith(updated)
    expect(await screen.findByText(/messaging blocked\./)).toBeInTheDocument()
  })

  it('fills the reason from a preset, marks it pressed, and blocks with that text', async () => {
    const user = userEvent.setup()
    const updated = customer('cus-010', 'Carlo', { messagingBlockedAt: blockedAt, messagingBlockedReason: 'Harassment of staff' })
    staff.blockMessagingApi.mockResolvedValue(updated)
    open()
    await user.click(screen.getByRole('button', { name: 'Block messaging' }))
    const preset = screen.getByRole('button', { name: 'Harassment of staff' })
    expect(preset).toHaveAttribute('aria-pressed', 'false')
    await user.click(preset)
    expect(preset).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByLabelText(/Reason/)).toHaveValue('Harassment of staff')
    await user.click(screen.getByRole('button', { name: 'Block Messaging' }))
    await waitFor(() => expect(staff.blockMessagingApi).toHaveBeenCalledWith('cus-010', 'Harassment of staff'))
  })

  it.each(['Cancel', 'Escape'])('returns focus to Block messaging after %s', async (how) => {
    const user = userEvent.setup()
    open()
    await user.click(screen.getByRole('button', { name: 'Block messaging' }))
    if (how === 'Cancel') await user.click(screen.getByRole('button', { name: 'Cancel' }))
    else await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Block messaging' })).toHaveFocus())
  })

  it('unblocks after asking, without a reason box', async () => {
    const user = userEvent.setup()
    staff.unblockMessagingApi.mockResolvedValue(customer('cus-010', 'Carlo'))
    const onChanged = open({ messagingBlockedAt: blockedAt })
    await user.click(screen.getByRole('button', { name: 'Unblock messaging' }))
    expect(screen.queryByLabelText(/Reason/)).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Unblock Messaging' }))
    await waitFor(() => expect(staff.unblockMessagingApi).toHaveBeenCalledWith('cus-010'))
    expect(onChanged).toHaveBeenCalled()
  })

  it("shows the server's sentence when the customer is already blocked", async () => {
    const user = userEvent.setup()
    staff.blockMessagingApi.mockRejectedValue(new StaffApiError('conflict', 'User messaging is already blocked', 409))
    const onChanged = open()
    await user.click(screen.getByRole('button', { name: 'Block messaging' }))
    await user.click(screen.getByRole('button', { name: 'Block Messaging' }))
    expect(await screen.findByText(/User messaging is already blocked/)).toBeInTheDocument()
    expect(onChanged).not.toHaveBeenCalled()
  })

  it('has no block button for anyone below admin', () => {
    signInAs('staff')
    open()
    expect(screen.queryByRole('button', { name: /Block messaging/ })).not.toBeInTheDocument()
  })

  it('offers no ban or unban any more', () => {
    open()
    expect(screen.queryByRole('button', { name: /ban account/i })).not.toBeInTheDocument()
  })
})
