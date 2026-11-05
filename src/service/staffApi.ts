import type { AdminAccount, Credentials, StaffAccount } from '../types/accounts'
import type { AccountPage, AccountQuery } from '../utils/accountQuery'
import { ProductListError, request, type ProductListErrorKind } from './fetchProductList'
import type { RequestOptions } from './simulateRequest'

/** A failed staff request. `kind` suits errorKind()/SectionError; `status` tells a 401 from a 403; `detail` is the server's own message (a 400 or 409). */
export class StaffApiError extends Error {
  kind: ProductListErrorKind
  detail?: string
  status?: number
  /** The server's `code` (`staff_not_found`, `not_a_staff_account`, `weak_password`), when it sent one. */
  code?: string

  constructor(kind: ProductListErrorKind, detail?: string, status?: number, code?: string) {
    super(`Staff request failed (${kind}).`)
    this.kind = kind
    this.detail = detail
    this.status = status
    this.code = code
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null
const isText = (value: unknown): value is string => typeof value === 'string'
const count = (value: unknown, fallback: number) => (typeof value === 'number' && Number.isFinite(value) ? value : fallback)

async function call(method: 'GET' | 'POST', path: string, body: unknown, signal?: AbortSignal): Promise<unknown> {
  try {
    return await request(method, path, body, signal)
  } catch (failure) {
    if (failure instanceof ProductListError) throw new StaffApiError(failure.kind, failure.detail, failure.status, failure.code)
    throw failure
  }
}

// The API sends no username, phone or sign-in time for staff or admins; the shared account shape gets neutral values, and `username` is the email's local part.
const localPart = (email: string) => email.split('@')[0]

function toAccount(value: unknown): Omit<StaffAccount, 'role'> {
  if (!isRecord(value)) throw new StaffApiError('server')
  const { id, firstName, lastName, email, createdAt, status, archivedAt } = value
  if (!isText(id) || !isText(firstName) || !isText(lastName) || !isText(email)) throw new StaffApiError('server')
  return {
    id,
    firstName,
    lastName,
    username: localPart(email),
    email,
    phone: '',
    status: status === 'archived' ? 'archived' : 'active',
    createdAt: isText(createdAt) ? createdAt : '',
    lastSignInAt: null,
    mustChangePassword: false,
    ...(isText(archivedAt) && { archivedAt }),
  }
}

const toStaffAccount = (value: unknown): StaffAccount => ({ ...toAccount(value), role: 'staff' })
const toAdminAccount = (value: unknown): AdminAccount => ({ ...toAccount(value), role: 'admin' })

async function list<T>(path: string, map: (value: unknown) => T, params: Record<string, string>, { search, sort, dir = 'asc', page = 1, limit = 10 }: AccountQuery, signal?: AbortSignal): Promise<AccountPage<T>> {
  const query = new URLSearchParams({ page: String(page), limit: String(limit), sort: sort === 'createdAt' ? 'createdAt' : 'name', dir, ...params })
  if (search?.trim()) query.set('search', search.trim())
  const body = await call('GET', `${path}?${query}`, undefined, signal)
  const meta = isRecord(body) ? body.meta : null
  if (!isRecord(body) || !Array.isArray(body.data) || !isRecord(meta) || typeof meta.total !== 'number' || !Number.isFinite(meta.total)) throw new StaffApiError('server')
  return {
    data: body.data.map(map),
    meta: { total: meta.total, page: count(meta.page, page), limit: count(meta.limit, limit), totalPages: count(meta.totalPages, Math.ceil(meta.total / limit)) },
  }
}

/** GET /users/staff. Search, status, sort (name or createdAt), direction and page are the server's; any other sort falls back to name, and no status is "all". */
export const listStaffAccounts = (query: AccountQuery, { signal }: RequestOptions = {}) => list('/users/staff', toStaffAccount, { status: query.status ?? 'all' }, query, signal)

/** GET /users/admins. Same as staff but without a status: the server lists every admin. */
export const listAdminAccounts = (query: AccountQuery, { signal }: RequestOptions = {}) => list('/users/admins', toAdminAccount, {}, query, signal)

/** What the server made for a new staff account. Shown once; the password is never listed again. */
export interface CreatedStaff {
  account: StaffAccount
  credentials: Credentials
}

/** What the server made for a new admin account. Shown once; the password is never listed again. */
export interface CreatedAdmin {
  account: AdminAccount
  credentials: Credentials
}

async function create<T>(path: string, map: (value: unknown) => T, input: { firstName: string; lastName: string }): Promise<{ account: T; credentials: Credentials }> {
  const body = await call('POST', path, { firstName: input.firstName, lastName: input.lastName })
  const credentials = isRecord(body) ? body.credentials : null
  if (!isRecord(body) || !isRecord(credentials) || !isText(credentials.email) || !isText(credentials.password)) throw new StaffApiError('server')
  return {
    account: map(body.account),
    credentials: { username: localPart(credentials.email), email: credentials.email, password: credentials.password, mustChangePassword: true },
  }
}

/** POST /users/staff. The server makes the email and temporary password. */
export const createStaffAccountApi = (input: { firstName: string; lastName: string }): Promise<CreatedStaff> => create('/users/staff', toStaffAccount, input)

/** POST /users/admins. The server makes the email and temporary password. */
export const createAdminAccountApi = (input: { firstName: string; lastName: string }): Promise<CreatedAdmin> => create('/users/admins', toAdminAccount, input)

/** POST /users/staff/:id/reset-password (no body). The server sets the default password, signs the person out everywhere and makes them choose a new one; it never sends a password back. */
export async function resetStaffPasswordApi(id: string): Promise<{ id: string }> {
  const body = await call('POST', `/users/staff/${encodeURIComponent(id)}/reset-password`, undefined)
  if (!isRecord(body) || !isText(body.id)) throw new StaffApiError('server')
  return { id: body.id }
}

/** POST /users/staff/:id/archive (no body). The server blocks sign-in and signs the person out everywhere; the account is kept. */
export async function archiveStaffAccountApi(id: string): Promise<{ id: string }> {
  const body = await call('POST', `/users/staff/${encodeURIComponent(id)}/archive`, undefined)
  if (!isRecord(body) || !isText(body.id)) throw new StaffApiError('server')
  return { id: body.id }
}

/** POST /users/staff/:id/restore (no body). The person can sign in again with their current password. */
export async function restoreStaffAccountApi(id: string): Promise<{ id: string }> {
  const body = await call('POST', `/users/staff/${encodeURIComponent(id)}/restore`, undefined)
  if (!isRecord(body) || !isText(body.id)) throw new StaffApiError('server')
  return { id: body.id }
}
