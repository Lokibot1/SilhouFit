import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ProductListError, request } from '../../src/service/fetchProductList'
import { apiOrder, ORDER_ID } from '../fixtures/orders'

vi.mock('../../src/service/fetchProductList', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/service/fetchProductList')>()),
  request: vi.fn(),
}))
const send = vi.mocked(request)

const { cancelAndRefundOrder, cancelRefundFailure, cancelDelivery, cancelDeliveryFailure, dispatchFailure, dispatchOrder, explainFailure, fetchAdminOrder, fetchAdminOrderMetrics, fetchAdminOrders, fetchUserOrders, fetchUserOrderSummary, updateAdminOrder } = await import('../../src/service/adminOrdersApi')

const customer = { id: 'u1', email: 'anne@example.com', firstName: 'Anne', lastName: 'Santos', fullName: 'Anne Santos', avatarUrl: null }
const apiRow = (over: Record<string, unknown> = {}) => ({
  id: ORDER_ID,
  orderNumber: 'SHF-20261026-ABC123',
  customer,
  status: 'PAID',
  paymentStatus: 'PAID',
  totalAmount: 3879,
  itemsCount: 2,
  shipmentStatus: null,
  createdAt: '2026-10-26T02:30:00.000Z',
  ...over,
})
const page = (data: unknown[]) => ({ data, meta: { total: data.length, page: 1, limit: 25, totalPages: 1, hasNextPage: false, hasPreviousPage: false } })
const apiDetail = (over: Record<string, unknown> = {}) => ({
  ...apiOrder({ status: 'PAID', paymentStatus: 'PAID' }),
  customer,
  internalNotes: 'Call first',
  shipmentEvents: [],
  paymentTransactions: [],
  ...over,
})
const apiShipment = (over: Record<string, unknown> = {}) => ({ courier: 'Lalamove', serviceType: 'Motorcycle', status: 'QUOTED', externalOrderId: null, trackingUrl: null, deliveryFee: 99, ...over })

beforeEach(() => {
  vi.resetAllMocks()
})

describe('listing orders', () => {
  it('sends only keys the API knows, with Manila day bounds and the limit capped at 100', async () => {
    send.mockResolvedValue(page([]))
    await fetchAdminOrders({ page: 3, limit: 500, status: 'PAID', paymentStatus: 'PAID', from: '2026-10-01', to: '2026-10-31', search: 'anne' })
    const path = send.mock.calls[0][1]
    expect(send.mock.calls[0][0]).toBe('GET')
    const query = new URL(`http://x${path}`).searchParams
    expect([...query.keys()]).toEqual(['page', 'limit', 'status', 'paymentStatus', 'startDate', 'endDate', 'search'])
    expect(query.get('limit')).toBe('100')
    expect(query.get('startDate')).toBe('2026-10-01T00:00:00+08:00')
    expect(query.get('endDate')).toBe('2026-10-31T23:59:59.999+08:00')
    expect(path).not.toMatch(/sort|[?&]from=|[?&]to=/)
  })

  it('leaves out every filter that is not set', async () => {
    send.mockResolvedValue(page([]))
    await fetchAdminOrders({})
    expect(send).toHaveBeenCalledWith('GET', '/admin/orders?page=1&limit=25', undefined, undefined)
  })

  it('maps a row, and names an order whose customer account is gone', async () => {
    send.mockResolvedValue(page([apiRow({ shipmentStatus: 'DISPATCHING' }), apiRow({ id: 'x2', customer: null })]))
    const { data, meta } = await fetchAdminOrders({})
    expect(data[0]).toEqual({
      id: ORDER_ID,
      orderNumber: 'SHF-20261026-ABC123',
      customerName: 'Anne Santos',
      customerEmail: 'anne@example.com',
      status: 'PAID',
      paymentStatus: 'PAID',
      total: 3879,
      itemCount: 2,
      shipmentStatus: 'DISPATCHING',
      placedAt: '2026-10-26T02:30:00.000Z',
    })
    expect(data[1]).toMatchObject({ customerName: 'Customer account removed', customerEmail: null })
    expect(meta).toEqual({ total: 2, page: 1, limit: 25, totalPages: 1, hasNextPage: false })
  })

  it('reads a partly refunded payment status', async () => {
    send.mockResolvedValue(page([apiRow({ paymentStatus: 'PARTIALLY_REFUNDED' })]))
    expect((await fetchAdminOrders({})).data[0].paymentStatus).toBe('PARTIALLY_REFUNDED')
  })

  it('rejects an unknown status, a missing amount and a malformed body as a server error', async () => {
    for (const bad of [page([apiRow({ status: 'TELEPORTED' })]), page([apiRow({ totalAmount: '12' })]), page([apiRow({ shipmentStatus: 'LOST' })]), { data: null }, null]) {
      send.mockResolvedValueOnce(bad)
      await expect(fetchAdminOrders({})).rejects.toMatchObject({ kind: 'server' })
    }
  })

  it('passes an abort through untouched', async () => {
    const abort = new DOMException('Aborted', 'AbortError')
    send.mockRejectedValue(abort)
    await expect(fetchAdminOrders({})).rejects.toBe(abort)
  })
})

