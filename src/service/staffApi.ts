import type { StaffAccount } from '../types/accounts'
import type { AccountPage, AccountQuery } from '../utils/accountQuery'
import { ProductListError, request, type ProductListErrorKind } from './fetchProductList'
import type { RequestOptions } from './simulateRequest'

/** A failed staff request. `kind` suits errorKind()/SectionError; `status` tells a 401 from a 403; `detail` is the server's own message (a 400 or 409). */
export class StaffApiError extends Error {
  kind: ProductListErrorKind
  detail?: string
  status?: number

  constructor(kind: ProductListErrorKind, detail?: string, status?: number) {
    super(`Staff request failed (${kind}).`)
    this.kind = kind
    this.detail = detail
    this.status = status
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null
const isText = (value: unknown): value is string => typeof value === 'string'
const count = (value: unknown, fallback: number) => (typeof value === 'number' && Number.isFinite(value) ? value : fallback)

async function call(method: 'GET' | 'POST', path: string, body: unknown, signal?: AbortSignal): Promise<unknown> {
  try {
    return await request(method, path, body, signal)
  } catch (failure) {
    if (failure instanceof ProductListError) throw new StaffApiError(failure.kind, failure.detail, failure.status)
    throw failure
  }
}

// The API sends no phone, status or sign-in time for staff; the shared account shape gets neutral values.
function toStaffAccount(value: unknown): StaffAccount {
  if (!isRecord(value)) throw new StaffApiError('server')
  const { id, firstName, lastName, username, email, createdAt } = value
  if (!isText(id) || !isText(firstName) || !isText(lastName) || !isText(username) || !isText(email)) throw new StaffApiError('server')
  return {
    id,
    firstName,
    lastName,
    username,
    email,
    role: 'staff',
    phone: '',
    status: 'active',
    createdAt: isText(createdAt) ? createdAt : '',
    lastSignInAt: null,
    mustChangePassword: false,
  }
}

/** GET /users/staff. Search, sort (name or createdAt), direction and page are the server's; any other sort falls back to name. */
export async function listStaffAccounts(
  { search, sort, dir = 'asc', page = 1, limit = 10 }: AccountQuery,
  { signal }: RequestOptions = {},
): Promise<AccountPage<StaffAccount>> {
  const query = new URLSearchParams({ page: String(page), limit: String(limit), sort: sort === 'createdAt' ? 'createdAt' : 'name', dir })
  if (search?.trim()) query.set('search', search.trim())
  const body = await call('GET', `/users/staff?${query}`, undefined, signal)
  const meta = isRecord(body) ? body.meta : null
  if (!isRecord(body) || !Array.isArray(body.data) || !isRecord(meta) || typeof meta.total !== 'number' || !Number.isFinite(meta.total)) throw new StaffApiError('server')
  return {
    data: body.data.map(toStaffAccount),
    meta: { total: meta.total, page: count(meta.page, page), limit: count(meta.limit, limit), totalPages: count(meta.totalPages, Math.ceil(meta.total / limit)) },
  }
}

/** What the server made for a new staff account. Shown once; the password is never listed again. */
export interface CreatedStaff {
  account: StaffAccount
  credentials: { username: string; email: string; password: string; mustChangePassword: true }
}

/** POST /users/staff. The server makes the username, email and temporary password. */
export async function createStaffAccountApi(input: { firstName: string; lastName: string }): Promise<CreatedStaff> {
  const body = await call('POST', '/users/staff', { firstName: input.firstName, lastName: input.lastName })
  const credentials = isRecord(body) ? body.credentials : null
  if (!isRecord(body) || !isRecord(credentials) || !isText(credentials.username) || !isText(credentials.email) || !isText(credentials.password)) throw new StaffApiError('server')
  return {
    account: toStaffAccount(body.account),
    credentials: { username: credentials.username, email: credentials.email, password: credentials.password, mustChangePassword: true },
  }
}
