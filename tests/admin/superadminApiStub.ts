import type { Page, Route } from '@playwright/test'
import { CORS, json } from './staffApiStub'

// A fake GET/POST /users/superadmins for the browser tests, answered here so nothing leaves the machine (same idea as adminApiStub.ts).
// There is no status, archive or reset: nobody can reset or archive a superadmin.

export interface SuperadminRow {
  id: string
  firstName: string
  lastName: string
  fullName: string
  email: string
  role: 'superadmin'
  createdAt: string
}

export const superadminRow = (firstName: string, lastName: string, n = 0): SuperadminRow => ({
  id: `00000000-0000-4000-a000-${String(n).padStart(12, '0')}`,
  firstName,
  lastName,
  fullName: `${firstName} ${lastName}`,
  email: `${firstName}.${lastName}`.toLowerCase() + '@silhoufit.dev',
  role: 'superadmin',
  createdAt: `2026-01-${String((n % 27) + 1).padStart(2, '0')}T08:00:00.000Z`,
})

/** `count` superadmins named "Superab Personab", ... so the name order is the number order. */
export const manySuperadmins = (count: number): SuperadminRow[] =>
  Array.from({ length: count }, (_, i) => {
    const tag = String(i + 1).padStart(2, '0').replace(/\d/g, (d) => 'abcdefghij'[Number(d)])
    return superadminRow(`Super${tag}`, `Person${tag}`, i + 1)
  })

export const SAMPLE_SUPERADMINS: SuperadminRow[] = [superadminRow('Brian', 'Dijamco', 1), superadminRow('Alyssa', 'Ferrer', 2), superadminRow('Carlo', 'Mendoza', 3)]

export interface SuperadminStub {
  rows: SuperadminRow[]
  /** Every GET /users/superadmins the page made. */
  gets: URL[]
  /** Every POST body the page sent. */
  posts: unknown[]
  /** Answer a GET yourself; return true when you did, or nothing to fall through to the default list. */
  onGet?: (route: Route, url: URL) => Promise<boolean | void> | boolean | void
  /** Answer a POST yourself, same rule. */
  onPost?: (route: Route, body: { firstName: string; lastName: string }) => Promise<boolean | void> | boolean | void
}

export async function stubSuperadminApi(page: Page, rows: SuperadminRow[] = SAMPLE_SUPERADMINS): Promise<SuperadminStub> {
  const stub: SuperadminStub = { rows: rows.map((r) => ({ ...r })), gets: [], posts: [] }

  await page.route(
    (url) => url.pathname === '/users/superadmins' && url.port !== '5173',
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
      const account = superadminRow(body.firstName, body.lastName, stub.rows.length + 100)
      stub.rows.push(account)
      return json(route, 201, { account, credentials: { email: account.email, password: 'Tmp#Pass-2026x', mustChangePassword: true } })
    },
  )
  return stub
}
