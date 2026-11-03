import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEV_SUPERADMIN } from '../../src/data/mockAccounts'
import { DEFAULT_PERMISSIONS, canView, pageKeyFor } from '../../src/config/pagePermissions'
import {
  archiveAdminAccount,
  archiveStaffAccount,
  createSuperadminAccount,
  ForbiddenError,
  listSuperadmins,
  resetAdminPassword,
  resetStaffPassword,
  restoreAdminAccount,
} from '../../src/service/accountService'
import { getAccounts, resetAccounts } from '../../src/service/accountStore'
import { getPermissions, PERMISSIONS_KEY, resetPermissions, setRolePermissions } from '../../src/service/permissionStore'
import { clearSession, setSession } from '../../src/service/session'

vi.mock('../../src/service/supabase', () => ({
  getSupabase: async () => ({ auth: { signInWithPassword: vi.fn(), signOut: vi.fn().mockResolvedValue({ error: null }) } }),
}))
const { submitSignIn } = await import('../../src/service/signIn')

const fast = { delayMs: 0 }
const person = { firstName: 'Maria', lastName: 'Santos', phone: '' }
const signInAs = (role: 'superadmin' | 'admin') => setSession({ name: 'Someone', email: 'x@silhoufit.dev', role })

beforeEach(() => {
  localStorage.clear()
  resetAccounts()
  resetPermissions()
})
afterEach(() => clearSession())

describe('the superadmin account', () => {
  it('signs in with the saved credentials and lands on /superadmin', async () => {
    const result = await submitSignIn(DEV_SUPERADMIN)
    expect(result).toMatchObject({ ok: true, user: { role: 'superadmin', simulated: true, email: DEV_SUPERADMIN.email } })
  })

  it('rejects a wrong password', async () => {
    expect(await submitSignIn({ ...DEV_SUPERADMIN, password: 'Wrong@12345' })).toMatchObject({ ok: false, reason: 'invalid' })
  })
})

describe('managing admins', () => {
  const admin = () => getAccounts().admins[1]

  it('lets a superadmin reset an admin password', async () => {
    signInAs('superadmin')
    const { credentials } = await resetAdminPassword(admin().id, fast)
    expect(credentials).toMatchObject({ username: admin().username, mustChangePassword: true })
    expect(getAccounts().passwords[admin().id]).toBe(credentials.password)
  })

  it('lets a superadmin archive and restore an admin, who then cannot sign in', async () => {
    signInAs('superadmin')
    await archiveAdminAccount(admin().id, fast)
    expect(admin()).toMatchObject({ status: 'archived' })
    expect(await submitSignIn({ email: admin().email, password: 'Admin@12345' })).toMatchObject({ ok: false, reason: 'archived' })
    await restoreAdminAccount(admin().id, fast)
    expect(admin().status).toBe('active')
  })

  it('refuses an admin who tries to reset or archive another admin', async () => {
    signInAs('admin')
    await expect(resetAdminPassword(admin().id, fast)).rejects.toBeInstanceOf(ForbiddenError)
    await expect(archiveAdminAccount(admin().id, fast)).rejects.toBeInstanceOf(ForbiddenError)
  })

  it('keeps the staff-only calls closed to admin IDs', async () => {
    signInAs('superadmin')
    await expect(resetStaffPassword(admin().id, fast)).rejects.toBeInstanceOf(ForbiddenError)
    await expect(archiveStaffAccount(admin().id, fast)).rejects.toBeInstanceOf(ForbiddenError)
  })
})

describe('managing superadmins', () => {
  it('lets a superadmin create another, who then shows in the list', async () => {
    signInAs('superadmin')
    const { account, credentials } = await createSuperadminAccount(person, fast)
    expect(account).toMatchObject({ role: 'superadmin', username: 'maria.santos', mustChangePassword: true })
    expect((await listSuperadmins({}, fast)).data.map((a) => a.id)).toContain(account.id)
    expect(JSON.stringify(await listSuperadmins({}, fast))).not.toContain(credentials.password)
  })

  it('refuses an admin who tries to create one', async () => {
    signInAs('admin')
    await expect(createSuperadminAccount(person, fast)).rejects.toBeInstanceOf(ForbiddenError)
  })

  it('cannot reset or archive a superadmin, even as a superadmin', async () => {
    signInAs('superadmin')
    const id = getAccounts().superadmins[0].id
    await expect(resetAdminPassword(id, fast)).rejects.toBeInstanceOf(ForbiddenError)
    await expect(archiveAdminAccount(id, fast)).rejects.toBeInstanceOf(ForbiddenError)
    await expect(resetStaffPassword(id, fast)).rejects.toThrow()
    await expect(archiveStaffAccount(id, fast)).rejects.toThrow()
    expect(getAccounts().superadmins[0].status).toBe('active')
  })
})

describe('page permissions', () => {
  it('maps URLs to the page they fall under', () => {
    expect(pageKeyFor('/shop/some-product')).toBe('shop')
    expect(pageKeyFor('/profile/measurements')).toBe('body-setup')
    expect(pageKeyFor('/admin/users')).toBe('user-management')
    expect(pageKeyFor('/staff/online-orders')).toBe('online-orders')
    expect(pageKeyFor('/admin')).toBeNull()
    expect(pageKeyFor('/profile')).toBeNull()
  })

  it('starts with staff on operations only, admins on everything and customers on the storefront', () => {
    expect(canView('staff', 'inventory', DEFAULT_PERMISSIONS)).toBe(true)
    expect(canView('staff', 'user-management', DEFAULT_PERMISSIONS)).toBe(false)
    expect(canView('admin', 'user-management', DEFAULT_PERMISSIONS)).toBe(true)
    expect(canView(undefined, 'shop', DEFAULT_PERMISSIONS)).toBe(true)
    expect(canView('customer', 'inventory', DEFAULT_PERMISSIONS)).toBe(false)
  })

  it('always lets a superadmin in, and never holds staff or admins to the storefront list', () => {
    const none = { customer: [], staff: [], admin: [] }
    expect(canView('superadmin', 'user-management', none)).toBe(true)
    expect(canView('superadmin', 'shop', none)).toBe(true)
    expect(canView('staff', 'shop', none)).toBe(true)
    expect(canView(undefined, 'shop', none)).toBe(false)
  })

  it('saves a role and keeps it after a reload', () => {
    setRolePermissions('staff', ['inventory', 'refunds'])
    expect(getPermissions().staff).toEqual(['inventory', 'refunds'])
    expect(JSON.parse(localStorage.getItem(PERMISSIONS_KEY)!).staff).toEqual(['inventory', 'refunds'])
    expect(getPermissions().admin).toEqual(DEFAULT_PERMISSIONS.admin)
  })
})
