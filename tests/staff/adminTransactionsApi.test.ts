import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ProductListError, request } from '../../src/service/fetchProductList'
import { adminOrderDetail } from '../fixtures/orders'

vi.mock('../../src/service/fetchProductList', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/service/fetchProductList')>()),
  request: vi.fn(),
}))
const send = vi.mocked(request)

const { fetchAdminTransaction, fetchAdminTransactionMetrics, fetchAdminTransactions, orderToTransactionDetail, redactPayload } = await import('../../src/service/adminTransactionsApi')

const ID = '11111111-1111-4111-8111-111111111111'
const ORDER_ID = '22222222-2222-4222-8222-222222222222'
const customer = { id: 'u1', email: 'anne@example.com', firstName: 'Anne', lastName: 'Santos', fullName: 'Anne Santos', avatarUrl: null }
const apiRow = (over: Record<string, unknown> = {}) => ({
  id: ID,
  orderId: ORDER_ID,
  provider: 'paymongo',
  externalPaymentId: 'pay_abc123',
  amount: 3879,
  fee: 96.98,
  netAmount: 3782.02,
  currency: 'PHP',
  paymentMethod: 'GCASH',
  status: 'PAID',
  createdAt: '2026-10-26T02:30:00.000Z',
  updatedAt: '2026-10-26T02:31:00.000Z',
  order: { id: ORDER_ID, orderNumber: 'SHF-20261026-ABC123', status: 'PAID', paymentStatus: 'PAID', currency: 'PHP', totalAmount: 3879, createdAt: '2026-10-26T02:25:00.000Z' },
  customer,
  ...over,
})
const page = (data: unknown[]) => ({ data, meta: { total: data.length, page: 1, limit: 25, totalPages: 1 } })
const metrics = { totalTransactions: 12, paidCount: 8, refundedCount: 1, failedCount: 2, pendingCount: 1, totalGrossVolume: 31000.5, totalFeeVolume: 775, totalNetVolume: 30225.5 }

beforeEach(() => {
  vi.resetAllMocks()
})