describe('a customer\'s purchases', () => {
  it('lists from the user path with the id encoded, the same keys and the same row mapping', async () => {
    send.mockResolvedValue(page([apiRow()]))
    const { data } = await fetchUserOrders('a/b c', { page: 2, limit: 500, status: 'PAID', from: '2026-10-01' })
    const path = send.mock.calls[0][1]
    expect(path.startsWith('/users/a%2Fb%20c/orders?')).toBe(true)
    const query = new URL(`http://x${path}`).searchParams
    expect([...query.keys()]).toEqual(['page', 'limit', 'status', 'startDate'])
    expect(query.get('limit')).toBe('100')
    expect(data[0]).toMatchObject({ id: ORDER_ID, total: 3879, status: 'PAID', placedAt: '2026-10-26T02:30:00.000Z' })
  })

  it('reads the total spent and the order count, and ignores the status counts', async () => {
    send.mockResolvedValue({ userId: 'u1', orders: { totalSpent: 1234.5, totalOrders: 3, statusCounts: { PAID: 3 } } })
    expect(await fetchUserOrderSummary('u 1')).toEqual({ totalSpent: 1234.5, totalOrders: 3 })
    expect(send).toHaveBeenCalledWith('GET', '/users/u%201/summary', undefined, undefined)
  })

  it('rejects a malformed summary as a server error', async () => {
    for (const body of [null, { orders: null }, { orders: { totalSpent: '5', totalOrders: 1 } }, { orders: { totalSpent: 5 } }]) {
      send.mockResolvedValueOnce(body)
      await expect(fetchUserOrderSummary('u1')).rejects.toMatchObject({ kind: 'server' })
    }
  })
})

describe('metrics', () => {
  it('reads the five counts', async () => {
    const metrics = { pendingPaymentCount: 4, processingCount: 3, dispatchedCount: 2, deliveredTodayCount: 1, totalRevenue: 12500.5 }
    send.mockResolvedValue(metrics)
    expect(await fetchAdminOrderMetrics()).toEqual(metrics)
    expect(send).toHaveBeenCalledWith('GET', '/admin/orders/metrics', undefined, undefined)
  })

  it('rejects a missing count as a server error', async () => {
    send.mockResolvedValue({ pendingPaymentCount: 4 })
    await expect(fetchAdminOrderMetrics()).rejects.toMatchObject({ kind: 'server' })
  })
})

