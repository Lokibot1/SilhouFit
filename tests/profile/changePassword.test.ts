import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getAccounts, resetAccounts } from '../../src/service/accountStore'
import { clearSession, setSession } from '../../src/service/session'

const getSession = vi.fn()
vi.mock('../../src/service/supabase', () => ({
  getSupabase: async () => ({ auth: { getSession } }),
}))
vi.mock('../../src/service/simulateRequest', () => ({ simulateRequest: () => Promise.resolve({ ok: true }) }))

const { ChangePasswordError, changePassword } = await import('../../src/service/changePassword')

const fetchMock = vi.fn()
const json = (body: unknown, status: number) => new Response(JSON.stringify(body), { status })

beforeEach(() => {
  getSession.mockResolvedValue({ data: { session: { access_token: 'token-123' } } })
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
  vi.clearAllMocks()
  vi.unstubAllGlobals()
  clearSession()
})

describe('changePassword', () => {
  it('POSTs both passwords as JSON with the bearer token and resolves on 204', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }))
    await expect(changePassword('Old#Pass1', 'New#Pass1')).resolves.toBeUndefined()
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toMatch(/\/users\/me\/password$/)
    expect(init.method).toBe('POST')
    expect(init.headers).toEqual({ Authorization: 'Bearer token-123', 'Content-Type': 'application/json' })
    expect(JSON.parse(init.body)).toEqual({ currentPassword: 'Old#Pass1', newPassword: 'New#Pass1' })
  })

  it.each([
    [400, {}, 'weak'],
    [401, {}, 'unauthorized'],
    [403, { code: 'invalid_current_password' }, 'wrong-password'],
    [403, { code: 'other' }, 'server'],
    [422, { code: 'same_password' }, 'same'],
    [422, {}, 'weak'],
    [429, {}, 'rate-limit'],
    [500, {}, 'server'],
    [502, {}, 'unavailable'],
    [503, {}, 'unavailable'],
    [404, {}, 'server'],
  ])('maps %i %j to %s', async (status, body, kind) => {
    fetchMock.mockResolvedValue(json(body, status))
    await expect(changePassword('Old#Pass1', 'New#Pass1')).rejects.toMatchObject({ kind })
  })

  it('maps a failed request to network, and an unreadable error body still maps by status', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    await expect(changePassword('a', 'b')).rejects.toBeInstanceOf(ChangePasswordError)
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    await expect(changePassword('a', 'b')).rejects.toMatchObject({ kind: 'network' })
    fetchMock.mockResolvedValueOnce(new Response('<html>', { status: 403 }))
    await expect(changePassword('a', 'b')).rejects.toMatchObject({ kind: 'server' })
  })

  it('is unauthorized without a session, and sends no request', async () => {
    getSession.mockResolvedValue({ data: { session: null } })
    await expect(changePassword('a', 'b')).rejects.toMatchObject({ kind: 'unauthorized' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('is a server error when the session cannot be read', async () => {
    getSession.mockRejectedValue(new Error('storage blocked'))
    await expect(changePassword('a', 'b')).rejects.toMatchObject({ kind: 'server' })
  })

  describe('for a simulated account', () => {
    beforeEach(() => {
      resetAccounts()
    })

    function signInAsPendingStaff() {
      const staff = getAccounts().staff.find((a) => a.mustChangePassword)!
      setSession({ name: 'Pending Staff', email: staff.email, role: 'staff', simulated: true, accountId: staff.id, mustChangePassword: true })
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
  })
})
