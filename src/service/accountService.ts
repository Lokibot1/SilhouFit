// The accounts API as the admin pages use it, answered from the saved accounts (accountStore). Each function names the endpoint that replaces it.
import { ALLOW_SKIP_PASSWORD_CHANGE } from '../config/accountPolicy'
import type { ActivityEntry, ActivityKind, AdminAccount, BaseAccount, Credentials, Customer, StaffAccount, SuperadminAccount } from '../types/accounts'
import { queryAccounts, type AccountPage, type AccountQuery } from '../utils/accountQuery'
import { validatePassword } from '../utils/signUpValidation'
import { getAccounts, MAX_ACTIVITY, updateAccounts, type AccountsState } from './accountStore'
import { emailFor, generatePassword, generateUsername } from './credentials'
import { buildOrderHistory, loadSampleProducts } from './fetchStaffAnalytics'
import { PAYMENT_METHODS, type PaymentMethod, type TransactionListItem } from './fetchTransactions'
import { sampleTransactionList } from './sampleTransactions'
import { getSession } from './session'
import { simulateRequest, type RequestOptions } from './simulateRequest'

/** `kind` lets a section pick accurate copy (see errorKind). */
class AccountError extends Error {
  kind: string

  constructor(kind: string, message: string) {
    super(message)
    this.kind = kind
  }
}
/** 409 from the API. */
export class DuplicateUsernameError extends AccountError {
  constructor() {
    super('conflict', 'That username is already taken.')
  }
}
/** 403 from the API. */
export class ForbiddenError extends AccountError {
  constructor(message = 'Your account is not allowed to do that.') {
    super('forbidden', message)
  }
}
export class NotFoundError extends AccountError {
  constructor(what = 'account') {
    super('not-found', `No ${what} matches that ID.`)
  }
}
/** 422 from the API. */
export class ValidationError extends AccountError {
  constructor(message: string) {
    super('validation', message)
  }
}

const wait = (delayMs: number, signal?: AbortSignal) => simulateRequest(delayMs, signal, () => false)

export interface NewAccountInput {
  firstName: string
  lastName: string
  phone: string
  /** The username the form showed. If it was taken in the meantime this throws DuplicateUsernameError; left out, one is generated. */
  username?: string
}

/** Every sign-in username, staff and admin together: they share one login. */
export const takenUsernames = (accounts: Pick<AccountsState, 'staff' | 'admins' | 'superadmins'>) => [...accounts.staff, ...accounts.admins, ...accounts.superadmins].map((account) => account.username)

/** 403 from the API: these actions belong to superadmins only. */
function requireSuperadmin() {
  if (getSession()?.role !== 'superadmin') throw new ForbiddenError('Only a superadmin can do that.')
}

function log(draft: AccountsState, kind: ActivityKind, account: Pick<BaseAccount, 'firstName' | 'lastName'>) {
  const entry: ActivityEntry = {
    id: `act-${crypto.randomUUID().slice(0, 8)}`,
    at: new Date().toISOString(),
    kind,
    actor: getSession()?.name ?? 'An admin',
    target: `${account.firstName} ${account.lastName}`,
  }
  draft.activity = [entry, ...draft.activity].slice(0, MAX_ACTIVITY)
}

// ---- Customers (read only) ----

type Stats = Map<string, { orderCount: number; lifetimeSpend: number }>
let customerStats: Promise<Stats> | undefined

/** Orders and spend per customer name, from the generated order history. Orders carry only a name, so the match is by name. */
function loadCustomerStats() {
  customerStats ??= loadSampleProducts().then(() => {
    const stats: Stats = new Map()
    for (const order of buildOrderHistory()) {
      const entry = stats.get(order.customerName) ?? { orderCount: 0, lifetimeSpend: 0 }
      entry.orderCount += 1
      entry.lifetimeSpend += order.total
      stats.set(order.customerName, entry)
    }
    return stats
  })
  return customerStats
}

