import type { Credentials, StaffAccount } from '../types/accounts'
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

// The API sends no username, phone, status or sign-in time for staff; the shared account shape gets neutral values, and `username` is the email's local part.
const localPart = (email: string) => email.split('@')[0]

function toStaffAccount(value: unknown): StaffAccount {
  if (!isRecord(value)) throw new StaffApiError('server')
  const { id, firstName, lastName, email, createdAt } = value
  if (!isText(id) || !isText(firstName) || !isText(lastName) || !isText(email)) throw new StaffApiError('server')
  return {
    id,
    firstName,
    lastName,
    username: localPart(email),
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
  credentials: Credentials
}

/** POST /users/staff. The server makes the email and temporary password. */
export async function createStaffAccountApi(input: { firstName: string; lastName: string }): Promise<CreatedStaff> {
  const body = await call('POST', '/users/staff', { firstName: input.firstName, lastName: input.lastName })
  const credentials = isRecord(body) ? body.credentials : null
  if (!isRecord(body) || !isRecord(credentials) || !isText(credentials.email) || !isText(credentials.password)) throw new StaffApiError('server')
  return {
    account: toStaffAccount(body.account),
    credentials: { username: localPart(credentials.email), email: credentials.email, password: credentials.password, mustChangePassword: true },
  }
}

/** POST /users/staff/:id/reset-password (no body). The server sets the default password, signs the person out everywhere and makes them choose a new one; it never sends a password back. */
export async function resetStaffPasswordApi(id: string): Promise<{ id: string }> {
  const body = await call('POST', `/users/staff/${encodeURIComponent(id)}/reset-password`, undefined)
  if (!isRecord(body) || !isText(body.id)) throw new StaffApiError('server')
  return { id: body.id }
}
