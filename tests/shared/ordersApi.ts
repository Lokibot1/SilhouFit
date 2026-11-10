import type { Page, Route } from '@playwright/test'
import { apiOrder } from '../fixtures/orders'
import type { CartMock, ProductsMock } from './products'

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, content-type, apikey, x-client-info',
  'access-control-allow-methods': 'GET, POST, PATCH, DELETE, OPTIONS',
}

const PAGE_ORIGIN = 'http://localhost:5173'

export type ApiOrder = ReturnType<typeof apiOrder>

/** A uuid that is the same on every run: orders are `orderId(1)`, `orderId(2)`... */
export const orderId = (n: number) => `00000000-0000-4000-8000-${String(900000 + n).padStart(12, '0')}`

/** An order as the API sends it, with a number, a day (newest = highest `day`) and any field overridden. */
export function order(n: number, over: Record<string, unknown> = {}): ApiOrder {
  const createdAt = new Date(Date.UTC(2026, 9, 1, 2, 30) + n * 3_600_000).toISOString()
  return apiOrder({
    id: orderId(n),
    orderNumber: `SHF-20261001-${String(n).padStart(6, '0')}`,
    createdAt,
    updatedAt: createdAt,
    ...over,
  })
}

/** An API shipment. */
export const apiShipment = (over: Record<string, unknown> = {}) => ({
  id: 's1',
  orderId: 'o1',
  courier: 'Lalamove',
  serviceType: 'Motorcycle',
  externalQuotationId: null,
  externalOrderId: null,
  trackingUrl: 'https://track.example.com/abc',
  status: 'ON_GOING',
  driverName: 'Juan Dela Cruz',
  driverPhone: '+639171112222',
  driverPlateNumber: 'ABC 1234',
  deliveryFee: 99,
  pickupTime: '2026-10-27T02:00:00.000Z',
  deliveredAt: null,
  cancelledAt: null,
  createdAt: '2026-10-26T02:30:00.000Z',
  updatedAt: '2026-10-26T02:30:00.000Z',
  ...over,
})

export interface OrderReply {
  status: number
  json: unknown
}

export interface OrdersMock {
  /** The server's orders; the list answers them newest first. Push to it to add one. */
  orders: ApiOrder[]
  /** The bodies of POST /orders, in order. */
  posts: Record<string, unknown>[]
  /** The bodies of POST /orders/quote-shipping, in order. */
  quotes: Record<string, unknown>[]
  /** The query strings of GET /orders, in order. */
  lists: URLSearchParams[]
  /** Every GET /orders/:id (the id), in order. */
  details: string[]
  /** Every POST /orders/:id/cancel, in order. */
  cancels: { id: string; body: Record<string, unknown> | null }[]
  /** Overrides for the next requests of a kind: return a reply, 'abort' for a dropped connection, or undefined to answer normally. */
  on: {
    create?: (body: Record<string, unknown>) => OrderReply | 'abort' | undefined
    quote?: (body: Record<string, unknown>) => OrderReply | 'abort' | undefined
    list?: (query: URLSearchParams) => OrderReply | 'abort' | undefined
    cancel?: (id: string) => OrderReply | 'abort' | undefined
    /** Held until the returned promise resolves, to test double clicks and pending states. */
    gate?: Promise<void>
  }
}

interface Deps {
  cart?: CartMock
  products?: ProductsMock
}

/**
 * Stands in for the orders API (POST /orders, GET /orders, GET /orders/:id, POST /orders/:id/cancel) with an in-memory list that
 * follows the API's rules: 201 on create (a new PENDING_PAYMENT/UNPAID order with the cart lines named in `cartItemIds`, priced by the
 * products mock, plus the shipping fee of the quote named by `quotationId`), a list with `{ data, meta }` and an optional `status`, 404 for an unknown id, and a cancel
 * only for an unpaid PENDING_PAYMENT order (else 400). Unknown body keys are a 400 like the real ValidationPipe's forbidNonWhitelisted.
 * Register it after mockAuth. Only requests to another origin than the page are answered (the dev server also serves /src/.../orders/*).
 */
