import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getAccounts, resetAccounts } from '../../src/service/accountStore'
import { clearSession, setSession } from '../../src/service/session'

const getSession = vi.fn()
const signInWithPassword = vi.fn()
const updateUser = vi.fn()
vi.mock('../../src/service/supabase', () => ({
  getSupabase: async () => ({ auth: { getSession, signInWithPassword, updateUser } }),
}))
vi.mock('../../src/service/simulateRequest', () => ({ simulateRequest: () => Promise.resolve({ ok: true }) }))

const { ChangePasswordError, changePassword, hasPasswordLogin } = await import('../../src/service/changePassword')

const fetchMock = vi.fn()
const user = { email: 'sam@silhoufit.dev', identities: [{ provider: 'email' }], app_metadata: { providers: ['email'] } }

beforeEach(() => {
  getSession.mockResolvedValue({ data: { session: { access_token: 'token-123', user } } })
  signInWithPassword.mockResolvedValue({ error: null })
  updateUser.mockResolvedValue({ error: null })
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
  vi.clearAllMocks()
  vi.unstubAllGlobals()
  clearSession()
})

describe('changePassword through Supabase Auth', () => {
  it('re-checks the current password with the account email, then updates the password, and never calls the API', async () => {
    await expect(changePassword('Old#Pass1', 'newpass')).resolves.toBeUndefined()
    expect(signInWithPassword).toHaveBeenCalledWith({ email: 'sam@silhoufit.dev', password: 'Old#Pass1' })
    expect(updateUser).toHaveBeenCalledWith({ password: 'newpass' })
    expect(signInWithPassword.mock.invocationCallOrder[0]).toBeLessThan(updateUser.mock.invocationCallOrder[0])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('maps a wrong current password and stops before updating', async () => {
    signInWithPassword.mockResolvedValue({ error: { code: 'invalid_credentials', status: 400 } })
    await expect(changePassword('bad', 'newpass')).rejects.toMatchObject({ kind: 'wrong-password' })
    expect(updateUser).not.toHaveBeenCalled()
  })

  it.each([
    [{ code: 'same_password', status: 422 }, 'same'],
    [{ code: 'weak_password', status: 422, message: 'Password should be at least 6 characters.' }, 'weak'],
    [{ code: 'over_request_rate_limit', status: 429 }, 'rate-limit'],
    [{ status: 401 }, 'unauthorized'],
    [{ code: 'session_not_found', status: 403 }, 'unauthorized'],
    [{ status: 0 }, 'network'],
    [{ status: 503 }, 'unavailable'],
    [{ status: 500 }, 'server'],
  ])('maps the update failure %j to %s', async (error, kind) => {
    updateUser.mockResolvedValue({ error })
    await expect(changePassword('Old#Pass1', 'newpass')).rejects.toMatchObject({ kind })
  })

  it("keeps Supabase's own message for a weak password", async () => {
    updateUser.mockResolvedValue({ error: { code: 'weak_password', status: 422, message: 'Password should be at least 6 characters.' } })
    await expect(changePassword('Old#Pass1', 'abc')).rejects.toMatchObject({ kind: 'weak', detail: 'Password should be at least 6 characters.' })
  })

  it('maps sign-in failures: banned is unauthorized, a dropped request is network, 429 is rate-limit', async () => {
    signInWithPassword.mockResolvedValueOnce({ error: { code: 'user_banned', status: 403 } })
    await expect(changePassword('a', 'newpass')).rejects.toMatchObject({ kind: 'unauthorized' })
    signInWithPassword.mockResolvedValueOnce({ error: { status: 0 } })
    await expect(changePassword('a', 'newpass')).rejects.toMatchObject({ kind: 'network' })
    signInWithPassword.mockResolvedValueOnce({ error: { status: 429 } })
    await expect(changePassword('a', 'newpass')).rejects.toBeInstanceOf(ChangePasswordError)
  })

  it('is unauthorized without a session, and signs nothing in', async () => {
    getSession.mockResolvedValue({ data: { session: null } })
    await expect(changePassword('a', 'b')).rejects.toMatchObject({ kind: 'unauthorized' })
    expect(signInWithPassword).not.toHaveBeenCalled()
  })

  it('is a server error when the session cannot be read', async () => {
    getSession.mockRejectedValue(new Error('storage blocked'))
    await expect(changePassword('a', 'b')).rejects.toMatchObject({ kind: 'server' })
  })

  describe('hasPasswordLogin', () => {
    it('is true for an email account, false for a Google-only one, and true when unknown', async () => {
      await expect(hasPasswordLogin()).resolves.toBe(true)
      getSession.mockResolvedValue({ data: { session: { user: { identities: [{ provider: 'google' }], app_metadata: { providers: ['google'] } } } } })
      await expect(hasPasswordLogin()).resolves.toBe(false)
      getSession.mockResolvedValue({ data: { session: { user: { identities: [{ provider: 'google' }, { provider: 'email' }] } } } })
      await expect(hasPasswordLogin()).resolves.toBe(true)
      getSession.mockRejectedValue(new Error('x'))
      await expect(hasPasswordLogin()).resolves.toBe(true)
    })
  })

  describe('for a simulated account', () => {
    beforeEach(() => {
      resetAccounts()
    })

    function signInAsPendingStaff() {
      const staff = getAccounts().staff.find((a) => a.mustChangePassword)!
      setSession({ name: 'Pending Staff', email: staff.email, role: 'staff', simulated: true, accountId: staff.id })
      return { staff, temporary: getAccounts().passwords[staff.id] }
    }

    it('changes the saved password without any request', async () => {
      const { staff, temporary } = signInAsPendingStaff()
      await changePassword(temporary, 'Fresh#Pass1')
      expect(fetchMock).not.toHaveBeenCalled()
      expect(getAccounts().passwords[staff.id]).toBe('Fresh#Pass1')
      expect(getAccounts().staff.find((a) => a.id === staff.id)!.mustChangePassword).toBe(false)
    })

    it('maps a wrong current password, the same password and a weak one', async () => {
      const { temporary } = signInAsPendingStaff()
      await expect(changePassword('Wrong#Pass1', 'Fresh#Pass1')).rejects.toMatchObject({ kind: 'wrong-password' })
      await expect(changePassword(temporary, temporary)).rejects.toMatchObject({ kind: 'same' })
      await expect(changePassword(temporary, 'weak')).rejects.toMatchObject({ kind: 'weak' })
    })

    it.each([
      ['admins', 'admin'],
      ['superadmins', 'superadmin'],
    ] as const)('works for the simulated %s account: verifies, rejects the same, and the new password replaces the old', async (list, role) => {
      const account = getAccounts()[list][0]
      const old = getAccounts().passwords[account.id]
      setSession({ name: 'Admin', email: account.email, role, simulated: true, accountId: account.id })
      await expect(changePassword('Wrong#Pass1', 'Fresh#Pass1')).rejects.toMatchObject({ kind: 'wrong-password' })
      await expect(changePassword(old, old)).rejects.toMatchObject({ kind: 'same' })
      await expect(changePassword(old, 'Fresh#Pass1')).resolves.toBeUndefined()
      expect(fetchMock).not.toHaveBeenCalled()
      expect(getAccounts().passwords[account.id]).toBe('Fresh#Pass1')
      await expect(changePassword(old, 'Other#Pass1')).rejects.toMatchObject({ kind: 'wrong-password' })
    })
  })
})