describe('reading one order', () => {
  it('adds the customer, notes, stock, payments, booking and events to the order', async () => {
    const body = apiDetail({
      items: [{ ...apiOrder().items[0], variantStock: 7 }, { ...apiOrder().items[0], id: 'i2', variantId: null, variantStock: null }],
      shipment: apiShipment({ status: 'DISPATCHING', externalOrderId: 'LLM-1' }),
      paymentTransactions: [{ id: 'p1', provider: 'paymongo', externalPaymentId: 'pay_1', amount: 3879, fee: 100, netAmount: 3779, paymentMethod: 'GCASH', status: 'PAID', createdAt: '2026-10-26T02:40:00.000Z' }],
      shipmentEvents: [
        { id: 'e2', eventId: 'x2', eventType: 'ORDER_STATUS_CHANGED', courierStatus: 'ON_GOING', eventTimestamp: '2026-10-26T04:00:00.000Z', reason: 'Driver left' },
        { id: 'e1', eventId: 'x1', eventType: 'DRIVER_ASSIGNED', courierStatus: null, eventTimestamp: '2026-10-26T03:00:00.000Z', reason: null },
      ],
    })
    send.mockResolvedValue(body)
    const order = await fetchAdminOrder(ORDER_ID)
    expect(send).toHaveBeenCalledWith('GET', `/admin/orders/${ORDER_ID}`, undefined, undefined)
    expect(order).toMatchObject({ customer: { name: 'Anne Santos', email: 'anne@example.com' }, internalNotes: 'Call first', total: 3879, status: 'PAID' })
    expect(order.items.map((item) => item.stock)).toEqual([7, null])
    expect(order.shipment).toMatchObject({ status: 'DISPATCHING', externalOrderId: 'LLM-1' })
    expect(order.payments).toEqual([{ id: 'p1', provider: 'paymongo', method: 'GCASH', amount: 3879, fee: 100, net: 3779, status: 'PAID', at: '2026-10-26T02:40:00.000Z' }])
    expect(order.events.map((event) => [event.label, event.reason])).toEqual([['DRIVER_ASSIGNED', null], ['ON_GOING', 'Driver left']])
  })

  it('reads the refunds and the refunded total, and nothing refunded when an older API sends neither', async () => {
    send.mockResolvedValueOnce(apiDetail({ refundedAmount: 1000, refunds: [{ id: 'r1', paymentTransactionId: 'p1', provider: 'paymongo', externalRefundId: 'ref_1', amount: 1000, currency: 'PHP', status: 'SUCCEEDED', reason: 'LATE_PAYMENT_ON_CANCELLED_ORDER', resolutionType: 'PROVIDER_API', manualReference: null, failureCode: null, succeededAt: '2026-10-27T03:00:00.000Z', createdAt: '2026-10-27T02:30:00.000Z' }] }))
    expect(await fetchAdminOrder(ORDER_ID)).toMatchObject({
      refundedAmount: 1000,
      refunds: [{ id: 'r1', amount: 1000, status: 'SUCCEEDED', reason: 'LATE_PAYMENT_ON_CANCELLED_ORDER', refundReference: 'ref_1', manualReference: null, failureCode: null, succeededAt: '2026-10-27T03:00:00.000Z', createdAt: '2026-10-27T02:30:00.000Z' }],
    })
    send.mockResolvedValueOnce(apiDetail())
    expect(await fetchAdminOrder(ORDER_ID)).toMatchObject({ refundedAmount: 0, refunds: [] })
    send.mockResolvedValueOnce(apiDetail({ refunds: [{ id: 'r1', amount: 5, status: 'TELEPORTED', reason: 'OTHER', createdAt: '2026-10-27T02:30:00.000Z' }] }))
    await expect(fetchAdminOrder(ORDER_ID)).rejects.toMatchObject({ kind: 'server' })
  })

  it('has no booking, customer or notes when the API has none', async () => {
    send.mockResolvedValue(apiDetail({ customer: null, internalNotes: null }))
    expect(await fetchAdminOrder(ORDER_ID)).toMatchObject({ customer: null, internalNotes: null, shipment: null, payments: [], events: [] })
  })

  it('rejects a body without its lists as a server error', async () => {
    send.mockResolvedValue({ ...apiDetail(), paymentTransactions: undefined })
    await expect(fetchAdminOrder(ORDER_ID)).rejects.toMatchObject({ kind: 'server' })
  })
})

