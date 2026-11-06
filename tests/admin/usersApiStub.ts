import type { Page, Route } from '@playwright/test'

// A fake backend for the browser tests, covering only the routes the User Management tabs use: GET /users, POST /users/staff/invite,
// POST /users/:id/deactivate and /activate, plus Supabase's POST /auth/v1/recover (the password reset email). There are no real Supabase
// credentials, so everything is answered here and nothing leaves the machine. The simulated dev sign-in is enough: requests are stubbed before the network.

export type UserRole = 'customer' | 'staff' | 'admin' | 'superadmin'

/** A UserResponseDto as the backend sends it. */
export interface UserRow {
  id: string
  firstName: string
  lastName: string
  middleName?: string | null
  suffix?: string | null
  fullName: string
  email: string
  role: UserRole
  isActive: boolean
  createdAt: string
}

export const userRow = (role: UserRole, firstName: string, lastName: string, n = 0): UserRow => ({
  id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
  firstName,
  lastName,
  fullName: `${firstName} ${lastName}`,
  email: `${firstName}.${lastName}@silhoufit.dev`.toLowerCase(),
  role,
  isActive: true,
  createdAt: `2026-01-${String((n % 27) + 1).padStart(2, '0')}T08:00:00.000Z`,
})

/** `count` people of one role named "Staffaa Personaa", "Staffab Personab" ... (letters, so the name order is the number order). */
export const manyUsers = (role: UserRole, count: number): UserRow[] =>
  Array.from({ length: count }, (_, i) => {
    const tag = String(i + 1).padStart(2, '0').replace(/\d/g, (d) => 'abcdefghij'[Number(d)])
    return userRow(role, `${role[0].toUpperCase()}${role.slice(1)}${tag}`, `Person${tag}`, i + 1)
  })

export const inactive = (row: UserRow): UserRow => ({ ...row, isActive: false })

export const SAMPLE_USERS: UserRow[] = [
  userRow('customer', 'Kim', 'Tan', 31),
  userRow('customer', 'Leo', 'Uy', 32),
  userRow('customer', 'Mia', 'Vega', 33),
  userRow('staff', 'Lara', 'Santos', 1),
  userRow('staff', 'Miguel', 'Cruz', 2),
  userRow('staff', 'Nina', 'Reyes', 3),
  userRow('admin', 'Brian', 'Dijamco', 11),
  userRow('admin', 'Alyssa', 'Ferrer', 12),
  userRow('admin', 'Carlo', 'Mendoza', 13),
  userRow('superadmin', 'Brian', 'Dijamco', 21),
  userRow('superadmin', 'Alyssa', 'Ferrer', 22),
  userRow('superadmin', 'Carlo', 'Mendoza', 23),
]

export interface InviteBody {
  email: string
  firstName: string
  middleName?: string
  lastName: string
  suffix?: string
  birthday?: string
  gender?: 'male' | 'female' | 'other' | 'unisex'
  role: UserRole
  redirectTo?: string
  password?: string
}

const DECLARED = ['email', 'firstName', 'middleName', 'lastName', 'suffix', 'birthday', 'gender', 'role', 'redirectTo', 'password']
const isText = (v: unknown): v is string => typeof v === 'string'

/** What the backend's ValidationPipe ({ whitelist, forbidNonWhitelisted }) and InviteStaffDto would say about a body: one message per problem, none when it is fine. */
export function inviteProblems(body: Record<string, unknown>): string[] {
  const problems = Object.keys(body).filter((key) => !DECLARED.includes(key)).map((key) => `property ${key} should not exist`)
  const { email, firstName, middleName, lastName, suffix, birthday, gender, role, password, redirectTo } = body
  if (!isText(email) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) problems.push('email must be an email')
  for (const [key, value] of [['firstName', firstName], ['lastName', lastName]] as const) {
    if (!isText(value) || !value) problems.push(`${key} should not be empty`)
    else if (value.length > 100) problems.push(`${key} must be shorter than or equal to 100 characters`)
  }
  if (middleName !== undefined && (!isText(middleName) || middleName.length > 100)) problems.push('middleName must be a string of at most 100 characters')
  if (suffix !== undefined && (!isText(suffix) || suffix.length > 20)) problems.push('suffix must be a string of at most 20 characters')
  if (birthday !== undefined && (!isText(birthday) || !/^\d{4}-\d{2}-\d{2}(T[\d:.]+(Z|[+-]\d{2}:?\d{2})?)?$/.test(birthday) || Number.isNaN(Date.parse(birthday)))) problems.push('birthday must be a valid ISO 8601 date string')
  if (gender !== undefined && !['male', 'female', 'other', 'unisex'].includes(gender as string)) problems.push('gender must be one of the following values: male, female, other, unisex')
  if (role !== undefined && !['customer', 'staff', 'admin', 'superadmin'].includes(role as string)) problems.push('role must be one of the following values: customer, staff, admin, superadmin')
  if (password !== undefined && (!isText(password) || password.length < 8)) problems.push('password must be longer than or equal to 8 characters')
  if (redirectTo !== undefined && (!isText(redirectTo) || !/^https?:\/\/\S+$/.test(redirectTo))) problems.push('redirectTo must be a URL address')
  return problems
}

