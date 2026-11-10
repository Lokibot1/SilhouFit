import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ProductListError, request } from '../../src/service/fetchProductList'
import { clearSession, setSession } from '../../src/service/session'
import { apiOrder, ORDER_ID } from '../fixtures/orders'

vi.mock('../../src/service/fetchProductList', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/service/fetchProductList')>()),
  request: vi.fn(),
}))
const send = vi.mocked(request)

const { cancelOrder, clearOrdersCache, createOrder, fetchOrder, fetchOrdersPage, getCachedOrder, loadAllOrders, onOrdersChanged, OrdersError, quoteShipping } =await import('../../src/service/ordersApi')
const { resetSampleOrders } = await import('../../src/service/sampleOrders')

const page = (data: unknown[], more = false) => ({ data, meta: { total: data.length, page: 1, limit: 100, totalPages: more ? 2 : 1, hasNextPage: more, hasPreviousPage: false } })

beforeEach(() => {
  vi.resetAllMocks()
  vi.useRealTimers()
  clearSession()
  setSession({ name: 'Anne Santos', email: 'anne@example.com' })
  clearOrdersCache()
})

describe('reading an order', () => {
  it('maps the API order: amounts, address snapshot, items and shipment', async () => {
    send.mockResolvedValue(
      apiOrder({
        status: 'DISPATCHED',
        paymentStatus: 'PAID',
        paidAt: '2026-10-26T03:00:00.000Z',
        shipment: { courier: 'Lalamove', serviceType: 'Motorcycle', status: 'ON_GOING', trackingUrl: 'https://t.test/1', driverName: 'Juan', driverPhone: null, driverPlateNumber: 'ABC', deliveryFee: 99, pickupTime: null, deliveredAt: null },
      }),
    )
    const order = await fetchOrder(ORDER_ID)
    expect(send).toHaveBeenCalledWith('GET', `/orders/${ORDER_ID}`, undefined, undefined)
    expect(order).toMatchObject({
      id: ORDER_ID,
      orderNumber: 'SHF-20261026-ABC123',
      status: 'DISPATCHED',
      paymentStatus: 'PAID',
      subtotal: 3780,
      shipping: 99,
      discount: 0,
      total: 3879,
      note: null,
      address: { recipientName: 'Anne Santos', line: '12 Rizal Avenue, Barangay 176', city: 'City of Manila', postalCode: '1000' },
      items: [{ name: 'Heritage Polo', size: 'M', color: 'Navy', unitPrice: 1890, qty: 2, total: 3780, imageUrl: null }],
      shipment: { courier: 'Lalamove', trackingUrl: 'https://t.test/1', driverPhone: null, driverPlate: 'ABC' },
    })
  })

  it('rejects an unknown status, a missing amount and a malformed body as a server error', async () => {
    for (const bad of [apiOrder({ status: 'TELEPORTED' }), apiOrder({ totalAmount: '12' }), apiOrder({ items: null }), null]) {
      send.mockResolvedValueOnce(bad)
      await expect(fetchOrder(ORDER_ID)).rejects.toMatchObject({ kind: 'server' })
    }
  })

  it('keeps a variant-less item as variantId null', async () => {
    send.mockResolvedValue(apiOrder({ items: [{ ...apiOrder().items[0], variantId: null }] }))
    expect((await fetchOrder(ORDER_ID)).items[0].variantId).toBeNull()
  })

  it('reads a shipment that is being dispatched', async () => {
    send.mockResolvedValue(apiOrder({ shipment: { courier: 'Lalamove', serviceType: 'Motorcycle', status: 'DISPATCHING', trackingUrl: null, deliveryFee: 99 } }))
    expect((await fetchOrder(ORDER_ID)).shipment).toMatchObject({ status: 'DISPATCHING' })
  })

  it('lists one page with the query and its meta', async () => {
    send.mockResolvedValue(page([apiOrder()]))
    const result = await fetchOrdersPage({ page: 2, limit: 5, status: 'CANCELLED' })
    expect(send).toHaveBeenCalledWith('GET', '/orders?page=2&limit=5&status=CANCELLED', undefined, undefined)
    expect(result.data).toHaveLength(1)
    expect(result.meta).toMatchObject({ total: 1, hasNextPage: false })
  })

  it('passes an abort through untouched', async () => {
    const abort = new DOMException('Aborted', 'AbortError')
    send.mockRejectedValue(abort)
    await expect(fetchOrder(ORDER_ID)).rejects.toBe(abort)
  })
})

