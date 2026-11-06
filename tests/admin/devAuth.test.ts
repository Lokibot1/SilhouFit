import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEV_ADMIN } from '../../src/data/mockAccounts'
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
    expect(result).toMatchObject({ ok: true, user: { role: 'admin', simulated: true, email: DEV_ADMIN.email } })
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

  it('signs in a staff account that still has to change its password', async () => {
    const pending = getAccounts().staff.find((a) => a.mustChangePassword)!
    const result = await submitSignIn({ email: pending.email, password: getAccounts().passwords[pending.id] })
    expect(result).toMatchObject({ ok: true, user: { role: 'staff', accountId: pending.id } })
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
    expect(me).toMatchObject({ id: admin.id, role: 'admin', status: 'active' })
  })

  it('rejects as unauthorized when the account no longer exists', () => {
    expect(() => simulatedMe({ accountId: 'gone' })).toThrowError(/unauthorized/)
  })
})
