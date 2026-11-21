import type { Page, Route } from '@playwright/test'
import { fail, type AdminReply } from './adminOrders'

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, content-type, apikey, x-client-info',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
}
const PAGE_ORIGIN = 'http://localhost:5173'

/** A uuid that is the same on every run: refunds are `adminRefundId(1)`, `adminRefundId(2)`... */
export const adminRefundId = (n: number) => `00000000-0000-4000-8000-${String(900000 + n).padStart(12, '0')}`
export type AdminRefundDto = ReturnType<typeof adminRefund>

/** A refund as GET /admin/refunds/:id sends it. FAILED by default, so it can be retried; refund 1 is the newest. */
export const adminRefund = (n: number, over: Record<string, unknown> = {}) => ({
  id: adminRefundId(n),
  orderId: `o${n}`,
  paymentTransactionId: `p${n}`,
  provider: 'paymongo',
  externalPaymentId: `pay_${n}`,
  externalRefundId: `ref_${n}`,
  idempotencyKey: `k${n}`,
  providerIdempotencyKey: `k${n}-1`,
  providerAttemptSeq: 1,
  amount: 1000 + n,
  currency: 'PHP',
  status: 'FAILED',
  reason: 'LATE_PAYMENT_ON_CANCELLED_ORDER',
  reasonNotes: null,
  triggerSource: 'SYSTEM_AUTO',
  resolutionType: 'PROVIDER_API',
  manualReference: null,
  failureCode: 'balance_low',
  failureMessage: 'The gateway balance is too low.',
  attemptCount: 1,
  claimedAt: null,
  lastAttemptAt: null,
  nextRetryAt: null,
  succeededAt: null,
  createdAt: new Date(Date.UTC(2026, 9, 1, 2, 30) - n * 3_600_000).toISOString(),
  updatedAt: '2026-10-26T02:41:00.000Z',
  order: { id: `o${n}`, orderNumber: `SHF-2026100${n}-ABC`, status: 'CANCELLED', paymentStatus: 'PAID', currency: 'PHP', totalAmount: 1000 + n, createdAt: '2026-10-26T02:25:00.000Z' },
  paymentTransaction: null,
  customer: { id: 'u1', email: 'anne@example.com', firstName: 'Anne', lastName: 'Santos', fullName: 'Anne Santos', avatarUrl: null },
  initiatedBy: null,
  resolvedBy: null,
  rawProviderResponse: null,
  ...over,
})

export const manyAdminRefunds = (count: number) => Array.from({ length: count }, (_, i) => adminRefund(i + 1))

export interface AdminRefundsMock {
  refunds: AdminRefundDto[]
  /** The query strings of GET /admin/refunds, in order. */
  lists: URLSearchParams[]
  /** Every POST (the path after /admin/refunds), in order. */
  posts: string[]
  /** The JSON body of each POST, in the same order as `posts`; null where none was sent. */
  bodies: unknown[]
  /** The next answer to a POST; the refund is returned as it is when unset. */
  nextPost?: AdminReply
}

const LIST_KEYS = ['page', 'limit', 'status', 'reason', 'search', 'sortBy', 'sortOrder']

/**
 * Stands in for the /admin/refunds endpoints with an in-memory list: only the keys the API knows (anything else is a 400), a limit of 100 at most,
 * metrics counted from the refunds, a detail with 404, and retry, sync and resolve-manual that answer 200 with the refund. Register it after mockAuth.
 * Only requests to another origin than the page are answered.
 */
export async function mockAdminRefunds(page: Page, initial: AdminRefundDto[] = []): Promise<AdminRefundsMock> {
  const mock: AdminRefundsMock = { refunds: [...initial], lists: [], posts: [], bodies: [] }
  const handle = async (route: Route) => {
    const request = route.request()
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    const url = new URL(request.url())
    const reply = (r: AdminReply) => route.fulfill({ status: r.status, json: r.json, headers: CORS })
    const [, , , id = null] = url.pathname.split('/')
    if (request.method() === 'POST') {
      mock.posts.push(url.pathname.replace('/admin/refunds', ''))
      mock.bodies.push(request.postData() ? request.postDataJSON() : null)
      if (mock.nextPost) {
        const next = mock.nextPost
        mock.nextPost = undefined
        return reply(next)
      }
      const found = mock.refunds.find((r) => r.id === id)
      return found ? reply({ status: 200, json: found }) : reply(fail(404, 'Refund not found'))
    }
    if (id === 'metrics') {
      const count = (status: string) => mock.refunds.filter((r) => r.status === status).length
      return reply({
        status: 200,
        json: {
          totalRefunds: mock.refunds.length,
          requestedCount: count('REQUESTED'),
          processingCount: count('PROCESSING'),
          succeededCount: count('SUCCEEDED'),
          failedCount: count('FAILED'),
          requiresManualActionCount: count('REQUIRES_MANUAL_ACTION'),
          cancelledCount: count('CANCELLED'),
          totalRefundedVolume: 0,
          pendingRefundLiabilityVolume: mock.refunds.filter((r) => r.status !== 'SUCCEEDED' && r.status !== 'CANCELLED').reduce((sum, r) => sum + r.amount, 0),
          currency: 'PHP',
        },
      })
    }
    if (id) {
      const found = mock.refunds.find((r) => r.id === id)
      return found ? reply({ status: 200, json: found }) : reply(fail(404, 'Refund not found'))
    }
    const q = url.searchParams
    mock.lists.push(q)
    const unknown = [...q.keys()].filter((key) => !LIST_KEYS.includes(key))
    if (unknown.length) return reply(fail(400, unknown.map((key) => `property ${key} should not exist`)))
    if (Number(q.get('limit') ?? 10) > 100) return reply(fail(400, 'limit must not be greater than 100'))
    const limit = Number(q.get('limit') ?? 10)
    const pageNo = Number(q.get('page') ?? 1)
    const search = (q.get('search') ?? '').trim().toLowerCase()
    const sign = q.get('sortOrder') === 'asc' ? 1 : -1
    const matched = mock.refunds
      .filter((r) => !q.get('status') || r.status === q.get('status'))
      .filter((r) => !search || [r.order.orderNumber, r.customer.fullName, r.customer.email, r.externalPaymentId].some((v) => v.toLowerCase().includes(search)))
      .sort((a, b) => sign * (q.get('sortBy') === 'amount' ? a.amount - b.amount : a.createdAt.localeCompare(b.createdAt)))
    const totalPages = Math.ceil(matched.length / limit)
    return reply({
      status: 200,
      json: { data: matched.slice((pageNo - 1) * limit, pageNo * limit), meta: { total: matched.length, page: pageNo, limit, totalPages, hasNextPage: pageNo < totalPages, hasPreviousPage: pageNo > 1 } },
    })
  }
  await page.route((url) => url.origin !== PAGE_ORIGIN && /^\/admin\/refunds(\/|$)/.test(url.pathname), handle)
  return mock
}