describe('placing an order', () => {
  it('sends exactly the whitelisted keys: no total, shipping fee, payment method or label', async () => {
    send.mockResolvedValue(apiOrder())
    const order = await createOrder({ addressId: 'a1', cartItemIds: ['c1'], shippingFee: 99, quotationId: 'q1', customerNotes: 'Leave at the gate' })
    expect(send).toHaveBeenCalledWith('POST', '/orders', { addressId: 'a1', cartItemIds: ['c1'], quotationId: 'q1', customerNotes: 'Leave at the gate' }, undefined)
    expect(Object.keys(send.mock.calls[0][2] as object).sort()).toEqual(['addressId', 'cartItemIds', 'customerNotes', 'quotationId'])
    expect(order.orderNumber).toBe('SHF-20261026-ABC123')
  })

  it('leaves out the quotation id when there is none', async () => {
    send.mockResolvedValue(apiOrder())
    await createOrder({ addressId: 'a1' })
    expect(send.mock.calls[0][2]).not.toHaveProperty('quotationId')
  })

  it('leaves out an empty note', async () => {
    send.mockResolvedValue(apiOrder())
    await createOrder({ addressId: 'a1', cartItemIds: ['c1'], shippingFee: 99, customerNotes: '' })
    expect(send.mock.calls[0][2]).not.toHaveProperty('customerNotes')
  })

  it.each([
    ['a missing pin', 'Address coordinates (latitude, longitude) are required for delivery quotation and checkout', 'no-coordinates', /Pin this address/],
    ['an expired quote', 'Quotation has expired, request a new shipping quote', 'quote-expired', /delivery fee ran out/],
    ['too little stock', 'Insufficient stock for "Polo (SKU)". Requested: 3, Available: 1', 'validation', /Insufficient stock.*Go back to your cart/],
    ['a gone variant', 'Product variant with ID "x" is no longer available', 'validation', /Go back to your cart/],
    ['an empty cart', 'Your cart is empty', 'validation', /Your cart changed/],
    ['items not in the cart', 'One or more selected items were not found in your cart', 'validation', /Your cart changed/],
  ])('maps %s to the right kind and copy', async (_name, detail, kind, copy) => {
    send.mockRejectedValue(new ProductListError('validation', detail, 400))
    const error = (await createOrder({ addressId: 'a1' }).catch((e: unknown) => e)) as InstanceType<typeof OrdersError>
    expect(error).toBeInstanceOf(OrdersError)
    expect(error).toMatchObject({ kind })
    expect(error.detail).toMatch(copy)
  })

  it('maps a missing address to not-found and a dead session to forbidden', async () => {
    send.mockRejectedValueOnce(new ProductListError('not-found', 'Address with ID "a" not found', 404))
    await expect(createOrder({ addressId: 'a' })).rejects.toMatchObject({ kind: 'not-found', detail: expect.stringMatching(/address is gone/) })
    send.mockRejectedValueOnce(new ProductListError('forbidden', undefined, 401))
    await expect(createOrder({ addressId: 'a' })).rejects.toMatchObject({ kind: 'forbidden', detail: 'Your session ended. Sign in again.' })
  })

  it.each(['rate-limit', 'network', 'server'] as const)('keeps %s as it is', async (kind) => {
    send.mockRejectedValue(new ProductListError(kind))
    await expect(createOrder({ addressId: 'a1' })).rejects.toMatchObject({ kind })
  })
})

describe('quoting shipping', () => {
  const quote = { quotationId: 'q1', courier: 'Lalamove', serviceType: 'MOTORCYCLE', shippingFee: 99, currency: 'PHP', expiresAt: '2026-11-10T08:05:00.000Z' }

  it('posts exactly the address id and keeps the id, fee and expiry', async () => {
    send.mockResolvedValue(quote)
    await expect(quoteShipping('a1')).resolves.toEqual({ quotationId: 'q1', shippingFee: 99, expiresAt: '2026-11-10T08:05:00.000Z' })
    expect(send).toHaveBeenCalledWith('POST', '/orders/quote-shipping', { addressId: 'a1' }, undefined)
  })

  it.each([
    ['no body', null],
    ['no id', { ...quote, quotationId: undefined }],
    ['a fee that is not a number', { ...quote, shippingFee: '99' }],
    ['an expiry that is not a date', { ...quote, expiresAt: 'soon' }],
  ])('treats %s as a server error', async (_name, bad) => {
    send.mockResolvedValue(bad)
    await expect(quoteShipping('a1')).rejects.toMatchObject({ kind: 'server' })
  })

  it('maps a missing pin to no-coordinates and too many requests to rate-limit', async () => {
    send.mockRejectedValueOnce(new ProductListError('validation', 'Address coordinates (latitude, longitude) are required for delivery quotation', 400))
    await expect(quoteShipping('a1')).rejects.toMatchObject({ kind: 'no-coordinates' })
    send.mockRejectedValueOnce(new ProductListError('rate-limit', undefined, 429))
    await expect(quoteShipping('a1')).rejects.toMatchObject({ kind: 'rate-limit' })
  })
})

