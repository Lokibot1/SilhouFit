import type { Page, Route } from '@playwright/test'
import { adminCustomer, adminOrder, adminOrderId, fail, placedAt, type AdminReply } from './adminOrders'

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, content-type, apikey, x-client-info',
  'access-control-allow-methods': 'GET, POST, PATCH, DELETE, OPTIONS',
}

const PAGE_ORIGIN = 'http://localhost:5173'

/** A payment as GET /admin/transactions/:id sends it (the list sends the same without rawPayload and updatedAt, which the mock leaves in; the app ignores them). */
export type AdminTransactionDto = ReturnType<typeof adminTransaction>

/** A uuid that is the same on every run: payments are `transactionId(1)`, `transactionId(2)`... */
export const transactionId = (n: number) => `00000000-0000-4000-9000-${String(900000 + n).padStart(12, '0')}`

/** The order number of payment n's order. */
export const transactionOrderNumber = (n: number) => `SHF-20261001-${String(n).padStart(6, '0')}`

/** A payment: PAID by GCash through PayMongo with a fee reported. `n` fixes its id, order, reference, amount (higher n = bigger and newer); anything can be overridden. */
export function adminTransaction(n: number, over: Record<string, unknown> = {}) {
  const amount = 1000 + n * 100
  return {
    id: transactionId(n),
    orderId: adminOrderId(n),
    provider: 'paymongo',
    externalPaymentId: `pay_ext_${n}`,
    amount,
    fee: 25 as number | null,
    netAmount: (amount - 25) as number | null,
    paymentMethod: 'GCASH',
    status: 'PAID',
    createdAt: placedAt(n),
    updatedAt: placedAt(n),
    customer: adminCustomer({ fullName: `Customer ${n}`, email: `customer${n}@example.com` }) as ReturnType<typeof adminCustomer> | null,
    order: { id: adminOrderId(n), orderNumber: transactionOrderNumber(n), status: 'PAID', totalAmount: amount },
    rawPayload: { id: `pay_ext_${n}`, attributes: { amount: amount * 100, status: 'paid' } } as Record<string, unknown> | null,
    ...over,
  }
}

/** n payments, newest = highest number. */
export const manyAdminTransactions = (count: number, over: (n: number) => Record<string, unknown> = () => ({})) =>
  Array.from({ length: count }, (_, i) => adminTransaction(i + 1, over(i + 1)))

type Override<A extends unknown[]> = (...args: A) => AdminReply | 'abort' | undefined
export type TransactionKind = 'list' | 'metrics' | 'detail'

export interface AdminTransactionsMock {
  /** The server's payments. Push to it to add one. */
  transactions: AdminTransactionDto[]
  /** The query strings of GET /admin/transactions, in order. */
  lists: URLSearchParams[]
  /** How many GET /admin/transactions/metrics were made. */
  metrics: number
  /** Every GET /admin/transactions/:id (the id), in order. */
  details: string[]
  /** Every GET /admin/orders/:id (the order id), in order: the drawer builds the items and the invoice from it. */
  orders: string[]
  /** Overrides: return a reply, 'abort' for a dropped connection, or undefined to answer normally. Set to undefined to stop. */
  on: { list?: Override<[URLSearchParams]>; metrics?: Override<[]>; detail?: Override<[string]> }
  /** Pins the `meta.total` the list reports (to test the export cap without 1,001 rows); undefined reports the real count. */
  reportTotal?: number
  /** Holds every request of a kind until the returned function is called, to see a loading state. */
  hold: (kind: TransactionKind) => () => void
}

const LIST_KEYS = ['page', 'limit', 'status', 'paymentMethod', 'provider', 'orderId', 'startDate', 'endDate', 'search', 'sortBy', 'sortOrder']
const STATUSES = ['UNPAID', 'PENDING', 'PAID', 'FAILED', 'REFUNDED']
const METHODS = ['GCASH', 'PAYMAYA', 'CARD', 'GRAB_PAY', 'BILLEASE', 'OTHER']
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Stands in for the three admin transaction endpoints with an in-memory list that follows AdminTransactionQueryDto: only the declared keys
 * (anything else, a bad enum value, a non-uuid orderId or a limit over 100 is a 400 like the real ValidationPipe), filters, search, sort and paging
 * honoured, metrics counted from the payments (volumes are paid payments only) and a detail with 404. Register it after mockAuth.
 * Only requests to another origin than the page are answered.
 */