const nameOf = (customer: Customer) => `${customer.firstName} ${customer.lastName}`
const withStats = (customer: Customer, stats: Stats): Customer => ({ ...customer, ...(stats.get(nameOf(customer)) ?? { orderCount: 0, lifetimeSpend: 0 }) })

/** REPLACE: GET /admin/customers?search&status&page&limit&sort&dir */
export async function listCustomers(query: AccountQuery, { signal, delayMs = 600 }: RequestOptions = {}): Promise<AccountPage<Customer>> {
  await wait(delayMs, signal)
  const stats = await loadCustomerStats()
  return queryAccounts(
    getAccounts().customers.map((customer) => withStats(customer, stats)),
    query,
  )
}

/** REPLACE: GET /admin/customers/:id */
export async function getCustomer(id: string, { signal, delayMs = 300 }: RequestOptions = {}): Promise<Customer> {
  await wait(delayMs, signal)
  const customer = getAccounts().customers.find((c) => c.id === id)
  if (!customer) throw new NotFoundError('customer')
  return withStats(customer, await loadCustomerStats())
}

/** REPLACE: GET /admin/customers/:id/orders (newest first) */
export async function listCustomerOrders(id: string, { signal, delayMs = 500 }: RequestOptions = {}): Promise<TransactionListItem[]> {
  await wait(delayMs, signal)
  const customer = getAccounts().customers.find((c) => c.id === id)
  if (!customer) throw new NotFoundError('customer')
  const { data } = await sampleTransactionList({ search: nameOf(customer), sortBy: 'placedAt', sortOrder: 'desc', limit: 1000 }, { signal, delayMs: 0 })
  return data.filter((order) => order.customerName === nameOf(customer))
}

export interface CustomerPayment {
  orderNo: string
  /** ISO time. */
  placedAt: string
  method: PaymentMethod
  amount: number
  /** Refunded in full when the order was returned. */
  refunded: boolean
}

/** REPLACE: GET /admin/customers/:id/transactions (one payment per order, newest first) */
export async function getCustomerTransactions(id: string, options: RequestOptions = {}): Promise<CustomerPayment[]> {
  const orders = await listCustomerOrders(id, options)
  const methods = new Map(buildOrderHistory().map((order) => [order.orderId, order.paymentMethod]))
  return orders.map((order) => ({
    orderNo: order.orderNo,
    placedAt: order.placedAt,
    method: methods.get(order.orderNo) ?? PAYMENT_METHODS[0],
    amount: order.total,
    refunded: Boolean(order.returnedAt),
  }))
}

// ---- Staff and admins ----

/** REPLACE: GET /admin/staff?search&status&page&limit&sort&dir */
export async function listStaff(query: AccountQuery, { signal, delayMs = 600 }: RequestOptions = {}): Promise<AccountPage<StaffAccount>> {
  await wait(delayMs, signal)
  return queryAccounts(getAccounts().staff, query)
}

/** REPLACE: GET /admin/admins?search&status&page&limit&sort&dir */
export async function listAdmins(query: AccountQuery, { signal, delayMs = 600 }: RequestOptions = {}): Promise<AccountPage<AdminAccount>> {
  await wait(delayMs, signal)
  return queryAccounts(getAccounts().admins, query)
}

/** REPLACE: GET /superadmin/superadmins?search&status&page&limit&sort&dir */
export async function listSuperadmins(query: AccountQuery, { signal, delayMs = 600 }: RequestOptions = {}): Promise<AccountPage<SuperadminAccount>> {
  await wait(delayMs, signal)
  requireSuperadmin()
  return queryAccounts(getAccounts().superadmins, query)
}

/** The fields a new staff, admin or superadmin account starts with, and its first credentials. */
function newAccount(draft: AccountsState, input: NewAccountInput, prefix: 'stf' | 'adm' | 'sup') {
  const taken = takenUsernames(draft)
  if (input.username && taken.some((name) => name.toLowerCase() === input.username!.toLowerCase())) throw new DuplicateUsernameError()
  const username = input.username ?? generateUsername(input.firstName, input.lastName, taken)
  const password = generatePassword()
  const base = {
    id: `${prefix}-${crypto.randomUUID().slice(0, 8)}`,
    firstName: input.firstName.trim(),
    lastName: input.lastName.trim(),
    username,
    email: emailFor(username),
    phone: input.phone,
    status: 'active' as const,
    createdAt: new Date().toISOString(),
    lastSignInAt: null,
    mustChangePassword: true,
  }
  draft.passwords[base.id] = password
  const credentials: Credentials = { username, email: base.email, password, mustChangePassword: true }
  return { base, credentials }
}

