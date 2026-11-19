import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEV_SUPERADMIN } from '../../src/data/mockAccounts'
import { DEFAULT_PERMISSIONS, PAGE_GROUPS, canView, pageKeyFor } from '../../src/config/pagePermissions'
import { resetAccounts } from '../../src/service/accountStore'
import { getPermissions, PERMISSIONS_KEY, resetPermissions, setRolePermissions } from '../../src/service/permissionStore'
import { clearSession } from '../../src/service/session'

vi.mock('../../src/service/supabase', () => ({
  getSupabase: async () => ({ auth: { signInWithPassword: vi.fn(), signOut: vi.fn().mockResolvedValue({ error: null }) } }),
}))
const { submitSignIn } = await import('../../src/service/signIn')


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
    expect(canView('staff', 'user-management', { ...DEFAULT_PERMISSIONS, staff: [...DEFAULT_PERMISSIONS.staff, 'user-management'] })).toBe(false)
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

  it('gives the pickup location to admins by default and never to staff, even with every staff key on', () => {
    expect(pageKeyFor('/admin/pickup-location')).toBe('pickup-location')
    expect(pageKeyFor('/superadmin/pickup-location')).toBe('pickup-location')
    expect(canView('admin', 'pickup-location', DEFAULT_PERMISSIONS)).toBe(true)
    expect(canView('superadmin', 'pickup-location', { customer: [], staff: [], admin: [] })).toBe(true)
    expect(canView('admin', 'pickup-location', { ...DEFAULT_PERMISSIONS, admin: [] })).toBe(false)
    const everyKey = PAGE_GROUPS.flatMap((group) => group.pages.map((page) => page.key))
    expect(canView('staff', 'pickup-location', { ...DEFAULT_PERMISSIONS, staff: everyKey })).toBe(false)
    expect(canView('staff', 'pickup-location', DEFAULT_PERMISSIONS)).toBe(false)
    expect(PAGE_GROUPS.find((group) => group.pages.some((page) => page.key === 'pickup-location'))?.roles).toEqual(['admin'])
  })

  it('never offers user management to staff, and ignores it in what staff had saved', () => {
    expect(PAGE_GROUPS.filter((group) => group.roles.includes('staff')).flatMap((group) => group.pages.map((page) => page.key))).not.toContain('user-management')
    expect(PAGE_GROUPS.filter((group) => group.roles.includes('admin')).flatMap((group) => group.pages.map((page) => page.key))).toContain('user-management')
    localStorage.setItem(PERMISSIONS_KEY, JSON.stringify({ staff: ['inventory', 'user-management'] }))
    window.dispatchEvent(new StorageEvent('storage', { key: PERMISSIONS_KEY }))
    expect(getPermissions().staff).toEqual(['inventory'])
  })

  it('saves a role and keeps it after a reload', () => {
    setRolePermissions('staff', ['inventory', 'refunds'])
    expect(getPermissions().staff).toEqual(['inventory', 'refunds'])
    expect(JSON.parse(localStorage.getItem(PERMISSIONS_KEY)!).staff).toEqual(['inventory', 'refunds'])
    expect(getPermissions().admin).toEqual(DEFAULT_PERMISSIONS.admin)
  })
})