describe('changing an order', () => {
  it('PATCHes the status and gives back the order', async () => {
    send.mockResolvedValue(apiDetail({ status: 'PROCESSING' }))
    const order = await updateAdminOrder(ORDER_ID, { status: 'PROCESSING' })
    expect(send).toHaveBeenCalledWith('PATCH', `/admin/orders/${ORDER_ID}/status`, { status: 'PROCESSING' })
    expect(order.status).toBe('PROCESSING')
  })

  it('sends notes and a cancellation reason as given', async () => {
    send.mockResolvedValue(apiDetail({ status: 'CANCELLED' }))
    await updateAdminOrder(ORDER_ID, { status: 'CANCELLED', cancellationReason: 'Out of stock' })
    await updateAdminOrder(ORDER_ID, { internalNotes: 'Call first' })
    expect(send.mock.calls[0][3]).toBeUndefined()
    expect(send.mock.calls.map((call) => call[2])).toEqual([{ status: 'CANCELLED', cancellationReason: 'Out of stock' }, { internalNotes: 'Call first' }])
  })

  it('POSTs the booking and the delivery cancellation without a body', async () => {
    send.mockResolvedValue({})
    await dispatchOrder(ORDER_ID)
    await cancelDelivery(ORDER_ID)
    expect(send.mock.calls.map((call) => [call[0], call[1], call[2]])).toEqual([
      ['POST', `/admin/orders/${ORDER_ID}/dispatch`, undefined],
      ['POST', `/admin/orders/${ORDER_ID}/cancel-delivery`, undefined],
    ])
  })

  it('POSTs the cancel and refund with only the reason and restock choice, and gives back the order', async () => {
    send.mockResolvedValue(apiDetail({ status: 'CANCELLED', refundedAmount: 3879 }))
    const order = await cancelAndRefundOrder(ORDER_ID, { reason: 'Out of stock', restockItems: false })
    expect(send).toHaveBeenCalledWith('POST', `/admin/orders/${ORDER_ID}/cancel-and-refund`, { reason: 'Out of stock', restockItems: false })
    expect(order.status).toBe('CANCELLED')
    expect(order.refundedAmount).toBe(3879)
  })

  it('keeps the failure so the screen can tell a bad gateway from a refusal', async () => {
    send.mockRejectedValue(new ProductListError('server', undefined, 502))
    await expect(dispatchOrder(ORDER_ID)).rejects.toMatchObject({ kind: 'server', status: 502 })
  })
})

