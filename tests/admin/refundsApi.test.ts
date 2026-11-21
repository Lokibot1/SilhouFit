import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ProductListError, request } from '../../src/service/fetchProductList'

vi.mock('../../src/service/fetchProductList', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/service/fetchProductList')>()),
  request: vi.fn(),
}))
const send = vi.mocked(request)

const { getRefund, getRefundMetrics, listRefunds, retryRefund, subscribeRefunds, syncRefund } = await import('../../src/service/refunds')

const ID = '33333333-3333-4333-8333-333333333333'
const person = { id: 'u1', email: 'anne@example.com', firstName: 'Anne', lastName: 'Santos', fullName: 'Anne Santos', avatarUrl: null }
const apiRefund = (over: Record<string, unknown> = {}) => ({
  id: ID,
  orderId: 'o1',
  paymentTransactionId: 'p1',
  provider: 'paymongo',
  externalPaymentId: 'pay_abc123',
  externalRefundId: 'ref_abc123',
  idempotencyKey: 'k1',
  providerIdempotencyKey: 'k1-1',
  providerAttemptSeq: 1,
  amount: 3879.5,
  currency: 'PHP',
  status: 'PROCESSING',
  reason: 'LATE_PAYMENT_ON_CANCELLED_ORDER',
  reasonNotes: 'Paid after the order was cancelled',
  triggerSource: 'SYSTEM_AUTO',
  resolutionType: 'PROVIDER_API',
  manualReference: null,
  failureCode: null,
  failureMessage: null,
  attemptCount: 2,
  claimedAt: null,
  lastAttemptAt: '2026-10-26T02:40:00.000Z',
  nextRetryAt: '2026-10-26T03:00:00.000Z',
  succeededAt: null,
  createdAt: '2026-10-26T02:30:00.000Z',
  updatedAt: '2026-10-26T02:41:00.000Z',
  order: { id: 'o1', orderNumber: 'SHF-20261026-ABC123', status: 'CANCELLED', paymentStatus: 'PAID', currency: 'PHP', totalAmount: 3879.5, createdAt: '2026-10-26T02:25:00.000Z' },
  paymentTransaction: null,
  customer: person,
  initiatedBy: null,
  resolvedBy: null,
  ...over,
})
const page = (data: unknown[]) => ({ data, meta: { total: data.length, page: 1, limit: 10, totalPages: 1, hasNextPage: false, hasPreviousPage: false } })
const metrics = { totalRefunds: 9, requestedCount: 1, processingCount: 2, succeededCount: 3, failedCount: 1, requiresManualActionCount: 1, cancelledCount: 1, totalRefundedVolume: 5200.5, pendingRefundLiabilityVolume: 1800 }

beforeEach(() => {
  vi.resetAllMocks()
})

describe('listing refunds', () => {
  it('leaves out every filter that is not set', async () => {
    send.mockResolvedValue(page([]))
    await listRefunds({})
    expect(send).toHaveBeenCalledWith('GET', '/admin/refunds?page=1&limit=10', undefined, undefined)
  })

  it('sends only keys the API knows, with the limit capped at 100', async () => {
    send.mockResolvedValue(page([]))
    await listRefunds({ page: 3, limit: 500, status: 'FAILED', search: 'anne', sortBy: 'amount', sortOrder: 'asc' })
    const query = new URL(`http://x${send.mock.calls[0][1]}`).searchParams
    expect([...query.keys()]).toEqual(['page', 'limit', 'status', 'search', 'sortBy', 'sortOrder'])
    expect(Object.fromEntries(query)).toEqual({ page: '3', limit: '100', status: 'FAILED', search: 'anne', sortBy: 'amount', sortOrder: 'asc' })
  })

  it('maps a refund, and names one whose customer account is gone', async () => {
    send.mockResolvedValue(page([apiRefund(), apiRefund({ id: 'x2', customer: null, order: null, externalRefundId: null, initiatedBy: person, status: 'REQUIRES_MANUAL_ACTION' })]))
    const { data, meta } = await listRefunds({})
    expect(data[0]).toEqual({
      id: ID,
      orderNumber: 'SHF-20261026-ABC123',
      customerName: 'Anne Santos',
      customerEmail: 'anne@example.com',
      provider: 'paymongo',
      paymentReference: 'pay_abc123',
      refundReference: 'ref_abc123',
      amount: 3879.5,
      status: 'PROCESSING',
      reason: 'LATE_PAYMENT_ON_CANCELLED_ORDER',
      reasonNotes: 'Paid after the order was cancelled',
      trigger: 'SYSTEM_AUTO',
      startedBy: null,
      manualReference: null,
      resolvedBy: null,
      failureCode: null,
      failureMessage: null,
      attempts: 2,
      nextRetryAt: '2026-10-26T03:00:00.000Z',
      createdAt: '2026-10-26T02:30:00.000Z',
    })
    expect(data[1]).toMatchObject({ customerName: 'Customer account removed', customerEmail: null, orderNumber: null, refundReference: null, startedBy: 'Anne Santos', status: 'REQUIRES_MANUAL_ACTION' })
    expect(meta).toEqual({ total: 2, page: 1, limit: 10, totalPages: 1 })
  })

  it('rejects an unknown status, reason or source, a non-number amount, a bad date and a malformed body as a server error', async () => {
    const bad = [
      page([apiRefund({ status: 'TELEPORTED' })]),
      page([apiRefund({ reason: 'BORED' })]),
      page([apiRefund({ triggerSource: 'ALIEN' })]),
      page([apiRefund({ amount: '12' })]),
      page([apiRefund({ createdAt: 'yesterday' })]),
      page([apiRefund({ externalPaymentId: null })]),
      { data: null },
      null,
    ]
    for (const body of bad) {
      send.mockResolvedValueOnce(body)
      await expect(listRefunds({})).rejects.toMatchObject({ kind: 'server' })
    }
  })

  it('passes each error kind through and an abort untouched', async () => {
    for (const kind of ['rate-limit', 'network', 'forbidden', 'server'] as const) {
      send.mockRejectedValueOnce(new ProductListError(kind))
      await expect(listRefunds({})).rejects.toMatchObject({ kind })
    }
    const abort = new DOMException('Aborted', 'AbortError')
    send.mockRejectedValueOnce(abort)
    await expect(listRefunds({})).rejects.toBe(abort)
  })
})

