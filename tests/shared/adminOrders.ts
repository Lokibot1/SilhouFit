import type { Page, Route } from '@playwright/test'

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, content-type, apikey, x-client-info',
  'access-control-allow-methods': 'GET, POST, PATCH, DELETE, OPTIONS',
}

const PAGE_ORIGIN = 'http://localhost:5173'

/** An order as GET /admin/orders/:id sends it (AdminOrderDetailResponseDto). */
export type AdminOrderDto = ReturnType<typeof adminOrder>

/** A uuid that is the same on every run: orders are `adminOrderId(1)`, `adminOrderId(2)`... */
export const adminOrderId = (n: number) => `00000000-0000-4000-8000-${String(800000 + n).padStart(12, '0')}`

/** The time an order was placed: order 1 is 2026-10-01 10:30 Manila, and each next one is an hour later. */
export const placedAt = (n: number) => new Date(Date.UTC(2026, 9, 1, 2, 30) + n * 3_600_000).toISOString()

export const adminCustomer = (over: Record<string, unknown> = {}) => ({
  id: 'u1',
  email: 'anne.santos@example.com',
  firstName: 'Anne',
  lastName: 'Santos',
  fullName: 'Anne Santos',
  avatarUrl: null,
  ...over,
})

/** A ShipmentResponseDto. QUOTED is the default; a rider is booked once `externalOrderId` is set (the real API leaves it null while DISPATCHING). */
export interface AdminShipmentDto {
  id: string
  orderId: string
  courier: string
  serviceType: string
  externalQuotationId: string | null
  externalOrderId: string | null
  trackingUrl: string | null
  status: string
  driverName: string | null
  driverPhone: string | null
  driverPlateNumber: string | null
  deliveryFee: number
  pickupTime: string | null
  deliveredAt: string | null
  cancelledAt: string | null
  lastEventId: string | null
  lastEventAt: string | null
  createdAt: string
  updatedAt: string
}

export const adminShipment = (over: Record<string, unknown> = {}): AdminShipmentDto => ({
  id: 'ship-1',
  orderId: 'o1',
  courier: 'Lalamove',
  serviceType: 'MOTORCYCLE',
  externalQuotationId: 'quote-1',
  externalOrderId: null,
  trackingUrl: null,
  status: 'PENDING_DISPATCH',
  driverName: null,
  driverPhone: null,
  driverPlateNumber: null,
  deliveryFee: 99,
  pickupTime: null,
  deliveredAt: null,
  cancelledAt: null,
  lastEventId: null,
  lastEventAt: null,
  createdAt: '2026-10-01T02:30:00.000Z',
  updatedAt: '2026-10-01T02:30:00.000Z',
  ...over,
} as AdminShipmentDto)

/** An AdminShipmentEventDto. */
export const adminEvent = (n: number, over: Record<string, unknown> = {}) => ({
  id: `event-${n}`,
  eventId: `evt-${n}`,
  eventType: 'ORDER_STATUS_CHANGED',
  courierStatus: 'ASSIGNING_DRIVER',
  eventTimestamp: '2026-10-01T04:00:00.000Z',
  status: 'PROCESSED',
  reason: null,
  createdAt: '2026-10-01T04:00:00.000Z',
  ...over,
})

/** An AdminPaymentTransactionDto. */
export const adminPayment = (n: number, over: Record<string, unknown> = {}) => ({
  id: `pay-${n}`,
  provider: 'PAYMONGO',
  externalPaymentId: `pay_ext_${n}`,
  amount: 3879,
  fee: 96.98,
  netAmount: 3782.02,
  paymentMethod: 'GCASH',
  status: 'PAID',
  createdAt: '2026-10-01T03:00:00.000Z',
  ...over,
})

