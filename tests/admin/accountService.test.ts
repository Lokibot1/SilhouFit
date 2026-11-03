import { beforeEach, describe, expect, it } from 'vitest'
import { DEV_ADMIN } from '../../src/data/mockAccounts'
import * as service from '../../src/service/accountService'
import {
  archiveStaffAccount,
  changePassword,
  createAdminAccount,
  createStaffAccount,
  DuplicateUsernameError,
  getCustomer,
  getCustomerTransactions,
  listAdmins,
  listCustomerOrders,
  listCustomers,
  listStaff,
  resetStaffPassword,
  restoreStaffAccount,
} from '../../src/service/accountService'
import { getActivityLogs } from '../../src/service/activityLogs'
import { ACCOUNTS_KEY, getAccounts, reloadAccounts, resetAccounts } from '../../src/service/accountStore'
import { validatePassword } from '../../src/utils/signUpValidation'

const fast = { delayMs: 0 }
const person = { firstName: 'Maria', lastName: 'Santos', phone: '' }

beforeEach(() => {
  localStorage.clear()
  resetAccounts()
})

describe('creating accounts', () => {
  it('makes a staff account with a generated username, sign-in email and a password that must be changed', async () => {
    const { account, credentials } = await createStaffAccount(person, fast)
    expect(account).toMatchObject({ role: 'staff', username: 'maria.santos', email: 'maria.santos@silhoufit.dev', status: 'active', mustChangePassword: true })
    expect(credentials).toMatchObject({ username: 'maria.santos', email: account.email, mustChangePassword: true })
    expect(validatePassword(credentials.password)).toBeNull()
    expect((await listStaff({ search: 'maria.santos' }, fast)).data).toHaveLength(1)
  })

  it('adds a number to a username that is taken, across staff and admins', async () => {
    await createStaffAccount(person, fast)
    expect((await createAdminAccount(person, fast)).account.username).toBe('maria.santos2')
  })

  it('throws DuplicateUsernameError, and saves nothing, when the shown username was taken meanwhile', async () => {
    await createStaffAccount(person, fast)
    const before = getAccounts().staff.length
    await expect(createStaffAccount({ ...person, username: 'maria.santos' }, fast)).rejects.toBeInstanceOf(DuplicateUsernameError)
    expect(getAccounts().staff).toHaveLength(before)
  })

  it('never lists the password', async () => {
    const { credentials } = await createAdminAccount(person, fast)
    expect(JSON.stringify(await listAdmins({}, fast))).not.toContain(credentials.password)
  })

  it('logs the creation in the activity log, with the actor and the target', async () => {
    await createStaffAccount(person, fast)
    expect((await getActivityLogs(fast))[0]).toMatchObject({ category: 'account', action: 'staff-created', actor: 'An admin', target: 'Maria Santos' })
  })
})

describe('the activity logs', () => {
  it('lists sample entries of every other category, newest first, with the live account changes on top', async () => {
    const before = await getActivityLogs(fast)
    expect(new Set(before.map((log) => log.category))).toEqual(new Set(['order', 'transaction', 'product']))
    expect(before.length).toBeGreaterThanOrEqual(40)
    const times = before.map((log) => log.createdAt)
    expect(times).toEqual([...times].sort().reverse())
    await createStaffAccount(person, fast)
    const after = await getActivityLogs(fast)
    expect(after).toHaveLength(before.length + 1)
    expect(after[0]).toMatchObject({ category: 'account', target: 'Maria Santos' })
  })
})

describe('resetting passwords', () => {
  it('issues new credentials and flags the account again', async () => {
    const staff = getAccounts().staff.find((a) => a.status === 'active' && !a.mustChangePassword)!
    const { credentials } = await resetStaffPassword(staff.id, fast)
    expect(credentials.username).toBe(staff.username)
    expect(getAccounts().passwords[staff.id]).toBe(credentials.password)
    expect(getAccounts().staff.find((a) => a.id === staff.id)!.mustChangePassword).toBe(true)
  })

  it('cannot reset an admin: the call is refused and nothing changes', async () => {
    const before = structuredClone(getAccounts())
    for (const admin of before.admins) {
      await expect(resetStaffPassword(admin.id, fast)).rejects.toMatchObject({ kind: 'forbidden' })
    }
    expect(getAccounts()).toEqual(before)
  })

  it('leaves resetting an admin to superadmins: an admin is refused', async () => {
    await expect(service.resetAdminPassword(getAccounts().admins[0].id, fast)).rejects.toMatchObject({ kind: 'forbidden' })
  })

  it('refuses an archived account', async () => {
    const archived = getAccounts().staff.find((a) => a.status === 'archived')!
    await expect(resetStaffPassword(archived.id, fast)).rejects.toMatchObject({ kind: 'forbidden' })
  })
})