/** REPLACE: POST /admin/staff  { firstName, lastName, phone } -> 201 { account, credentials }; 409 when the username is taken */
export async function createStaffAccount(input: NewAccountInput, { signal, delayMs = 800 }: RequestOptions = {}) {
  await wait(delayMs, signal)
  let result!: { account: StaffAccount; credentials: Credentials }
  updateAccounts((draft) => {
    const { base, credentials } = newAccount(draft, input, 'stf')
    const account: StaffAccount = { ...base, role: 'staff' }
    draft.staff.unshift(account)
    log(draft, 'staff-created', account)
    result = { account, credentials }
  })
  return result
}

/** REPLACE: POST /admin/admins  { firstName, lastName, phone } -> 201 { account, credentials }; 409 when the username is taken */
export async function createAdminAccount(input: NewAccountInput, { signal, delayMs = 800 }: RequestOptions = {}) {
  await wait(delayMs, signal)
  let result!: { account: AdminAccount; credentials: Credentials }
  updateAccounts((draft) => {
    const { base, credentials } = newAccount(draft, input, 'adm')
    const account: AdminAccount = { ...base, role: 'admin' }
    draft.admins.unshift(account)
    log(draft, 'admin-created', account)
    result = { account, credentials }
  })
  return result
}

/** REPLACE: POST /superadmin/superadmins  { firstName, lastName, phone } -> 201 { account, credentials }; 409 when the username is taken; 403 unless the caller is a superadmin */
export async function createSuperadminAccount(input: NewAccountInput, { signal, delayMs = 800 }: RequestOptions = {}) {
  await wait(delayMs, signal)
  requireSuperadmin()
  let result!: { account: SuperadminAccount; credentials: Credentials }
  updateAccounts((draft) => {
    const { base, credentials } = newAccount(draft, input, 'sup')
    const account: SuperadminAccount = { ...base, role: 'superadmin' }
    draft.superadmins.unshift(account)
    log(draft, 'superadmin-created', account)
    result = { account, credentials }
  })
  return result
}

function reset(account: StaffAccount | AdminAccount | undefined, draft: AccountsState) {
  if (!account) throw new NotFoundError()
  if (account.status === 'archived') throw new ForbiddenError('Restore this account before resetting its password.')
  const password = generatePassword()
  draft.passwords[account.id] = password
  account.mustChangePassword = true
  log(draft, 'password-reset', account)
  return { credentials: { username: account.username, email: account.email, password, mustChangePassword: true } satisfies Credentials }
}

// An admin's password is reset only by a superadmin, via resetAdminPassword below; an admin ID is refused here.
/** REPLACE: POST /admin/staff/:id/reset-password -> { credentials }; the API answers 403 for an admin's ID */
export async function resetStaffPassword(id: string, { signal, delayMs = 700 }: RequestOptions = {}) {
  await wait(delayMs, signal)
  let result!: ReturnType<typeof reset>
  updateAccounts((draft) => {
    if (draft.admins.some((a) => a.id === id)) throw new ForbiddenError('Admin passwords cannot be reset by another admin.')
    result = reset(draft.staff.find((a) => a.id === id), draft)
  })
  return result
}

function setArchived(id: string, archived: boolean) {
  let result!: StaffAccount
  updateAccounts((draft) => {
    if (draft.admins.some((a) => a.id === id)) throw new ForbiddenError('Admin accounts cannot be archived.')
    const account = draft.staff.find((a) => a.id === id)
    if (!account) throw new NotFoundError()
    account.status = archived ? 'archived' : 'active'
    if (archived) account.archivedAt = new Date().toISOString()
    else delete account.archivedAt
    log(draft, archived ? 'archived' : 'restored', account)
    result = account
  })
  return result
}