describe('one refund', () => {
  it('reads the gateway response, or none', async () => {
    send.mockResolvedValueOnce({ ...apiRefund(), rawProviderResponse: { data: { id: 'ref_1' } } })
    expect(await getRefund('a/b')).toMatchObject({ id: ID, gatewayResponse: { data: { id: 'ref_1' } } })
    expect(send).toHaveBeenCalledWith('GET', '/admin/refunds/a%2Fb', undefined, undefined)
    send.mockResolvedValueOnce({ ...apiRefund(), rawProviderResponse: null })
    expect((await getRefund(ID)).gatewayResponse).toBeNull()
  })

  it('passes a 404 through', async () => {
    send.mockRejectedValue(new ProductListError('not-found'))
    await expect(getRefund(ID)).rejects.toMatchObject({ kind: 'not-found' })
  })
})

describe('metrics', () => {
  it('reads the counts and the volumes', async () => {
    send.mockResolvedValue({ ...metrics, currency: 'PHP' })
    expect(await getRefundMetrics()).toEqual(metrics)
    expect(send).toHaveBeenCalledWith('GET', '/admin/refunds/metrics', undefined, undefined)
  })

  it('rejects a missing or non-number figure as a server error', async () => {
    for (const body of [{ totalRefunds: 4 }, { ...metrics, failedCount: '1' }, { ...metrics, pendingRefundLiabilityVolume: null }, null]) {
      send.mockResolvedValueOnce(body)
      await expect(getRefundMetrics()).rejects.toMatchObject({ kind: 'server' })
    }
  })
})

describe('retry and sync', () => {
  it('post to their own paths with no body, return the refund and tell the subscribers', async () => {
    const heard = vi.fn()
    const unsubscribe = subscribeRefunds(heard)
    send.mockResolvedValue({ ...apiRefund({ status: 'SUCCEEDED' }), rawProviderResponse: null })
    expect((await retryRefund(ID)).status).toBe('SUCCEEDED')
    expect(send).toHaveBeenLastCalledWith('POST', `/admin/refunds/${ID}/retry`, undefined)
    expect((await syncRefund(ID)).status).toBe('SUCCEEDED')
    expect(send).toHaveBeenLastCalledWith('POST', `/admin/refunds/${ID}/sync`, undefined)
    expect(heard).toHaveBeenCalledTimes(2)
    unsubscribe()
  })

  it('returns a refund the gateway refused as it is, because the API answers 200 for it', async () => {
    send.mockResolvedValue({ ...apiRefund({ status: 'FAILED', failureCode: 'insufficient_balance', failureMessage: 'The gateway balance is too low.' }), rawProviderResponse: null })
    expect(await retryRefund(ID)).toMatchObject({ status: 'FAILED', failureCode: 'insufficient_balance', failureMessage: 'The gateway balance is too low.' })
  })

  it('passes the server\'s own sentence for a 409 through, and does not tell the subscribers', async () => {
    const heard = vi.fn()
    const unsubscribe = subscribeRefunds(heard)
    const detail = 'This refund was already submitted to the gateway. Use sync instead.'
    send.mockRejectedValue(new ProductListError('conflict', detail, 409))
    await expect(retryRefund(ID)).rejects.toMatchObject({ kind: 'conflict', detail })
    expect(heard).not.toHaveBeenCalled()
    unsubscribe()
  })

  it('rejects a malformed answer as a server error', async () => {
    send.mockResolvedValue({ ok: true })
    await expect(syncRefund(ID)).rejects.toMatchObject({ kind: 'server' })
  })
})
