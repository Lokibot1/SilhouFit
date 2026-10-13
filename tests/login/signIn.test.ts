import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const signInWithPassword = vi.fn()
const signOut = vi.fn()
vi.mock('../../src/service/supabase', () => ({
  getSupabase: async () => ({ auth: { signInWithPassword, signOut } }),
}))

const { submitSignIn } = await import('../../src/service/signIn')

const PAYLOAD = { email: 'anne@example.com', password: 'Anne@1234' }
const PROFILE = { email: 'anne@example.com', firstName: 'Anne', lastName: 'Santos', fullName: 'Anne Santos' }
const fetchMock = vi.fn()

beforeEach(() => {
  signOut.mockResolvedValue({ error: null })
  signInWithPassword.mockResolvedValue({ data: { session: { access_token: 'token-123' } }, error: null })
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

describe('submitSignIn', () => {
  it('signs in, loads the profile with the bearer token and maps the user', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify(PROFILE), { status: 200 }))
    const result = await submitSignIn(PAYLOAD)

    expect(signInWithPassword).toHaveBeenCalledWith(PAYLOAD)
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/users\/me$/)
    expect(fetchMock.mock.calls[0][1].headers).toEqual({ Authorization: 'Bearer token-123' })
    expect(result).toEqual({ ok: true, user: { name: 'Anne Santos', email: 'anne@example.com' } })
  })

  it('falls back to first and last name when fullName is null', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ ...PROFILE, fullName: null }), { status: 200 }))
    const result = await submitSignIn(PAYLOAD)
    expect(result).toEqual({ ok: true, user: { name: 'Anne Santos', email: 'anne@example.com' } })
  })

  it.each(['invalid_credentials', 'email_not_confirmed'])('returns the generic invalid result for %s', async (code) => {
    signInWithPassword.mockResolvedValue({ data: { session: null }, error: { code, status: 400, message: code } })
    expect(await submitSignIn(PAYLOAD)).toEqual({ ok: false, reason: 'invalid' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('signs out of Supabase and throws when the profile is missing (404)', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 404 }))
    await expect(submitSignIn(PAYLOAD)).rejects.toMatchObject({ kind: 'profile' })
    expect(signOut).toHaveBeenCalledTimes(1)
  })

  it('classifies a profile server error (500) as profile and signs out', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 500 }))
    await expect(submitSignIn(PAYLOAD)).rejects.toMatchObject({ kind: 'profile' })
    expect(signOut).toHaveBeenCalledTimes(1)
  })

  it('classifies a profile rate limit (429) as rate-limit and signs out', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 429 }))
    await expect(submitSignIn(PAYLOAD)).rejects.toMatchObject({ kind: 'rate-limit' })
    expect(signOut).toHaveBeenCalledTimes(1)
  })

  it('signs out and reports profile when the body is not valid JSON', async () => {
    fetchMock.mockResolvedValue(new Response('<html>', { status: 200 }))
    await expect(submitSignIn(PAYLOAD)).rejects.toMatchObject({ kind: 'profile' })
    expect(signOut).toHaveBeenCalledTimes(1)
  })

  it('signs out when aborted while the profile request is in flight', async () => {
    const abort = new AbortController()
    fetchMock.mockImplementation(async () => {
      abort.abort()
      throw abort.signal.reason
    })
    await expect(submitSignIn(PAYLOAD, { signal: abort.signal })).rejects.toThrow()
    expect(signOut).toHaveBeenCalledTimes(1)
  })

  it('still throws the original failure when signOut itself fails', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    signOut.mockRejectedValue(new Error('signOut failed'))
    await expect(submitSignIn(PAYLOAD)).rejects.toMatchObject({ kind: 'network' })
  })

  it('throws on a network error from Supabase', async () => {
    const failure = { code: undefined, status: 0, message: 'Failed to fetch' }
    signInWithPassword.mockResolvedValue({ data: { session: null }, error: failure })
    await expect(submitSignIn(PAYLOAD)).rejects.toMatchObject({ kind: 'network' })
  })

  it('classifies any other Supabase failure as server', async () => {
    signInWithPassword.mockResolvedValue({ data: { session: null }, error: { code: 'unexpected_failure', status: 500, message: 'boom' } })
    await expect(submitSignIn(PAYLOAD)).rejects.toMatchObject({ kind: 'server' })
  })

  it('throws on a rate limit', async () => {
    signInWithPassword.mockResolvedValue({ data: { session: null }, error: { code: 'over_request_rate_limit', status: 429, message: 'slow down' } })
    await expect(submitSignIn(PAYLOAD)).rejects.toMatchObject({ kind: 'rate-limit' })
  })

  it('throws on a network error from the profile request', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    await expect(submitSignIn(PAYLOAD)).rejects.toMatchObject({ kind: 'network' })
    expect(signOut).toHaveBeenCalledTimes(1)
  })

  it('throws when aborted while Supabase is answering', async () => {
    const abort = new AbortController()
    signInWithPassword.mockImplementation(async () => {
      abort.abort()
      return { data: { session: { access_token: 't' } }, error: null }
    })
    await expect(submitSignIn(PAYLOAD, { signal: abort.signal })).rejects.toThrow()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(signOut).toHaveBeenCalledTimes(1)
  })
})
