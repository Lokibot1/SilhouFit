import type { Page, Route } from '@playwright/test'

// A fake GET/POST /users/staff for the browser tests. There are no real Supabase credentials, so the API is answered here and nothing
// leaves the machine. The simulated dev sign-in is enough: the request is stubbed before it reaches the network.

export interface StaffRow {
  id: string
  firstName: string
  lastName: string
  fullName: string
  username: string
  email: string
  role: 'staff'
  createdAt: string
}

export const staffRow = (firstName: string, lastName: string, n = 0): StaffRow => {
  const username = `${firstName}.${lastName}`.toLowerCase()
  return {
    id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
    firstName,
    lastName,
    fullName: `${firstName} ${lastName}`,
    username,
    email: `${username}@silhoufit.dev`,
    role: 'staff',
    createdAt: `2026-01-${String((n % 27) + 1).padStart(2, '0')}T08:00:00.000Z`,
  }
}

/** `count` staff named "Staff01 Person01", "Staff02 Person02" ... so the name order is the number order. */
export const manyStaff = (count: number): StaffRow[] =>
  Array.from({ length: count }, (_, i) => {
    const tag = String(i + 1).padStart(2, '0')
    return staffRow(`Staff${tag.replace(/\d/g, (d) => 'abcdefghij'[Number(d)])}`, `Person${tag.replace(/\d/g, (d) => 'abcdefghij'[Number(d)])}`, i + 1)
  })

export const SAMPLE_STAFF: StaffRow[] = [staffRow('Lara', 'Santos', 1), staffRow('Miguel', 'Cruz', 2), staffRow('Nina', 'Reyes', 3)]

export interface StaffStub {
  rows: StaffRow[]
  /** Every GET /users/staff the page made. */
  gets: URL[]
  /** Every POST body the page sent. */
  posts: unknown[]
  /** Answer a GET yourself; return true when you did, or nothing to fall through to the default list. */
  onGet?: (route: Route, url: URL) => Promise<boolean | void> | boolean | void
  /** Answer a POST yourself, same rule. */
  onPost?: (route: Route, body: { firstName: string; lastName: string }) => Promise<boolean | void> | boolean | void
}

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization,content-type',
  'access-control-allow-methods': 'GET,POST,OPTIONS',
}

export const json = (route: Route, status: number, body: unknown) =>
  route.fulfill({ status, headers: CORS, contentType: 'application/json', body: JSON.stringify(body) })

export async function stubStaffApi(page: Page, rows: StaffRow[] = SAMPLE_STAFF): Promise<StaffStub> {
  const stub: StaffStub = { rows: [...rows], gets: [], posts: [] }

  await page.route(
    (url) => url.pathname === '/users/staff' && url.port !== '5173',
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
        const matched = stub.rows.filter((r) => !search || [r.fullName, r.username, r.email].some((v) => v.toLowerCase().includes(search)))
        matched.sort((a, b) => dir * (q.get('sort') === 'createdAt' ? a.createdAt.localeCompare(b.createdAt) : a.fullName.localeCompare(b.fullName)))
        return json(route, 200, {
          data: matched.slice((pageNo - 1) * limit, pageNo * limit),
          meta: { total: matched.length, page: pageNo, limit, totalPages: Math.ceil(matched.length / limit) },
        })
      }

      const body = request.postDataJSON() as { firstName: string; lastName: string }
      stub.posts.push(body)
      if (await stub.onPost?.(route, body)) return
      const account = staffRow(body.firstName, body.lastName, stub.rows.length + 100)
      stub.rows.push(account)
      return json(route, 201, {
        account,
        credentials: { username: account.username, email: account.email, password: 'Tmp#Pass-2026x', mustChangePassword: true },
      })
    },
  )
  return stub
}
