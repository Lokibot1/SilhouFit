import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../src/service/supabase', () => ({
  getSupabase: async () => ({ auth: { getSession: async () => ({ data: { session: { access_token: 'token-123' } } }) } }),
}))

const { onAccountDeactivated } = await import('../../src/service/accountDeactivated')
const { fetchMe } = await import('../../src/service/fetchMe')
const { request } = await import('../../src/service/fetchProductList')

const answer = (status: number, message: string) => new Response(JSON.stringify({ message }), { status })
const ended = vi.fn()

beforeEach(() => onAccountDeactivated(ended))
afterEach(() => {
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

describe('a deactivated account that still holds a valid token', () => {
  it('fetchMe reports it, rejects as deactivated', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(answer(403, 'User account is deactivated')))
    await expect(fetchMe()).rejects.toMatchObject({ kind: 'deactivated' })
    expect(ended).toHaveBeenCalledTimes(1)
  })

  it('fetchMe keeps a missing profile as not-found, without ending the session', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(answer(403, 'User profile not found')))
    await expect(fetchMe()).rejects.toMatchObject({ kind: 'not-found' })
    expect(ended).not.toHaveBeenCalled()
  })

  it('any other API request reports it too, and still rejects as forbidden', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(answer(403, 'User account is deactivated')))
    await expect(request('GET', '/cart', undefined)).rejects.toMatchObject({ kind: 'forbidden', status: 403 })
    expect(ended).toHaveBeenCalledTimes(1)
  })

  it('an ordinary 403 does not end the session', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(answer(403, 'Forbidden resource')))
    await expect(request('GET', '/admin/orders', undefined)).rejects.toMatchObject({ kind: 'forbidden' })
    expect(ended).not.toHaveBeenCalled()
  })
})
