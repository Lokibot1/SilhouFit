import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEV_ADMIN } from '../../src/data/mockAccounts'
import { archiveStaffAccount, createAdminAccount, createStaffAccount, getAccountSummary, resetStaffPassword, restoreStaffAccount } from '../../src/service/accountService'
import { getAccounts, resetAccounts } from '../../src/service/accountStore'
import { simulatedMe } from '../../src/service/devAuth'
import { fetchMe } from '../../src/service/fetchMe'
import { clearSession, getSession, setSession } from '../../src/service/session'
import { validateLogin } from '../../src/utils/loginValidation'
import { homeFor } from '../../src/utils/staffRole'

const signInWithPassword = vi.fn()
vi.mock('../../src/service/supabase', () => ({
  getSupabase: async () => ({ auth: { signInWithPassword, signOut: vi.fn().mockResolvedValue({ error: null }) } }),
}))

const { submitSignIn } = await import('../../src/service/signIn')

beforeEach(() => {
  localStorage.clear()
  resetAccounts()
  signInWithPassword.mockResolvedValue({ data: { session: null }, error: { code: 'invalid_credentials', status: 400, message: 'x' } })
})
afterEach(() => {
  vi.clearAllMocks()
  clearSession()
})

describe('dev admin', () => {
  it('passes the real login validation', () => {
    expect(validateLogin(DEV_ADMIN)).toEqual({})
  })

  it('signs in without touching Supabase and lands on the admin dashboard', async () => {
    const result = await submitSignIn(DEV_ADMIN)
    expect(result).toMatchObject({ ok: true, user: { role: 'admin', simulated: true, email: DEV_ADMIN.email, mustChangePassword: false } })
    expect(signInWithPassword).not.toHaveBeenCalled()
    expect(homeFor('admin')).toBe('/admin')
  })

  it('records the sign-in time', async () => {
    const before = getAccounts().admins[0].lastSignInAt
    await submitSignIn(DEV_ADMIN)
    expect(getAccounts().admins[0].lastSignInAt).not.toBe(before)
  })
})

describe('saved accounts', () => {
  it('rejects a wrong password as invalid, like an unknown email', async () => {
    expect(await submitSignIn({ email: DEV_ADMIN.email, password: 'Wrong@12345' })).toEqual({ ok: false, reason: 'invalid' })
    expect(signInWithPassword).not.toHaveBeenCalled()
  })

  it('rejects an archived account that has the right password as archived', async () => {
    const archived = getAccounts().staff.find((a) => a.status === 'archived')!
    expect(await submitSignIn({ email: archived.email, password: getAccounts().passwords[archived.id] })).toEqual({ ok: false, reason: 'archived' })
  })

  it('does not say an account is archived to someone with the wrong password', async () => {
    const archived = getAccounts().staff.find((a) => a.status === 'archived')!
    expect(await submitSignIn({ email: archived.email, password: 'Wrong@12345' })).toEqual({ ok: false, reason: 'invalid' })
  })

  it('signs in a new staff account with its temporary password and flags the first login', async () => {
    const pending = getAccounts().staff.find((a) => a.mustChangePassword)!
    const result = await submitSignIn({ email: pending.email, password: getAccounts().passwords[pending.id] })
    expect(result).toMatchObject({ ok: true, user: { role: 'staff', mustChangePassword: true, accountId: pending.id } })
  })

  it('falls through to Supabase for any other email', async () => {
    expect(await submitSignIn({ email: 'anne@example.com', password: 'Anne@1234' })).toEqual({ ok: false, reason: 'invalid' })
    expect(signInWithPassword).toHaveBeenCalledWith({ email: 'anne@example.com', password: 'Anne@1234' })
  })
})

describe('simulated session', () => {
  it('is read back as the account by fetchMe', async () => {
    const admin = getAccounts().admins[0]
    setSession({ name: 'Dev Admin', email: admin.email, role: 'admin', simulated: true, accountId: admin.id })
    expect(getSession()).toMatchObject({ simulated: true, accountId: admin.id })
    const me = await fetchMe()
    expect(me).toMatchObject({ id: admin.id, role: 'admin', status: 'active', mustChangePassword: false, passwordChangeSkippable: true })
  })

  it('rejects as unauthorized when the account no longer exists', () => {
    expect(() => simulatedMe({ accountId: 'gone' })).toThrowError(/unauthorized/)
  })
})

describe('account changes reach the simulated sign-in', () => {
  const fast = { delayMs: 0 }
  const person = { firstName: 'Nora', lastName: 'Vega', phone: '' }

  it('a created staff or admin account is listed, counted, and signs in with the shown credentials', async () => {
    const before = await getAccountSummary(fast)
    const staff = await createStaffAccount(person, fast)
    const admin = await createAdminAccount({ ...person, firstName: 'Omar' }, fast)
    const after = await getAccountSummary(fast)
    expect([after.staff - before.staff, after.admins - before.admins]).toEqual([1, 1])
    expect(getAccounts().staff[0].id).toBe(staff.account.id)
    expect(await submitSignIn({ email: staff.credentials.email, password: staff.credentials.password })).toMatchObject({ ok: true, user: { role: 'staff', mustChangePassword: true } })
    expect(await submitSignIn({ email: admin.credentials.email, password: admin.credentials.password })).toMatchObject({ ok: true, user: { role: 'admin' } })
  })

  it('archiving blocks sign-in and shows the session as archived; restoring re-enables it', async () => {
    const { account, credentials } = await createStaffAccount(person, fast)
    const signedIn = await submitSignIn({ email: credentials.email, password: credentials.password })
    const session = (signedIn as { ok: true; user: { accountId: string } }).user
    await archiveStaffAccount(account.id, fast)
    expect(await submitSignIn({ email: credentials.email, password: credentials.password })).toEqual({ ok: false, reason: 'archived' })
    expect(simulatedMe(session).status).toBe('archived')
    await restoreStaffAccount(account.id, fast)
    expect(simulatedMe(session).status).toBe('active')
    expect(await submitSignIn({ email: credentials.email, password: credentials.password })).toMatchObject({ ok: true })
  })

  it('resetting a staff password retires the old one, accepts the new one, flags the account and logs it', async () => {
    const staff = getAccounts().staff.find((a) => a.status === 'active' && !a.mustChangePassword)!
    const old = getAccounts().passwords[staff.id]
    const { credentials } = await resetStaffPassword(staff.id, fast)
    expect(await submitSignIn({ email: staff.email, password: old })).toEqual({ ok: false, reason: 'invalid' })
    expect(await submitSignIn({ email: staff.email, password: credentials.password })).toMatchObject({ ok: true, user: { mustChangePassword: true } })
    expect(simulatedMe({ accountId: staff.id }).mustChangePassword).toBe(true)
    expect(getAccounts().activity[0]).toMatchObject({ kind: 'password-reset', target: `${staff.firstName} ${staff.lastName}` })
  })
})
