import type { Page, Route } from '@playwright/test'

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, content-type, apikey, x-client-info',
  'access-control-allow-methods': 'GET, POST, PATCH, DELETE, OPTIONS',
}

const PAGE_ORIGIN = 'http://localhost:5173'

/** An entry as GET /admin/audit-logs sends it. */
export type AuditLogDto = ReturnType<typeof auditLog>

/** A uuid that is the same on every run: entries are `auditLogId(1)`, `auditLogId(2)`... */
export const auditLogId = (n: number) => `00000000-0000-4000-8000-${String(900000 + n).padStart(12, '0')}`

/** Entry 1 is 2026-10-01 10:30 Manila and each next one is an hour later, so a higher number is newer. */
export const loggedAt = (n: number) => new Date(Date.UTC(2026, 9, 1, 2, 30) + n * 3_600_000).toISOString()

export const userActor = (over: Record<string, unknown> = {}) => ({
  id: 'actor-liza',
  type: 'USER',
  role: 'staff',
  email: 'liza.cruz@silhoufit.dev',
  fullName: 'Liza Cruz',
  ...over,
})

export const systemActor = () => ({ id: null, type: 'SYSTEM', role: null, email: null, fullName: null })

/** A webhook row, which can still carry the customer's name and email (payment webhooks do). */
export const webhookActor = (over: Record<string, unknown> = {}) => ({ id: null, type: 'WEBHOOK', role: null, email: null, fullName: null, ...over })

/** One audit entry. `n` fixes its id and time; anything can be overridden. */
export function auditLog(n: number, over: Record<string, unknown> = {}) {
  return {
    id: auditLogId(n),
    action: 'PRODUCT_UPDATED',
    description: null as string | null,
    changes: null as unknown,
    metadata: null as unknown,
    createdAt: loggedAt(n),
    actor: userActor() as Record<string, unknown>,
    target: { type: 'PRODUCT', id: `target-${n}`, label: `Heritage Polo ${n}` },
    request: { ipAddress: '203.0.113.7', userAgent: 'Mozilla/5.0', requestId: `req-${n}` },
    ...over,
  }
}

export interface AuditReply {
  status: number
  json: unknown
  headers?: Record<string, string>
}

/** A Nest error body, e.g. `failAudit(403, 'Forbidden resource')`. */
export const failAudit = (status: number, message = 'Something went wrong', headers?: Record<string, string>): AuditReply => ({
  status,
  json: { statusCode: status, message, error: 'Error' },
  headers,
})

export interface AuditLogsMock {
  /** The server's entries; the list answers them newest first. */
  logs: AuditLogDto[]
  /** The query strings of every GET /admin/audit-logs, in order. */
  lists: URLSearchParams[]
  /** Return a reply, 'abort' for a dropped connection, or undefined to answer normally. Set to undefined to stop. */
  on: { list?: (query: URLSearchParams) => AuditReply | 'abort' | undefined }
  /** Holds every request until the returned function is called, to see a loading state. */
  hold: () => () => void
}

const KEYS = ['page', 'limit', 'action', 'actorId', 'startDate', 'endDate', 'search']

/**
 * Stands in for GET /admin/audit-logs with an in-memory list that follows the API: newest first, only the keys the API declares
 * (anything else, or a limit over 100, is a 400), filtered by action, actorId, startDate and search, with a `meta` block.
 * Register it after the sign-in. Only requests to another origin than the page are answered.
 */
export async function mockAuditLogs(page: Page, initial: AuditLogDto[] = []): Promise<AuditLogsMock> {
  let gate: Promise<void> | null = null
  const mock: AuditLogsMock = {
    logs: [...initial],
    lists: [],
    on: {},
    hold() {
      let release = () => {}
      gate = new Promise<void>((resolve) => (release = resolve))
      return () => {
        gate = null
        release()
      }
    },
  }

  const handle = async (route: Route) => {
    const request = route.request()
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    const url = new URL(request.url())
    const q = url.searchParams
    mock.lists.push(q)
    if (gate) await gate
    const override = mock.on.list?.(q)
    if (override === 'abort') return route.abort('connectionreset')
    if (override) return route.fulfill({ status: override.status, json: override.json, headers: { ...CORS, ...override.headers } })

    const unknown = [...q.keys()].filter((key) => !KEYS.includes(key))
    if (unknown.length) return route.fulfill({ status: 400, json: failAudit(400, `property ${unknown[0]} should not exist`).json, headers: CORS })
    const limit = Number(q.get('limit') ?? 10)
    if (limit > 100) return route.fulfill({ status: 400, json: failAudit(400, 'limit must not be greater than 100').json, headers: CORS })
    const pageNo = Number(q.get('page') ?? 1)
    const search = (q.get('search') ?? '').trim().toLowerCase()
    const matched = mock.logs
      .filter((l) => !q.get('action') || l.action === q.get('action'))
      .filter((l) => !q.get('actorId') || l.actor.id === q.get('actorId'))
      .filter((l) => !q.get('startDate') || Date.parse(l.createdAt) >= Date.parse(q.get('startDate')!))
      .filter((l) => !search || [l.description ?? '', l.target.label, String(l.actor.email ?? ''), l.target.id].some((v) => v.toLowerCase().includes(search)))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    const totalPages = Math.ceil(matched.length / limit)
    return route.fulfill({
      status: 200,
      headers: CORS,
      json: {
        data: matched.slice((pageNo - 1) * limit, pageNo * limit),
        meta: { total: matched.length, page: pageNo, limit, totalPages, hasNextPage: pageNo < totalPages, hasPreviousPage: pageNo > 1 },
      },
    })
  }

  await page.route((url) => url.origin !== PAGE_ORIGIN && /^\/admin\/audit-logs(\/|$)/.test(url.pathname), handle)
  return mock
}

/** n entries, newest = highest number. */
export const manyAuditLogs = (count: number, over: (n: number) => Record<string, unknown> = () => ({})) => Array.from({ length: count }, (_, i) => auditLog(i + 1, over(i + 1)))