describe('failure copy', () => {
  const fail = (kind: ConstructorParameters<typeof ProductListError>[0], detail?: string) => new ProductListError(kind, detail)

  it('never shows the provider on a bad gateway, and offers a retry', () => {
    expect(dispatchFailure(new ProductListError('server', 'Lalamove said no: ERR_X', 502))).toEqual({
      message: "Lalamove didn't answer, so no rider was booked. Try again in a few minutes.",
      retry: true,
    })
  })

  it('says so on a rate limit, not that Lalamove was silent, and offers a retry', () => {
    expect(dispatchFailure(new ProductListError('rate-limit', undefined, 429))).toEqual({
      message: 'Too many requests right now, so no rider was booked. Try again shortly.',
      retry: true,
    })
  })

  it('explains a booking that is already under way, and shows the server sentence for a refusal', () => {
    expect(dispatchFailure(fail('conflict'))).toEqual({ message: 'This order is already being dispatched.', retry: false })
    expect(dispatchFailure(fail('validation', 'Only paid orders can be dispatched.'))).toEqual({ message: 'Only paid orders can be dispatched.', retry: false })
  })

  it.each([
    ['INSUFFICIENT_COURIER_CREDIT', 'server', /wallet is out of credit/],
    ['COURIER_AUTH_ERROR', 'server', /Lalamove keys/],
    ['PICKUP_LOCATION_NOT_CONFIGURED', 'validation', /pickup location is missing/],
    ['PICKUP_LOCATION_INVALID', 'validation', /pickup location is missing/],
    ['INVALID_PHONE_NUMBER', 'validation', /pickup contact phone/],
  ] as const)('gives next steps for %s and offers no retry', (code, kind, copy) => {
    const result = dispatchFailure(new ProductListError(kind, 'Provider said ERR_X', 502, code, undefined, false))
    expect(result.message).toMatch(copy)
    expect(result.message).not.toMatch(/ERR_X/)
    expect(result.retry).toBe(false)
  })

  it('keeps retry for a transient coded error and drops it when the server says not to retry', () => {
    expect(dispatchFailure(new ProductListError('server', 'Lalamove timed out', 502, 'COURIER_TIMEOUT', undefined, true)).retry).toBe(true)
    expect(dispatchFailure(new ProductListError('server', 'Rejected for good', 502, 'COURIER_REJECTED', undefined, false))).toEqual({ message: 'Rejected for good', retry: false })
  })

  it('shows the server sentence for a coded conflict', () => {
    expect(dispatchFailure(new ProductListError('conflict', 'Delivery already booked.', 409, 'DELIVERY_EXISTS'))).toEqual({ message: 'Delivery already booked.', retry: false })
  })

  it('explains the cancellation window on a conflict, and the failure otherwise', () => {
    expect(cancelDeliveryFailure(new ProductListError('conflict', 'Order is not shipped.', 409, 'ORDER_STATE'))).toBe('Order is not shipped.')
    expect(cancelDeliveryFailure(new ProductListError('conflict', 'x', 409, 'CANCELLATION_FORBIDDEN'))).toMatch(/within 5 minutes/)
    expect(cancelDeliveryFailure(fail('conflict'))).toMatch(/within 5 minutes of a match\. Contact Lalamove support/)
    expect(cancelDeliveryFailure(fail('network'))).toMatch(/^The delivery was not cancelled\. The connection dropped/)
  })

  it('explains a failed cancel and refund in its own words, with a retry only when it can help', () => {
    const coded = cancelRefundFailure(new ProductListError('conflict', 'POST /x failed', 409, 'CANCELLATION_FORBIDDEN'))
    expect(coded.message).toMatch(/within 5 minutes of a match/)
    expect(coded.retry).toBe(false)
    expect(cancelRefundFailure(new ProductListError('conflict', 'POST /admin/orders/1 conflicts', 409))).toEqual({
      message: 'The order changed while you were cancelling it (a rider may be booked or on the way). Check its status, then try again.',
      retry: false,
    })
    expect(cancelRefundFailure(fail('validation', 'path /x'))).toEqual({ message: 'This order can no longer be cancelled and refunded.', retry: false })
    expect(cancelRefundFailure(fail('forbidden'))).toEqual({ message: 'Only an admin can cancel and refund a paid order.', retry: false })
    for (const kind of ['network', 'rate-limit', 'server'] as const) {
      const result = cancelRefundFailure(fail(kind, 'path /x'))
      expect(result.retry).toBe(true)
      expect(result.message).not.toMatch(/path/)
    }
  })

  it('uses the server sentence for a refused change and plain copy for the rest', () => {
    expect(explainFailure(fail('validation', 'Order SHF-1 is in terminal status "DELIVERED".'))).toBe('Order SHF-1 is in terminal status "DELIVERED".')
    expect(explainFailure(fail('server'))).toMatch(/our side/)
    expect(explainFailure(fail('rate-limit'))).toBe('Too many requests right now. Try again shortly.')
  })
})