// An admin is archived only by a superadmin, via archiveAdminAccount below; nobody can archive a superadmin.
/** REPLACE: POST /admin/staff/:id/archive; the API answers 403 for an admin's ID */
export async function archiveStaffAccount(id: string, { signal, delayMs = 600 }: RequestOptions = {}) {
  await wait(delayMs, signal)
  return setArchived(id, true)
}

/** REPLACE: POST /admin/staff/:id/restore */
export async function restoreStaffAccount(id: string, { signal, delayMs = 600 }: RequestOptions = {}) {
  await wait(delayMs, signal)
  return setArchived(id, false)
}

// ---- Admins, managed by superadmins ----

/** REPLACE: POST /superadmin/admins/:id/reset-password -> { credentials }; 403 for a superadmin's ID or a caller who is not a superadmin */
export async function resetAdminPassword(id: string, { signal, delayMs = 700 }: RequestOptions = {}) {
  await wait(delayMs, signal)
  requireSuperadmin()
  let result!: ReturnType<typeof reset>
  updateAccounts((draft) => {
    if (draft.superadmins.some((a) => a.id === id)) throw new ForbiddenError('Superadmin passwords cannot be reset.')
    result = reset(draft.admins.find((a) => a.id === id), draft)
  })
  return result
}

function setAdminArchived(id: string, archived: boolean) {
  requireSuperadmin()
  let result!: AdminAccount
  updateAccounts((draft) => {
    if (draft.superadmins.some((a) => a.id === id)) throw new ForbiddenError('Superadmin accounts cannot be archived.')
    const account = draft.admins.find((a) => a.id === id)
    if (!account) throw new NotFoundError()
    account.status = archived ? 'archived' : 'active'
    if (archived) account.archivedAt = new Date().toISOString()
    else delete account.archivedAt
    log(draft, archived ? 'archived' : 'restored', account)
    result = account
  })
  return result
}

/** REPLACE: POST /superadmin/admins/:id/archive; 403 for a superadmin's ID or a caller who is not a superadmin */
export async function archiveAdminAccount(id: string, { signal, delayMs = 600 }: RequestOptions = {}) {
  await wait(delayMs, signal)
  return setAdminArchived(id, true)
}

/** REPLACE: POST /superadmin/admins/:id/restore */
export async function restoreAdminAccount(id: string, { signal, delayMs = 600 }: RequestOptions = {}) {
  await wait(delayMs, signal)
  return setAdminArchived(id, false)
}

// ---- The signed-in person ----

/** REPLACE: POST /auth/change-password  { newPassword }. The first-login screen has just signed in with the temporary password, so no current password is asked. */
export async function changePassword(accountId: string, newPassword: string, { signal, delayMs = 700 }: RequestOptions = {}) {
  await wait(delayMs, signal)
  const problem = validatePassword(newPassword)
  if (problem) throw new ValidationError(problem)
  updateAccounts((draft) => {
    const account = [...draft.staff, ...draft.admins, ...draft.superadmins].find((a) => a.id === accountId)
    if (!account) throw new NotFoundError()
    draft.passwords[accountId] = newPassword
    account.mustChangePassword = false
  })
}

/** REPLACE: POST /auth/skip-password-change. Leaves the account flagged, so the screen returns on the next sign-in. */
export async function skipPasswordChange({ signal, delayMs = 200 }: RequestOptions = {}) {
  await wait(delayMs, signal)
  if (!ALLOW_SKIP_PASSWORD_CHANGE) throw new ForbiddenError('You need to change your password before you continue.')
}

export interface AccountSummary {
  customers: number
  staff: number
  admins: number
}

/** REPLACE: GET /admin/summary */
export async function getAccountSummary({ signal, delayMs = 700 }: RequestOptions = {}): Promise<AccountSummary> {
  await wait(delayMs, signal)
  const { customers, staff, admins } = getAccounts()
  return { customers: customers.length, staff: staff.length, admins: admins.length }
}