type Hook<T extends unknown[]> = (route: Route, ...args: T) => Promise<boolean | void> | boolean | void

export interface UsersStub {
  rows: UserRow[]
  /** Every list GET /users the page made (limit 10, 25 or 50). */
  gets: URL[]
  /** Every GET /users?limit=1 the summary cards made to count a role; the answer is meta.total. */
  counts: URL[]
  /** Every invite body the page sent. */
  invites: InviteBody[]
  /** Every id the page asked to deactivate / activate. */
  deactivations: string[]
  activations: string[]
  /** Every body sent to Supabase's /auth/v1/recover, and the redirect_to it carried. */
  recoveries: { email: string; redirectTo: string | null }[]
  /** Answer a request yourself; return true when you did, or nothing to fall through to the default. */
  onGet?: Hook<[URL]>
  /** Same, for the cards' count requests. */
  onCount?: Hook<[URL]>
  onInvite?: Hook<[InviteBody]>
  onDeactivate?: Hook<[string]>
  onActivate?: Hook<[string]>
  onRecover?: Hook<[string]>
}

export const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization,content-type,apikey,x-client-info',
  'access-control-allow-methods': 'GET,POST,OPTIONS',
}

export const json = (route: Route, status: number, body: unknown) => route.fulfill({ status, headers: CORS, contentType: 'application/json', body: JSON.stringify(body) })

const offApp = (url: URL) => url.port !== '5173'

export async function stubUsersApi(page: Page, rows: UserRow[] = SAMPLE_USERS): Promise<UsersStub> {
  const stub: UsersStub = { rows: rows.map((r) => ({ ...r })), gets: [], counts: [], invites: [], deactivations: [], activations: [], recoveries: [] }

  await page.route(
    (url) => offApp(url) && (url.pathname === '/users' || url.pathname === '/users/staff/invite'),
    async (route) => {
      const request = route.request()
      const url = new URL(request.url())
      if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })

      if (request.method() === 'GET') {
        const counting = url.searchParams.get('limit') === '1'
        ;(counting ? stub.counts : stub.gets).push(url)
        if (await (counting ? stub.onCount : stub.onGet)?.(route, url)) return
        const q = url.searchParams
        const search = (q.get('search') ?? '').toLowerCase()
        const limit = Number(q.get('limit') ?? 20)
        const pageNo = Number(q.get('page') ?? 1)
        const dir = q.get('sortOrder') === 'asc' ? 1 : -1
        const matched = stub.rows
          .filter((r) => !q.get('role') || r.role === q.get('role'))
          .filter((r) => q.get('isActive') === null || String(r.isActive) === q.get('isActive'))
          .filter((r) => !search || [r.fullName, r.email].some((v) => v.toLowerCase().includes(search)))
        matched.sort((a, b) => dir * (q.get('sortBy') === 'createdAt' ? a.createdAt.localeCompare(b.createdAt) : a.fullName.localeCompare(b.fullName)))
        const totalPages = Math.ceil(matched.length / limit) || 1
        return json(route, 200, {
          data: matched.slice((pageNo - 1) * limit, pageNo * limit),
          meta: { total: matched.length, page: pageNo, limit, totalPages, hasNextPage: pageNo < totalPages, hasPreviousPage: pageNo > 1 },
        })
      }

      const body = request.postDataJSON() as InviteBody
      stub.invites.push(body)
      if (await stub.onInvite?.(route, body)) return
      const problems = inviteProblems(body as unknown as Record<string, unknown>)
      if (problems.length) return json(route, 400, { statusCode: 400, message: problems, error: 'Bad Request' })
      const names = [body.firstName, body.middleName, body.lastName, body.suffix].filter(Boolean).join(' ')
      const user = { ...userRow(body.role, body.firstName, body.lastName, stub.rows.length + 100), middleName: body.middleName ?? null, suffix: body.suffix ?? null, fullName: names, email: body.email, birthday: body.birthday ?? null, gender: body.gender ?? null }
      stub.rows.push(user)
      return json(route, 201, { user, invited: true, message: `${body.role} invitation sent to ${body.email}` })
    },
  )

  for (const action of ['deactivate', 'activate'] as const) {
    await page.route(
      (url) => offApp(url) && new RegExp(`^/users/[^/]+/${action}$`).test(url.pathname),
      async (route) => {
        const request = route.request()
        if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
        const id = new URL(request.url()).pathname.split('/')[2]
        const deactivating = action === 'deactivate'
        ;(deactivating ? stub.deactivations : stub.activations).push(id)
        if (await (deactivating ? stub.onDeactivate : stub.onActivate)?.(route, id)) return
        const row = stub.rows.find((r) => r.id === id)
        if (row) row.isActive = !deactivating
        return json(route, 200, row ?? { id })
      },
    )
  }

  await page.route(
    (url) => url.pathname === '/auth/v1/recover',
    async (route) => {
      const request = route.request()
      if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
      const { email } = request.postDataJSON() as { email: string }
      stub.recoveries.push({ email, redirectTo: new URL(request.url()).searchParams.get('redirect_to') })
      if (await stub.onRecover?.(route, email)) return
      return json(route, 200, {})
    },
  )
  return stub
}
