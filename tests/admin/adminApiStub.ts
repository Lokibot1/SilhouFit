import type { Page, Route } from '@playwright/test'
import { CORS, json } from './staffApiStub'

// A fake GET/POST /users/admins for the browser tests, answered here so nothing leaves the machine (same idea as staffApiStub.ts).

export interface AdminRow {
  id: string
  firstName: string
  lastName: string
  fullName: string
  email: string
  role: 'admin'
  createdAt: string
}

export const adminRow = (firstName: string, lastName: string, n = 0): AdminRow => ({
  id: `00000000-0000-4000-9000-${String(n).padStart(12, '0')}`,
  firstName,
  lastName,
  fullName: `${firstName} ${lastName}`,
  email: `${firstName}.${lastName}`.toLowerCase() + '@silhoufit.dev',
  role: 'admin',
  createdAt: `2026-01-${String((n % 27) + 1).padStart(2, '0')}T08:00:00.000Z`,
})

/** `count` admins named "Adminab Personab", ... so the name order is the number order. */
export const manyAdmins = (count: number): AdminRow[] =>
  Array.from({ length: count }, (_, i) => {
    const tag = String(i + 1).padStart(2, '0').replace(/\d/g, (d) => 'abcdefghij'[Number(d)])
    return adminRow(`Admin${tag}`, `Person${tag}`, i + 1)
  })

export const SAMPLE_ADMINS: AdminRow[] = [adminRow('Brian', 'Dijamco', 1), adminRow('Alyssa', 'Ferrer', 2), adminRow('Carlo', 'Mendoza', 3)]

export interface AdminStub {
  rows: AdminRow[]
  /** Every GET /users/admins the page made. */
  gets: URL[]
  /** Every POST body the page sent. */
  posts: unknown[]
  /** Answer a GET yourself; return true when you did, or nothing to fall through to the default list. */
  onGet?: (route: Route, url: URL) => Promise<boolean | void> | boolean | void
  /** Answer a POST yourself, same rule. */
  onPost?: (route: Route, body: { firstName: string; lastName: string }) => Promise<boolean | void> | boolean | void
}

export async function stubAdminApi(page: Page, rows: AdminRow[] = SAMPLE_ADMINS): Promise<AdminStub> {
  const stub: AdminStub = { rows: rows.map((r) => ({ ...r })), gets: [], posts: [] }

  await page.route(
    (url) => url.pathname === '/users/admins' && url.port !== '5173',
    async (route) => {
      const request = route.request()
      const url = new URL(request.url())
      if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })

      if (request.method() === 'GET') {
        stub.gets.push(url)
        if (await stub.onGet?.(route, url)) return
        const q = url.searchParams
        const search = (q.get('search') ?? '').toLowerCase()
        const limit = Number(q.get('limit') ?? 10)
        const pageNo = Number(q.get('page') ?? 1)
        const dir = q.get('dir') === 'desc' ? -1 : 1
        const matched = stub.rows.filter((r) => !search || [r.fullName, r.email].some((v) => v.toLowerCase().includes(search)))
        matched.sort((a, b) => dir * (q.get('sort') === 'createdAt' ? a.createdAt.localeCompare(b.createdAt) : a.fullName.localeCompare(b.fullName)))
        return json(route, 200, {
          data: matched.slice((pageNo - 1) * limit, pageNo * limit),
          meta: { total: matched.length, page: pageNo, limit, totalPages: Math.ceil(matched.length / limit) },
        })
      }

      const body = request.postDataJSON() as { firstName: string; lastName: string }
      stub.posts.push(body)
      if (await stub.onPost?.(route, body)) return
      const account = adminRow(body.firstName, body.lastName, stub.rows.length + 100)
      stub.rows.push(account)
      return json(route, 201, { account, credentials: { email: account.email, password: 'Tmp#Pass-2026x', mustChangePassword: true } })
    },
  )
  return stub
}