describe('archiving', () => {
  it('archives and restores staff', async () => {
    const staff = getAccounts().staff.find((a) => a.status === 'active')!
    const archived = await archiveStaffAccount(staff.id, fast)
    expect(archived.status).toBe('archived')
    expect(archived.archivedAt).toBeTruthy()
    const restored = await restoreStaffAccount(staff.id, fast)
    expect(restored.status).toBe('active')
    expect(restored.archivedAt).toBeUndefined()
  })

  it('cannot archive an admin: the call is refused and the admin is unchanged', async () => {
    const admin = getAccounts().admins[0]
    await expect(archiveStaffAccount(admin.id, fast)).rejects.toMatchObject({ kind: 'forbidden' })
    expect(getAccounts().admins[0]).toEqual(admin)
  })

  it('leaves archiving an admin to superadmins: an admin is refused, and no admin starts archived', async () => {
    await expect(service.archiveAdminAccount(getAccounts().admins[0].id, fast)).rejects.toMatchObject({ kind: 'forbidden' })
    expect(getAccounts().admins.some((a) => a.status === 'archived' || 'archivedAt' in a)).toBe(false)
  })

  it('filters archived staff', async () => {
    const { data } = await listStaff({ status: 'archived' }, fast)
    expect(data.length).toBeGreaterThan(0)
    expect(data.every((a) => a.status === 'archived')).toBe(true)
  })
})

describe('changing the password', () => {
  it('clears the flag and stores the new password', async () => {
    const pending = getAccounts().staff.find((a) => a.mustChangePassword)!
    await changePassword(pending.id, 'Fresh#Pass1', fast)
    expect(getAccounts().staff.find((a) => a.id === pending.id)!.mustChangePassword).toBe(false)
    expect(getAccounts().passwords[pending.id]).toBe('Fresh#Pass1')
  })

  it('rejects a weak password and keeps the flag', async () => {
    const pending = getAccounts().staff.find((a) => a.mustChangePassword)!
    await expect(changePassword(pending.id, 'weak', fast)).rejects.toMatchObject({ kind: 'validation' })
    expect(getAccounts().staff.find((a) => a.id === pending.id)!.mustChangePassword).toBe(true)
  })
})

describe('customers', () => {
  it('lists customers with order counts and spend taken from their orders', async () => {
    const page = await listCustomers({ limit: 25 }, fast)
    expect(page.meta.total).toBe(25)
    const withOrders = page.data.filter((c) => c.orderCount > 0)
    expect(withOrders.length).toBeGreaterThan(0)
    const first = withOrders[0]
    const orders = await listCustomerOrders(first.id, fast)
    expect(orders).toHaveLength(first.orderCount)
    expect(orders.reduce((sum, o) => sum + o.total, 0)).toBeCloseTo(first.lifetimeSpend, 2)
    expect((await getCustomer(first.id, fast)).orderCount).toBe(first.orderCount)
    const payments = await getCustomerTransactions(first.id, fast)
    expect(payments.map((p) => p.orderNo)).toEqual(orders.map((o) => o.orderNo))
  })

  it('searches by name and paginates with a total', async () => {
    expect((await listCustomers({ search: 'dela cruz' }, fast)).data.every((c) => c.lastName === 'Dela Cruz')).toBe(true)
    const page = await listCustomers({ page: 2, limit: 10 }, fast)
    expect(page.data).toHaveLength(10)
    expect(page.meta).toMatchObject({ total: 25, totalPages: 3, page: 2 })
  })
})

describe('persistence', () => {
  it('survives a reload of the store', async () => {
    await createStaffAccount(person, fast)
    reloadAccounts()
    expect(getAccounts().staff.some((a) => a.username === 'maria.santos')).toBe(true)
  })

  it('starts again from the sample accounts when storage is corrupted', () => {
    localStorage.setItem(ACCOUNTS_KEY, '{not json')
    reloadAccounts()
    expect(getAccounts().admins[0].email).toBe(DEV_ADMIN.email)
    localStorage.setItem(ACCOUNTS_KEY, JSON.stringify({ customers: 'nope' }))
    reloadAccounts()
    expect(getAccounts().staff.length).toBeGreaterThan(0)
  })
})