describe('listing transactions', () => {
  it('sends only keys the API knows, with Manila day bounds and the limit capped at 100', async () => {
    send.mockResolvedValue(page([]))
    await fetchAdminTransactions({
      page: 3,
      limit: 500,
      status: 'PAID',
      method: 'GCASH',
      provider: 'PayMongo',
      orderId: ORDER_ID,
      from: '2026-10-01',
      to: '2026-10-31',
      search: 'anne',
      sortBy: 'amount',
      sortOrder: 'asc',
    })
    expect(send.mock.calls[0][0]).toBe('GET')
    const path = send.mock.calls[0][1]
    const query = new URL(`http://x${path}`).searchParams
    expect([...query.keys()]).toEqual(['page', 'limit', 'status', 'paymentMethod', 'provider', 'orderId', 'startDate', 'endDate', 'search', 'sortBy', 'sortOrder'])
    expect(query.get('limit')).toBe('100')
    expect(query.get('paymentMethod')).toBe('GCASH')
    expect(query.get('orderId')).toBe(ORDER_ID)
    expect(query.get('startDate')).toBe('2026-10-01T00:00:00+08:00')
    expect(query.get('endDate')).toBe('2026-10-31T23:59:59.999+08:00')
    expect(path).not.toMatch(/[?&](method|from|to)=/)
  })

  it('leaves out every filter that is not set', async () => {
    send.mockResolvedValue(page([]))
    await fetchAdminTransactions({})
    expect(send).toHaveBeenCalledWith('GET', '/admin/transactions?page=1&limit=25', undefined, undefined)
  })

  it('maps a row, and names a payment whose customer account is gone', async () => {
    send.mockResolvedValue(page([apiRow(), apiRow({ id: 'x2', customer: null })]))
    const { data, meta } = await fetchAdminTransactions({})
    expect(data[0]).toEqual({
      id: ID,
      orderId: ORDER_ID,
      orderNumber: 'SHF-20261026-ABC123',
      orderStatus: 'PAID',
      customerName: 'Anne Santos',
      customerEmail: 'anne@example.com',
      provider: 'paymongo',
      reference: 'pay_abc123',
      method: 'GCASH',
      status: 'PAID',
      amount: 3879,
      fee: 96.98,
      net: 3782.02,
      at: '2026-10-26T02:30:00.000Z',
    })
    expect(data[1]).toMatchObject({ customerName: 'Customer account removed', customerEmail: null })
    expect(meta).toEqual({ total: 2, page: 1, limit: 25, totalPages: 1 })
  })

  it('keeps a fee and net the gateway has not reported as null', async () => {
    send.mockResolvedValue(page([apiRow({ fee: null, netAmount: null }), apiRow({ fee: '5', netAmount: undefined })]))
    const { data } = await fetchAdminTransactions({})
    expect(data.map((row) => [row.fee, row.net])).toEqual([
      [null, null],
      [null, null],
    ])
  })

  it('rejects an unknown status, a missing order, a non-number amount, a bad date and a malformed body as a server error', async () => {
    const bad = [
      page([apiRow({ status: 'TELEPORTED' })]),
      page([apiRow({ order: null })]),
      page([apiRow({ order: { orderNumber: 'X', status: 'LOST' } })]),
      page([apiRow({ amount: '12' })]),
      page([apiRow({ createdAt: 'yesterday' })]),
      page([apiRow({ externalPaymentId: null })]),
      { data: null },
      null,
    ]
    for (const body of bad) {
      send.mockResolvedValueOnce(body)
      await expect(fetchAdminTransactions({})).rejects.toMatchObject({ kind: 'server' })
    }
  })

  it('passes each error kind through, the rate limit included, and an abort untouched', async () => {
    for (const kind of ['rate-limit', 'network', 'forbidden', 'server'] as const) {
      send.mockRejectedValueOnce(new ProductListError(kind))
      await expect(fetchAdminTransactions({})).rejects.toMatchObject({ kind })
    }
    const abort = new DOMException('Aborted', 'AbortError')
    send.mockRejectedValueOnce(abort)
    await expect(fetchAdminTransactions({})).rejects.toBe(abort)
  })
})

describe('reading one transaction', () => {
  it('adds the order total, the update time and the gateway payload to the row', async () => {
    send.mockResolvedValue({ ...apiRow(), rawPayload: { data: { id: 'pay_abc123' } } })
    const detail = await fetchAdminTransaction(ID)
    expect(send).toHaveBeenCalledWith('GET', `/admin/transactions/${ID}`, undefined, undefined)
    expect(detail).toMatchObject({ id: ID, orderTotal: 3879, updatedAt: '2026-10-26T02:31:00.000Z', payload: { data: { id: 'pay_abc123' } } })
  })

  it('has an empty payload when the API sends none', async () => {
    send.mockResolvedValue({ ...apiRow(), rawPayload: null })
    expect((await fetchAdminTransaction(ID)).payload).toEqual({})
  })

  it('rejects a body without its update time as a server error, and passes a 404 and a 400 through', async () => {
    send.mockResolvedValueOnce({ ...apiRow(), updatedAt: undefined })
    await expect(fetchAdminTransaction(ID)).rejects.toMatchObject({ kind: 'server' })
    for (const kind of ['not-found', 'validation'] as const) {
      send.mockRejectedValueOnce(new ProductListError(kind))
      await expect(fetchAdminTransaction(ID)).rejects.toMatchObject({ kind })
    }
  })
})

describe('metrics', () => {
  it('reads the counts and the paid volumes', async () => {
    send.mockResolvedValue({ ...metrics, currency: 'PHP' })
    expect(await fetchAdminTransactionMetrics()).toEqual(metrics)
    expect(send).toHaveBeenCalledWith('GET', '/admin/transactions/metrics', undefined, undefined)
  })

  it('rejects a missing or non-number figure as a server error', async () => {
    for (const body of [{ totalTransactions: 4 }, { ...metrics, paidCount: '8' }, { ...metrics, totalNetVolume: null }, null]) {
      send.mockResolvedValueOnce(body)
      await expect(fetchAdminTransactionMetrics()).rejects.toMatchObject({ kind: 'server' })
    }
  })

  it('passes the rate limit through', async () => {
    send.mockRejectedValue(new ProductListError('rate-limit'))
    await expect(fetchAdminTransactionMetrics()).rejects.toMatchObject({ kind: 'rate-limit' })
  })
})