export async function mockOrders(page: Page, initial: ApiOrder[] = [], { cart, products }: Deps = {}): Promise<OrdersMock> {
  const mock: OrdersMock = { orders: [...initial], posts: [], quotes: [], lists: [], details: [], cancels: [], on: {} }
  let created = 0
  // The fee of every quote handed out, by quotationId: a created order is priced with the one it names.
  const fees = new Map<string, number>()
  let lastFee = 0
  const remember = (json: unknown) => {
    const quote = json as { quotationId?: unknown; shippingFee?: unknown }
    if (typeof quote?.quotationId === 'string' && typeof quote.shippingFee === 'number') {
      fees.set(quote.quotationId, quote.shippingFee)
      lastFee = quote.shippingFee
    }
  }

  const handle = async (route: Route) => {
    const request = route.request()
    const method = request.method()
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    const url = new URL(request.url())
    const [, , id = null, action = null] = url.pathname.split('/')
    const reply = (r: OrderReply) => route.fulfill({ status: r.status, json: r.json, headers: CORS })
    const apply = async (override: OrderReply | 'abort' | undefined) => {
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

    if (!id && method === 'GET') {
      mock.lists.push(url.searchParams)
      if (await apply(mock.on.list?.(url.searchParams))) return
      const status = url.searchParams.get('status')
      const limit = Math.min(Number(url.searchParams.get('limit')) || 10, 100)
      const pageNo = Number(url.searchParams.get('page')) || 1
      const matched = mock.orders.filter((o) => !status || o.status === status).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      const totalPages = Math.ceil(matched.length / limit)
      return reply({
        status: 200,
        json: {
          data: matched.slice((pageNo - 1) * limit, pageNo * limit),
          meta: { total: matched.length, page: pageNo, limit, totalPages, hasNextPage: pageNo < totalPages, hasPreviousPage: pageNo > 1 },
        },
      })
    }

    if (id === 'quote-shipping' && method === 'POST') {
      const body = (request.postDataJSON() ?? {}) as Record<string, unknown>
      mock.quotes.push(body)
      const override = mock.on.quote?.(body)
      if (override && override !== 'abort') remember(override.json)
      if (await apply(override)) return
      const expiresAt = new Date(Date.now() + 5 * 60_000).toISOString()
      const json = { quotationId: 'q1', courier: 'Lalamove', serviceType: 'MOTORCYCLE', shippingFee: 99, currency: 'PHP', expiresAt }
      remember(json)
      return reply({ status: 201, json })
    }

    if (!id && method === 'POST') {
      const body = (request.postDataJSON() ?? {}) as Record<string, unknown>
      mock.posts.push(body)
      if (mock.on.gate) await mock.on.gate
      if (await apply(mock.on.create?.(body))) return
      const extra = Object.keys(body).filter((key) => !['addressId', 'cartItemIds', 'customerNotes', 'quotationId'].includes(key))
      if (extra.length) return reply({ status: 400, json: { statusCode: 400, message: extra.map((key) => `property ${key} should not exist`), error: 'Bad Request' } })
      const ids = (body.cartItemIds as string[] | undefined) ?? []
      const lines = ids.flatMap((itemId) => {
        const item = cart?.items.find((i) => i.id === itemId)
        const rows = products?.rows ?? []
        const hit = item && rows.flatMap((p) => p.variants.map((v) => ({ p, v }))).find(({ v }) => v.id === item.variantId)
        return item && hit ? [{ itemId, ...hit, quantity: item.quantity }] : []
      })
      const stamp = new Date(Date.UTC(2026, 10, 1, 2, 30) + created * 60_000).toISOString()
      const number = 800 + ++created
      const shipping = fees.get(body.quotationId as string) ?? (typeof body.shippingFee === 'number' ? body.shippingFee : lastFee)
      const subtotal = lines.reduce((sum, l) => sum + l.v.price * l.quantity, 0)
      const placed = order(number, {
        id: orderId(number),
        orderNumber: `SHF-20261101-${String(number).padStart(6, '0')}`,
        createdAt: stamp,
        updatedAt: stamp,
        subtotalAmount: subtotal,
        shippingAmount: shipping,
        totalAmount: subtotal + shipping,
        customerNotes: (body.customerNotes as string | undefined) ?? null,
        items: lines.map((l, i) => ({
          id: `00000000-0000-4000-8000-${String(700000 + number * 10 + i).padStart(12, '0')}`,
          orderId: orderId(number),
          variantId: l.v.id,
          productName: l.p.name,
          variantSku: l.v.sku,
          variantSize: l.v.size,
          variantColor: l.v.color,
          unitPrice: l.v.price,
          quantity: l.quantity,
          totalPrice: l.v.price * l.quantity,
          imageUrl: null,
          createdAt: stamp,
          updatedAt: stamp,
        })),
      })
      mock.orders.push(placed)
      return reply({ status: 201, json: placed })
    }

    const found = mock.orders.find((o) => o.id === id)
    if (id && !action && method === 'GET') {
      mock.details.push(id)
      return found ? reply({ status: 200, json: found }) : reply({ status: 404, json: { statusCode: 404, message: 'Order not found', error: 'Not Found' } })
    }

    if (id && action === 'cancel' && method === 'POST') {
      const body = (request.postDataJSON() ?? null) as Record<string, unknown> | null
      mock.cancels.push({ id, body })
      if (mock.on.gate) await mock.on.gate
      if (await apply(mock.on.cancel?.(id))) return
      if (!found) return reply({ status: 404, json: { statusCode: 404, message: 'Order not found', error: 'Not Found' } })
      if (found.status !== 'PENDING_PAYMENT' || found.paymentStatus === 'PAID') {
        return reply({ status: 400, json: { statusCode: 400, message: 'Only unpaid orders with PENDING_PAYMENT status can be cancelled', error: 'Bad Request' } })
      }
      Object.assign(found, {
        status: 'CANCELLED',
        cancelledAt: '2026-11-01T03:00:00.000Z',
        cancellationReason: typeof body?.cancellationReason === 'string' ? body.cancellationReason : null,
      })
      return reply({ status: 201, json: found })
    }

    return reply({ status: 405, json: {} })
  }

  await page.route((url) => url.origin !== PAGE_ORIGIN && /^\/orders(\/|$)/.test(url.pathname), handle)
  return mock
}