/** An order with its detail, unpaid and waiting for payment by default. `n` fixes its id, number and time; anything can be overridden. */
export function adminOrder(n: number, over: Record<string, unknown> = {}) {
  const id = adminOrderId(n)
  const createdAt = placedAt(n)
  return {
    id,
    orderNumber: `SHF-20261001-${String(n).padStart(6, '0')}`,
    userId: 'u1',
    customer: adminCustomer() as ReturnType<typeof adminCustomer> | null,
    status: 'PENDING_PAYMENT',
    paymentStatus: 'UNPAID',
    currency: 'PHP',
    subtotalAmount: 3780,
    shippingAmount: 99,
    discountAmount: 0,
    totalAmount: 3879,
    customerNotes: null as string | null,
    adminNotes: null as string | null,
    shippingAddressSnapshot: {
      id: 'a1',
      recipientName: 'Anne Santos',
      phone: '+639171234567',
      region: 'NCR',
      province: null,
      cityMunicipality: 'City of Manila',
      barangay: 'Barangay 176',
      streetAddress: '12 Rizal Avenue',
      addressLine2: null,
      postalCode: '1000',
      latitude: 14.6,
      longitude: 120.98,
      label: 'Home',
    },
    paymentProvider: null,
    paymentCheckoutId: null,
    paidAt: null as string | null,
    cancelledAt: null as string | null,
    cancellationReason: null as string | null,
    createdAt,
    updatedAt: createdAt,
    items: [
      {
        id: `item-${n}`,
        orderId: id,
        variantId: 'variant-1',
        productName: 'Heritage Polo',
        variantSku: 'POLO-M-NAVY',
        variantSize: 'M',
        variantColor: 'Navy',
        unitPrice: 1890,
        quantity: 2,
        totalPrice: 3780,
        imageUrl: null,
        variantStock: 7 as number | null,
        createdAt,
        updatedAt: createdAt,
      },
    ],
    shipment: null as AdminShipmentDto | null,
    shipmentEvents: [] as ReturnType<typeof adminEvent>[],
    paymentTransactions: [] as ReturnType<typeof adminPayment>[],
    ...over,
  }
}

/** A paid order with a delivery that is ready to book. */
export const paidOrder = (n: number, over: Record<string, unknown> = {}) =>
  adminOrder(n, {
    status: 'PAID',
    paymentStatus: 'PAID',
    paidAt: '2026-10-01T03:00:00.000Z',
    paymentTransactions: [adminPayment(n)],
    shipment: adminShipment({ orderId: adminOrderId(n) }),
    ...over,
  })

/** A paid order a rider is booked for (Lalamove is finding a driver). */
export const bookedOrder = (n: number, over: Record<string, unknown> = {}) =>
  paidOrder(n, {
    status: 'DISPATCHED',
    shipment: adminShipment({ orderId: adminOrderId(n), status: 'ASSIGNING_DRIVER', externalOrderId: 'LLM-100', trackingUrl: 'https://track.example.com/abc' }),
    shipmentEvents: [adminEvent(1)],
    ...over,
  })

/** The list row of an order (AdminOrderSummaryDto). */
const summary = (o: AdminOrderDto) => ({
  id: o.id,
  orderNumber: o.orderNumber,
  userId: o.userId,
  customer: o.customer,
  status: o.status,
  paymentStatus: o.paymentStatus,
  currency: o.currency,
  subtotalAmount: o.subtotalAmount,
  shippingAmount: o.shippingAmount,
  discountAmount: o.discountAmount,
  totalAmount: o.totalAmount,
  itemsCount: o.items.length,
  shipmentStatus: o.shipment?.status ?? null,
  adminNotes: o.adminNotes,
  customerNotes: o.customerNotes,
  createdAt: o.createdAt,
  updatedAt: o.updatedAt,
})

export interface AdminReply {
  status: number
  json: unknown
}

/** A Nest error body, e.g. `fail(409, 'Already dispatching')`. */
export const fail = (status: number, message: string | string[] = 'Something went wrong'): AdminReply => ({
  status,
  json: { statusCode: status, message, error: status === 400 ? 'Bad Request' : 'Error' },
})

type Override<A extends unknown[]> = (...args: A) => AdminReply | 'abort' | undefined
export type AdminKind = 'list' | 'metrics' | 'detail' | 'patch' | 'dispatch' | 'cancelDelivery'

export interface AdminOrdersMock {
  /** The server's orders; the list answers them newest first. Push to it to add one. */
  orders: AdminOrderDto[]
  /** The query strings of GET /admin/orders, in order. */
  lists: URLSearchParams[]
  /** How many GET /admin/orders/metrics were made. */
  metrics: number
  /** Every GET /admin/orders/:id (the id), in order. */
  details: string[]
  /** Every PATCH /admin/orders/:id/status. */
  patches: { id: string; body: Record<string, unknown> }[]
  /** Every POST /admin/orders/:id/dispatch (the id). */
  dispatches: string[]
  /** Every POST /admin/orders/:id/cancel-delivery (the id). */
  cancelDeliveries: string[]
  /** Overrides: return a reply, 'abort' for a dropped connection, or undefined to answer normally. Set to undefined to stop. */
  on: {
    list?: Override<[URLSearchParams]>
    metrics?: Override<[]>
    detail?: Override<[string]>
    patch?: Override<[string, Record<string, unknown>]>
    dispatch?: Override<[string]>
    cancelDelivery?: Override<[string]>
  }
  /** Holds every request of a kind until the returned function is called, to see a loading state. */
  hold: (kind: AdminKind) => () => void
}

