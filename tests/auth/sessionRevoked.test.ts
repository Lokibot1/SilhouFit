import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { peekLoginNotice, takeLoginNotice } from '../../src/service/loginNotice'

vi.mock('../../src/service/supabase', () => ({
  getSupabase: async () => ({ auth: { getSession: async () => ({ data: { session: { access_token: 'tok' } } }) } }),
}))
vi.mock('../../src/service/signOut', () => ({ signOut: vi.fn() }))

const { signOut } = await import('../../src/service/signOut')
const { fetchMe } = await import('../../src/service/fetchMe')
const { resetStaffPasswordApi } = await import('../../src/service/staffApi')
const { changePassword } = await import('../../src/service/changePassword')

const fetchMock = vi.fn()
const reply = (body: unknown, status: number) => fetchMock.mockImplementation(async () => new Response(JSON.stringify(body), { status }))

beforeEach(() => vi.stubGlobal('fetch', fetchMock))
afterEach(() => {
  vi.clearAllMocks()
  vi.unstubAllGlobals()
  takeLoginNotice()
})

const endedWithNotice = (notice: 'password-reset' | 'password-expired' = 'password-reset') => {
  expect(signOut).toHaveBeenCalledTimes(1)
  expect(peekLoginNotice()).toBe(notice)
}

describe('a 401 session_revoked answer', () => {
  it('ends the session from fetchMe and still reports unauthorized', async () => {
    reply({ code: 'session_revoked' }, 401)
    await expect(fetchMe()).rejects.toMatchObject({ kind: 'unauthorized' })
    endedWithNotice()
  })

  it('ends the session from the shared request (staff calls)', async () => {
    reply({ code: 'session_revoked', message: 'Session revoked' }, 401)
    await expect(resetStaffPasswordApi('u1')).rejects.toMatchObject({ kind: 'forbidden', status: 401, code: 'session_revoked' })
    endedWithNotice()
  })

  it('ends the session from changePassword', async () => {
    reply({ code: 'session_revoked' }, 401)
    await expect(changePassword('Old#Pass1', 'New#Pass1')).rejects.toMatchObject({ kind: 'unauthorized' })
    endedWithNotice()
  })

  it('leaves the session alone on any other 401, or on a 403', async () => {
    reply({ code: 'invalid_token' }, 401)
    await expect(fetchMe()).rejects.toMatchObject({ kind: 'unauthorized' })
    await expect(resetStaffPasswordApi('u1')).rejects.toMatchObject({ status: 401 })
    await expect(changePassword('a', 'b')).rejects.toMatchObject({ kind: 'unauthorized' })
    reply({ code: 'session_revoked' }, 403)
    await expect(resetStaffPasswordApi('u1')).rejects.toMatchObject({ status: 403 })
    expect(signOut).not.toHaveBeenCalled()
    expect(peekLoginNotice()).toBeNull()
  })
})

describe('a 403 password_reset_expired answer', () => {
  it('ends the session from fetchMe', async () => {
    reply({ code: 'password_reset_expired' }, 403)
    await expect(fetchMe()).rejects.toMatchObject({ kind: 'server' })
    endedWithNotice('password-expired')
  })

  it('ends the session from the shared request (staff calls)', async () => {
    reply({ code: 'password_reset_expired', message: 'Temporary password expired' }, 403)
    await expect(resetStaffPasswordApi('u1')).rejects.toMatchObject({ status: 403, code: 'password_reset_expired' })
    endedWithNotice('password-expired')
  })

  it('ends the session from changePassword', async () => {
    reply({ code: 'password_reset_expired' }, 403)
    await expect(changePassword('Old#Pass1', 'New#Pass1')).rejects.toMatchObject({ kind: 'unauthorized' })
    endedWithNotice('password-expired')
  })

  it('leaves the session alone on password_change_required (the gate handles it) and on other 403s', async () => {
    reply({ code: 'password_change_required' }, 403)
    await expect(fetchMe()).rejects.toBeDefined()
    await expect(resetStaffPasswordApi('u1')).rejects.toMatchObject({ status: 403, code: 'password_change_required' })
    await expect(changePassword('a', 'b')).rejects.toMatchObject({ kind: 'server' })
    reply({ code: 'invalid_current_password' }, 403)
    await expect(changePassword('a', 'b')).rejects.toMatchObject({ kind: 'wrong-password' })
    expect(signOut).not.toHaveBeenCalled()
    expect(peekLoginNotice()).toBeNull()
  })
})

describe('fetchMe', () => {
  it('passes passwordResetRequired through', async () => {
    reply({ id: 'u1', email: 'a@b.c', firstName: 'A', lastName: 'B', passwordResetRequired: true }, 200)
    expect(await fetchMe()).toMatchObject({ passwordResetRequired: true })
  })
})
