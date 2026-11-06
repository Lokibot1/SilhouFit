import type { AdminAccount, CustomerAccount, StaffAccount, SuperadminAccount } from '../types/accounts'
import type { AccountPage, AccountQuery } from '../utils/accountQuery'
import { ProductListError, request, type ProductListErrorKind } from './fetchProductList'
import type { RequestOptions } from './simulateRequest'

/** A failed accounts request. `kind` suits errorKind()/SectionError; `status` tells a 401 from a 403; `detail` is the server's own message (a 400, 403 or 409). */
export class StaffApiError extends Error {
  kind: ProductListErrorKind
  detail?: string
  status?: number
  code?: string

  constructor(kind: ProductListErrorKind, detail?: string, status?: number, code?: string) {
    super(`Accounts request failed (${kind}).`)
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

// The API sends no username, phone or sign-in time; the shared account shape gets neutral values, and `username` is the email's local part.
const localPart = (email: string) => email.split('@')[0]

/** A UserResponseDto as the shared account row: `isActive` becomes the Active / Inactive status. */
function toAccount(value: unknown): Omit<StaffAccount, 'role'> {
  if (!isRecord(value)) throw new StaffApiError('server')
  const { id, firstName, middleName, lastName, suffix, email, createdAt, isActive } = value
  if (!isText(id) || !isText(firstName) || !isText(lastName) || !isText(email)) throw new StaffApiError('server')
  return {
    id,
    firstName,
    ...(isText(middleName) && middleName && { middleName }),
    lastName,
    ...(isText(suffix) && suffix && { suffix }),
    username: localPart(email),
    email,
    phone: '',
    status: isActive === false ? 'inactive' : 'active',
    createdAt: isText(createdAt) ? createdAt : '',
    lastSignInAt: null,
  }
}

const toCustomerAccount = (value: unknown): CustomerAccount => ({ ...toAccount(value), role: 'customer' })
const toStaffAccount = (value: unknown): StaffAccount => ({ ...toAccount(value), role: 'staff' })
const toAdminAccount = (value: unknown): AdminAccount => ({ ...toAccount(value), role: 'admin' })
const toSuperadminAccount = (value: unknown): SuperadminAccount => {
  const account = toAccount(value)
  return { ...account, status: account.status === 'inactive' ? 'inactive' : 'active', role: 'superadmin' }
}

export type ManagedRole = 'customer' | 'staff' | 'admin' | 'superadmin'

async function list<T>(role: ManagedRole, map: (value: unknown) => T, { search, status, sort, dir = 'asc', page = 1, limit = 10 }: AccountQuery, signal?: AbortSignal): Promise<AccountPage<T>> {
  const query = new URLSearchParams({ role, page: String(page), limit: String(limit), sortBy: sort === 'createdAt' ? 'createdAt' : 'fullName', sortOrder: dir })
  if (status) query.set('isActive', String(status === 'active'))
  if (search?.trim()) query.set('search', search.trim())
  const body = await call('GET', `/users?${query}`, undefined, signal)
  const meta = isRecord(body) ? body.meta : null
  if (!isRecord(body) || !Array.isArray(body.data) || !isRecord(meta) || typeof meta.total !== 'number' || !Number.isFinite(meta.total)) throw new StaffApiError('server')
  return {
    data: body.data.map(map),
    meta: { total: meta.total, page: count(meta.page, page), limit: count(meta.limit, limit), totalPages: count(meta.totalPages, Math.ceil(meta.total / limit)) },
  }
}

/** GET /users?role=customer. Same as staff; a customer has no username. */
export const listCustomerAccounts = (query: AccountQuery, { signal }: RequestOptions = {}) => list('customer', toCustomerAccount, query, signal)

/** GET /users?role=staff. Search, isActive (from the Active / Inactive filter; none is all), sort (fullName or createdAt), direction and page are the server's. */
export const listStaffAccounts = (query: AccountQuery, { signal }: RequestOptions = {}) => list('staff', toStaffAccount, query, signal)

/** GET /users?role=admin. Same as staff. */
export const listAdminAccounts = (query: AccountQuery, { signal }: RequestOptions = {}) => list('admin', toAdminAccount, query, signal)

/** GET /users?role=superadmin. Same as staff. */
export const listSuperadminAccounts = (query: AccountQuery, { signal }: RequestOptions = {}) => list('superadmin', toSuperadminAccount, query, signal)

const changeListeners = new Set<() => void>()
const counting = new Map<string, Promise<number>>()

/** Calls `listener` after an invite, deactivate or activate succeeds, so the counts can load again. Returns the way to stop. */
export const subscribeAccountChanges = (listener: () => void) => {
  changeListeners.add(listener)
  return () => void changeListeners.delete(listener)
}

function accountsChanged() {
  counting.clear()
  changeListeners.forEach((listener) => listener())
}

/** GET /users?role&isActive&limit=1, reading meta.total: how many accounts of a role are active (or inactive). Identical requests in flight share one call. */
export function countAccounts(role: ManagedRole, active: boolean): Promise<number> {
  const key = `${role}:${active}`
  let pending = counting.get(key)
  if (!pending) {
    const request: Promise<number> = list(role, () => null, { status: active ? 'active' : 'inactive', limit: 1 }).then(({ meta }) => meta.total)
    pending = request
    counting.set(key, request)
    // A change clears the map while a request is still out; only forget this request, not its replacement.
    const done = () => counting.get(key) === request && counting.delete(key)
    request.then(done, done)
  }
  return pending
}

/** Every value the backend's Gender enum accepts. */
export type InviteGender = 'male' | 'female' | 'other' | 'unisex'

/** The fields of the backend's InviteStaffDto the form fills in. Empty optional ones are left out of the request. */
export interface InviteInput {
  email: string
  firstName: string
  middleName?: string
  lastName: string
  suffix?: string
  /** YYYY-MM-DD. */
  birthday?: string
  gender?: InviteGender
}

/** The account the server made and its own confirmation line. */
export interface Invited<T> {
  account: T
  message: string
}

const trimmed = (value?: string) => value?.trim() || undefined

async function invite<T>(role: ManagedRole, map: (value: unknown) => T, input: InviteInput): Promise<Invited<T>> {
  // The server refuses any field its InviteStaffDto does not declare (forbidNonWhitelisted), so the body is built key by key, never spread from the input.
  // An empty optional field is left out (JSON drops undefined). The invitee sets their own password from the emailed link, which lands on /auth/callback; none is ever sent or returned.
  const body = await call('POST', '/users/staff/invite', {
    email: input.email.trim().toLowerCase(),
    firstName: input.firstName.trim(),
    middleName: trimmed(input.middleName),
    lastName: input.lastName.trim(),
    suffix: trimmed(input.suffix),
    birthday: trimmed(input.birthday),
    gender: input.gender || undefined,
    role,
    redirectTo: `${window.location.origin}/auth/callback`,
  })
  if (!isRecord(body) || !isText(body.message)) throw new StaffApiError('server')
  accountsChanged()
  return { account: map(body.user), message: body.message }
}

/** POST /users/staff/invite with role staff. Supabase emails the invitation; the server makes no password. */
export const inviteStaffAccountApi = (input: InviteInput) => invite('staff', toStaffAccount, input)

/** POST /users/staff/invite with role admin (an admin or a superadmin may). */
export const inviteAdminAccountApi = (input: InviteInput) => invite('admin', toAdminAccount, input)

/** POST /users/staff/invite with role superadmin (a superadmin only; anyone else gets 403). */
export const inviteSuperadminAccountApi = (input: InviteInput) => invite('superadmin', toSuperadminAccount, input)

async function setActive(action: 'deactivate' | 'activate', id: string): Promise<{ id: string }> {
  const body = await call('POST', `/users/${encodeURIComponent(id)}/${action}`, undefined)
  if (!isRecord(body) || !isText(body.id)) throw new StaffApiError('server')
  accountsChanged()
  return { id: body.id }
}

/** POST /users/:id/deactivate (no body). The server bans the account in Supabase Auth, so it cannot sign in or refresh, and keeps it. An admin may deactivate staff and customers; a superadmin anyone; nobody their own. */
export const deactivateAccountApi = (id: string) => setActive('deactivate', id)

/** POST /users/:id/activate (no body). The person can sign in again with their current password. */
export const activateAccountApi = (id: string) => setActive('activate', id)