const LIST_KEYS = ['page', 'limit', 'status', 'paymentStatus', 'startDate', 'endDate', 'search']
const PATCH_KEYS = ['status', 'adminNotes', 'cancellationReason']
const CLOSED = ['DELIVERED', 'CANCELLED', 'REFUNDED']

/**
 * Stands in for the six admin order endpoints with an in-memory list that follows the API: a list that is newest first, has only the keys
 * `AdminOrderQueryDto` declares (anything else, or a limit over 100, is a 400 like the real ValidationPipe), metrics counted from the orders,
 * a detail with 404, a status/notes PATCH (a closed order cannot change status, only a paid one moves on, unknown keys are a 400),
 * a dispatch (409 unless a rider can be booked) and a cancel-delivery (409 unless one is booked). Register it after mockAuth.
 * Only requests to another origin than the page are answered.
 */
export async function mockAdminOrders(page: Page, initial: AdminOrderDto[] = []): Promise<AdminOrdersMock> {
  const gates = new Map<AdminKind, Promise<void>>()
  const mock: AdminOrdersMock = {
    orders: [...initial],
    lists: [],
    metrics: 0,
    details: [],
    patches: [],
    dispatches: [],
    cancelDeliveries: [],
    on: {},
    hold(kind) {
      let release = () => {}
      gates.set(kind, new Promise<void>((resolve) => (release = resolve)))
      return () => {
        gates.delete(kind)
        release()
      }
    },
  }

  const handle = async (route: Route) => {
    const request = route.request()
    const method = request.method()
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    const url = new URL(request.url())
    const [, , , id = null, action = null] = url.pathname.split('/')
    const reply = (r: AdminReply) => route.fulfill({ status: r.status, json: r.json, headers: CORS })
    const apply = async (override: AdminReply | 'abort' | undefined) => {
      if (override === 'abort') {
        await route.abort('connectionreset')
        return true
      }
      if (override) {
        await reply(override)
        return true
      }
      return false
    }
    const wait = async (kind: AdminKind) => {
      const gate = gates.get(kind)
      if (gate) await gate
    }
    const found = mock.orders.find((o) => o.id === id)
    const notFound = () => reply(fail(404, 'Order not found'))
    const now = new Date().toISOString()

    if (!id && method === 'GET') {
      mock.lists.push(url.searchParams)
      await wait('list')
      if (await apply(mock.on.list?.(url.searchParams))) return
      const q = url.searchParams
      const unknown = [...q.keys()].filter((key) => !LIST_KEYS.includes(key))
      if (unknown.length) return reply(fail(400, unknown.map((key) => `property ${key} should not exist`)))
      if (Number(q.get('limit') ?? 10) > 100) return reply(fail(400, 'limit must not be greater than 100'))
      const limit = Number(q.get('limit') ?? 10)
      const pageNo = Number(q.get('page') ?? 1)
      const search = (q.get('search') ?? '').trim().toLowerCase()
      const matched = mock.orders
        .filter((o) => !q.get('status') || o.status === q.get('status'))
        .filter((o) => !q.get('paymentStatus') || o.paymentStatus === q.get('paymentStatus'))
        .filter((o) => !q.get('startDate') || Date.parse(o.createdAt) >= Date.parse(q.get('startDate')!))
        .filter((o) => !q.get('endDate') || Date.parse(o.createdAt) <= Date.parse(q.get('endDate')!))
        .filter((o) => !search || [o.orderNumber, o.customer?.fullName ?? '', o.customer?.email ?? ''].some((v) => v.toLowerCase().includes(search)))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      const totalPages = Math.ceil(matched.length / limit)
      return reply({
        status: 200,
        json: {
          data: matched.slice((pageNo - 1) * limit, pageNo * limit).map(summary),
          meta: { total: matched.length, page: pageNo, limit, totalPages, hasNextPage: pageNo < totalPages, hasPreviousPage: pageNo > 1 },
        },
      })
    }

    if (id === 'metrics' && method === 'GET') {
      mock.metrics += 1
      await wait('metrics')
      if (await apply(mock.on.metrics?.())) return
      const count = (status: string) => mock.orders.filter((o) => o.status === status).length
      return reply({
        status: 200,
        json: {
          pendingPaymentCount: count('PENDING_PAYMENT'),
          processingCount: count('PROCESSING'),
          dispatchedCount: count('DISPATCHED'),
          deliveredTodayCount: count('DELIVERED'),
          totalRevenue: mock.orders.filter((o) => o.paymentStatus === 'PAID').reduce((sum, o) => sum + o.totalAmount, 0),
        },
      })
    }

    if (id && !action && method === 'GET') {
      mock.details.push(id)
      await wait('detail')
      if (await apply(mock.on.detail?.(id))) return
      return found ? reply({ status: 200, json: found }) : notFound()
    }

    if (id && action === 'status' && method === 'PATCH') {
      const body = (request.postDataJSON() ?? {}) as Record<string, unknown>
      mock.patches.push({ id, body })
      await wait('patch')
      if (await apply(mock.on.patch?.(id, body))) return
      if (!found) return notFound()
      const unknown = Object.keys(body).filter((key) => !PATCH_KEYS.includes(key))
      if (unknown.length) return reply(fail(400, unknown.map((key) => `property ${key} should not exist`)))
      const { status, adminNotes, cancellationReason } = body
      if (typeof adminNotes === 'string' && adminNotes.length > 500) return reply(fail(400, 'adminNotes must be shorter than or equal to 500 characters'))
      if (typeof cancellationReason === 'string' && cancellationReason.length > 255) return reply(fail(400, 'cancellationReason must be shorter than or equal to 255 characters'))
      if (typeof status === 'string') {
        if (CLOSED.includes(found.status)) return reply(fail(400, `Cannot change the status of a ${found.status.toLowerCase()} order`))
        if (status !== 'CANCELLED' && found.paymentStatus !== 'PAID') return reply(fail(400, 'Only a paid order can move on'))
        found.status = status
        if (status === 'CANCELLED') {
          found.cancelledAt = now
          found.cancellationReason = typeof cancellationReason === 'string' ? cancellationReason : null
        }
      }
      if (typeof adminNotes === 'string') found.adminNotes = adminNotes
      found.updatedAt = now
      return reply({ status: 200, json: found })
    }

    if (id && action === 'dispatch' && method === 'POST') {
      mock.dispatches.push(id)
      await wait('dispatch')
      if (await apply(mock.on.dispatch?.(id))) return
      if (!found) return notFound()
      if (!found.shipment || !['PENDING_DISPATCH', 'QUOTED', 'CANCELLED', 'FAILED'].includes(found.shipment.status)) return reply(fail(409, 'This order is already being dispatched'))
      found.status = 'DISPATCHED'
      found.shipment = { ...found.shipment, status: 'ASSIGNING_DRIVER', externalOrderId: 'LLM-100', trackingUrl: 'https://track.example.com/abc', cancelledAt: null }
      found.shipmentEvents = [...found.shipmentEvents, adminEvent(found.shipmentEvents.length + 1, { eventTimestamp: now, createdAt: now })]
      return reply({ status: 201, json: found.shipment })
    }

    if (id && action === 'cancel-delivery' && method === 'POST') {
      mock.cancelDeliveries.push(id)
      await wait('cancelDelivery')
      if (await apply(mock.on.cancelDelivery?.(id))) return
      if (!found) return notFound()
      if (!found.shipment?.externalOrderId || ['CANCELLED', 'COMPLETED'].includes(found.shipment.status)) return reply(fail(409, 'No rider is booked for this order'))
      found.status = 'PROCESSING'
      found.shipment = { ...found.shipment, status: 'CANCELLED', cancelledAt: now }
      found.shipmentEvents = [...found.shipmentEvents, adminEvent(found.shipmentEvents.length + 1, { courierStatus: 'CANCELED', eventTimestamp: now, createdAt: now })]
      return reply({ status: 201, json: found })
    }

    return reply({ status: 405, json: {} })
  }

  await page.route((url) => url.origin !== PAGE_ORIGIN && /^\/admin\/orders(\/|$)/.test(url.pathname), handle)
  return mock
}

/** n orders, newest = highest number, all unpaid. */
export const manyAdminOrders = (count: number, over: (n: number) => Record<string, unknown> = () => ({})) => Array.from({ length: count }, (_, i) => adminOrder(i + 1, over(i + 1)))