export async function mockAdminTransactions(page: Page, initial: AdminTransactionDto[] = []): Promise<AdminTransactionsMock> {
  const gates = new Map<TransactionKind, Promise<void>>()
  const mock: AdminTransactionsMock = {
    transactions: [...initial],
    lists: [],
    metrics: 0,
    details: [],
    orders: [],
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
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    const url = new URL(request.url())
    const [, , , id = null] = url.pathname.split('/')
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
    const wait = async (kind: TransactionKind) => {
      const gate = gates.get(kind)
      if (gate) await gate
    }
    if (request.method() !== 'GET') return reply({ status: 405, json: {} })

    if (!id) {
      mock.lists.push(url.searchParams)
      await wait('list')
      if (await apply(mock.on.list?.(url.searchParams))) return
      const q = url.searchParams
      const unknown = [...q.keys()].filter((key) => !LIST_KEYS.includes(key))
      if (unknown.length) return reply(fail(400, unknown.map((key) => `property ${key} should not exist`)))
      if (Number(q.get('limit') ?? 10) > 100) return reply(fail(400, 'limit must not be greater than 100'))
      if (q.get('status') && !STATUSES.includes(q.get('status')!)) return reply(fail(400, 'status must be a valid enum value'))
      if (q.get('paymentMethod') && !METHODS.includes(q.get('paymentMethod')!)) return reply(fail(400, 'paymentMethod must be a valid enum value'))
      if (q.get('orderId') && !UUID.test(q.get('orderId')!)) return reply(fail(400, 'orderId must be a UUID'))
      if (q.get('sortBy') && !['createdAt', 'amount'].includes(q.get('sortBy')!)) return reply(fail(400, 'sortBy must be one of the following values: createdAt, amount'))
      const limit = Number(q.get('limit') ?? 10)
      const pageNo = Number(q.get('page') ?? 1)
      const search = (q.get('search') ?? '').trim().toLowerCase()
      const sortBy = q.get('sortBy') === 'amount' ? 'amount' : 'createdAt'
      const direction = q.get('sortOrder') === 'asc' ? 1 : -1
      const matched = mock.transactions
        .filter((t) => !q.get('status') || t.status === q.get('status'))
        .filter((t) => !q.get('paymentMethod') || t.paymentMethod === q.get('paymentMethod'))
        .filter((t) => !q.get('provider') || t.provider.toLowerCase() === q.get('provider')!.toLowerCase())
        .filter((t) => !q.get('orderId') || t.orderId === q.get('orderId'))
        .filter((t) => !q.get('startDate') || Date.parse(t.createdAt) >= Date.parse(q.get('startDate')!))
        .filter((t) => !q.get('endDate') || Date.parse(t.createdAt) <= Date.parse(q.get('endDate')!))
        .filter((t) => !search || [t.order.orderNumber, t.externalPaymentId, t.customer?.fullName ?? '', t.customer?.email ?? ''].some((v) => v.toLowerCase().includes(search)))
        .sort((a, b) => (sortBy === 'amount' ? a.amount - b.amount : a.createdAt.localeCompare(b.createdAt)) * direction)
      const total = mock.reportTotal ?? matched.length
      return reply({
        status: 200,
        json: { data: matched.slice((pageNo - 1) * limit, pageNo * limit), meta: { total, page: pageNo, limit, totalPages: Math.ceil(total / limit) } },
      })
    }

    if (id === 'metrics') {
      mock.metrics += 1
      await wait('metrics')
      if (await apply(mock.on.metrics?.())) return
      const all = mock.transactions
      const paid = all.filter((t) => t.status === 'PAID')
      const count = (status: string) => all.filter((t) => t.status === status).length
      const sum = (rows: AdminTransactionDto[], pick: (t: AdminTransactionDto) => number | null) => rows.reduce((total, t) => total + (pick(t) ?? 0), 0)
      return reply({
        status: 200,
        json: {
          totalTransactions: all.length,
          paidCount: paid.length,
          refundedCount: count('REFUNDED'),
          failedCount: count('FAILED'),
          pendingCount: count('PENDING'),
          totalGrossVolume: sum(paid, (t) => t.amount),
          totalFeeVolume: sum(paid, (t) => t.fee),
          totalNetVolume: sum(paid, (t) => t.netAmount),
        },
      })
    }

    mock.details.push(id)
    await wait('detail')
    if (await apply(mock.on.detail?.(id))) return
    const found = mock.transactions.find((t) => t.id === id)
    return found ? reply({ status: 200, json: found }) : reply(fail(404, 'Transaction not found'))
  }

  // The order behind payment n (adminOrderId(n)), paid, with the default item and delivery fee; an unknown id is a 404.
  const handleOrder = async (route: Route) => {
    const request = route.request()
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    const id = new URL(request.url()).pathname.split('/')[3]
    mock.orders.push(id)
    const found = mock.transactions.find((t) => t.orderId === id)
    if (!found) return route.fulfill({ status: 404, json: fail(404, 'Order not found').json, headers: CORS })
    const n = Number(id.slice(-6)) - 800000
    return route.fulfill({
      status: 200,
      json: adminOrder(n, { status: 'PAID', paymentStatus: 'PAID', customer: found.customer, paymentTransactions: [] }),
      headers: CORS,
    })
  }

  await page.route((url) => url.origin !== PAGE_ORIGIN && /^\/admin\/transactions(\/|$)/.test(url.pathname), handle)
  await page.route((url) => url.origin !== PAGE_ORIGIN && /^\/admin\/orders\/[^/]+$/.test(url.pathname), handleOrder)
  return mock
}