describe('cancelling', () => {
  it('posts the reason, and an empty body without one', async () => {
    send.mockResolvedValue(apiOrder({ status: 'CANCELLED' }))
    await cancelOrder(ORDER_ID, 'Wrong size')
    expect(send).toHaveBeenCalledWith('POST', `/orders/${ORDER_ID}/cancel`, { cancellationReason: 'Wrong size' }, undefined)
    await cancelOrder(ORDER_ID)
    expect(send.mock.calls[1][2]).toEqual({})
  })

  it('maps a 400 to not-cancellable and a 404 to not-found', async () => {
    send.mockRejectedValueOnce(new ProductListError('validation', 'Only unpaid orders with PENDING_PAYMENT status can be cancelled.', 400))
    await expect(cancelOrder(ORDER_ID)).rejects.toMatchObject({ kind: 'not-cancellable' })
    send.mockRejectedValueOnce(new ProductListError('not-found', undefined, 404))
    await expect(cancelOrder(ORDER_ID)).rejects.toMatchObject({ kind: 'not-found' })
  })
})

describe('loadAllOrders', () => {
  it('reads page after page until the API says there are no more', async () => {
    send.mockResolvedValueOnce(page([apiOrder({ id: 'a' })], true)).mockResolvedValueOnce(page([apiOrder({ id: 'b' })]))
    const all = await loadAllOrders()
    expect(all.map((o) => o.id)).toEqual(['a', 'b'])
    expect(send.mock.calls.map((c) => c[1])).toEqual(['/orders?page=1&limit=100', '/orders?page=2&limit=100'])
  })

  it('stops at five pages', async () => {
    send.mockImplementation(async () => page([apiOrder()], true))
    await loadAllOrders()
    expect(send).toHaveBeenCalledTimes(5)
  })

  it('serves the cache for 30 seconds, shares an in-flight read, and force asks again', async () => {
    send.mockResolvedValue(page([apiOrder()]))
    await Promise.all([loadAllOrders(), loadAllOrders()])
    expect(send).toHaveBeenCalledTimes(1)
    await loadAllOrders()
    expect(send).toHaveBeenCalledTimes(1)
    expect(getCachedOrder(ORDER_ID)).not.toBeNull()
    await loadAllOrders({ force: true })
    expect(send).toHaveBeenCalledTimes(2)
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(Date.now() + 31_000)
    await loadAllOrders()
    expect(send).toHaveBeenCalledTimes(3)
  })

  it('is invalidated, with a notice, by placing and by cancelling an order', async () => {
    send.mockResolvedValue(page([apiOrder()]))
    await loadAllOrders()
    const changed = vi.fn()
    const stop = onOrdersChanged(changed)
    send.mockResolvedValueOnce(apiOrder())
    await createOrder({ addressId: 'a1' })
    expect(changed).toHaveBeenCalledTimes(1)
    expect(getCachedOrder(ORDER_ID)).toBeNull()
    send.mockResolvedValueOnce(apiOrder({ status: 'CANCELLED' }))
    await cancelOrder(ORDER_ID)
    expect(changed).toHaveBeenCalledTimes(2)
    stop()
  })

  it('never caches a failure, never mixes two accounts, and clears on sign out', async () => {
    send.mockRejectedValueOnce(new ProductListError('server')).mockResolvedValue(page([apiOrder()]))
    await expect(loadAllOrders()).rejects.toMatchObject({ kind: 'server' })
    await loadAllOrders()
    expect(send).toHaveBeenCalledTimes(2)
    setSession({ name: 'Other', email: 'other@example.com' })
    expect(getCachedOrder(ORDER_ID)).toBeNull()
    setSession({ name: 'Anne Santos', email: 'anne@example.com' })
    expect(getCachedOrder(ORDER_ID)).not.toBeNull()
    clearOrdersCache()
    expect(getCachedOrder(ORDER_ID)).toBeNull()
  })
})

describe('a simulated account', () => {
  beforeEach(() => {
    resetSampleOrders()
    setSession({ name: 'Staff', email: 'staff@example.com', role: 'admin', simulated: true })
  })

  it('reads sample orders, places and cancels in memory, and never calls the API', async () => {
    const list = await fetchOrdersPage({}, { delayMs: 0 })
    expect(list.data.length).toBeGreaterThanOrEqual(6)
    expect(new Set(list.data.map((o) => o.status)).has('REFUNDED')).toBe(true)
    const placed = await createOrder({ addressId: 'a', shippingFee: 99 }, { delayMs: 0 })
    expect(placed.status).toBe('PENDING_PAYMENT')
    expect((await fetchOrder(placed.id, { delayMs: 0 })).id).toBe(placed.id)
    expect((await cancelOrder(placed.id, 'x', { delayMs: 0 })).status).toBe('CANCELLED')
    await expect(cancelOrder(placed.id, undefined, { delayMs: 0 })).rejects.toMatchObject({ kind: 'not-cancellable' })
    await expect(fetchOrder('00000000-0000-4000-8000-00000000ffff', { delayMs: 0 })).rejects.toMatchObject({ kind: 'not-found' })
    expect(send).not.toHaveBeenCalled()
  })
})