describe('redactPayload', () => {
  it('hides a nested client_key and any other secret-looking key, and keeps the rest', () => {
    const payload = { data: { id: 'pay_1', attributes: { client_key: 'pay_1_client_abc', amount: 100, billing: { name: 'Anne' } } }, Authorization: 'Bearer x', list: [{ webhook_secret: 's', ok: true }] }
    expect(redactPayload(payload)).toEqual({
      data: { id: 'pay_1', attributes: { client_key: '[hidden]', amount: 100, billing: { name: 'Anne' } } },
      Authorization: '[hidden]',
      list: [{ webhook_secret: '[hidden]', ok: true }],
    })
  })

  it('does not change what it was given', () => {
    const payload = { token: 'abc' }
    redactPayload(payload)
    expect(payload).toEqual({ token: 'abc' })
  })
})

describe('an order as an invoice reads it', () => {
  it('has a line per item, then the delivery fee, and the lines add up to the order total', () => {
    const detail = orderToTransactionDetail(adminOrderDetail(), 'GCASH')
    expect(detail).toMatchObject({ id: adminOrderDetail().id, orderNo: 'SHF-20261026-ABC123', placedAt: '2026-10-26T02:30:00.000Z', itemCount: 2, subtotal: 3780, total: 3879 })
    expect(detail.lines.map((l) => [l.name, l.category, l.units, l.unitPrice])).toEqual([
      ['Heritage Polo', 'Apparel', 2, 1890],
      ['Delivery fee', 'Delivery', 1, 99],
    ])
    expect(detail.lines.reduce((sum, l) => sum + l.units * l.unitPrice, 0)).toBe(detail.total)
  })

  it('has no delivery line when delivery is free, and takes a discount off as a negative line', () => {
    const detail = orderToTransactionDetail(adminOrderDetail({ shipping: 0, discount: 200, total: 3580 }), 'GCASH')
    expect(detail.lines.map((l) => [l.name, l.units * l.unitPrice])).toEqual([['Heritage Polo', 3780], ['Discount', -200]])
    expect(detail.lines.reduce((sum, l) => sum + l.units * l.unitPrice, 0)).toBe(detail.total)
  })

  it('carries the item photo only when there is one', () => {
    const items = [{ ...adminOrderDetail().items[0], imageUrl: 'https://img.example/polo.jpg' }, { ...adminOrderDetail().items[0], id: 'i2' }]
    const [photo, plain] = orderToTransactionDetail(adminOrderDetail({ items }), 'GCASH').lines
    expect(photo.imageUrl).toBe('https://img.example/polo.jpg')
    expect(plain).not.toHaveProperty('imageUrl')
  })

  it.each([
    ['GCASH', 'GCash'],
    ['PAYMAYA', 'Maya'],
    ['CARD', 'Card'],
    ['GRAB_PAY', 'GrabPay'],
    ['BILLEASE', 'BillEase'],
    ['OTHER', 'Online payment'],
    ['SOMETHING_NEW', 'Online payment'],
  ])('names %s as %s', (method, label) => {
    expect(orderToTransactionDetail(adminOrderDetail(), method).paymentLabel).toBe(label)
  })

  it('reaches the customer by email, phone and delivery address, and copes with a removed account', () => {
    expect(orderToTransactionDetail(adminOrderDetail(), 'GCASH')).toMatchObject({
      customerName: 'Anne Santos',
      customer: { email: 'anne.santos@example.com', phone: '+639171234567', address: '12 Rizal Avenue, Barangay 176, City of Manila 1000' },
    })
    const removed = orderToTransactionDetail(adminOrderDetail({ customer: null }), 'GCASH')
    expect(removed.customerName).toBe('Customer account removed')
    expect(removed.customer).toBeUndefined()
  })
})
