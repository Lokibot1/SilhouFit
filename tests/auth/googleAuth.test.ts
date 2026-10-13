import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const signInWithOAuth = vi.fn()
vi.mock('../../src/service/supabase', () => ({
  getSupabase: async () => ({ auth: { signInWithOAuth } }),
}))

const { clearStashedNext, GOOGLE_START_ERROR, googleErrorMessage, readStashedNext, startGoogleAuth } = await import(
  '../../src/service/googleAuth'
)

beforeEach(() => {
  signInWithOAuth.mockResolvedValue({ data: { provider: 'google', url: 'https://x' }, error: null })
  clearStashedNext()
})
afterEach(() => vi.clearAllMocks())

describe('startGoogleAuth', () => {
  it('asks Supabase for Google with the callback page as the redirect', async () => {
    await startGoogleAuth({ next: null })
    expect(signInWithOAuth).toHaveBeenCalledTimes(1)
    expect(signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
  })

  it('stashes a safe next path and keeps it out of redirectTo', async () => {
    await startGoogleAuth({ next: '/checkout?item=p04' })
    expect(readStashedNext()).toBe('/checkout?item=p04')
    expect(signInWithOAuth.mock.calls[0][0].options.redirectTo).not.toContain('checkout')
  })

  it.each(['//evil.com', 'https://evil.com', '/\\evil.com', 'javascript:alert(1)', ''])(
    'does not stash the unsafe next %j',
    async (next) => {
      await startGoogleAuth({ next })
      expect(readStashedNext()).toBeNull()
    },
  )

  it('drops a stale stash when the new attempt has no next', async () => {
    await startGoogleAuth({ next: '/shop' })
    await startGoogleAuth({ next: null })
    expect(readStashedNext()).toBeNull()
  })

  it('stores nothing but the path', async () => {
    await startGoogleAuth({ next: '/shop' })
    expect(Object.keys(sessionStorage)).toEqual(['silhoufit-auth-next'])
    expect(sessionStorage.getItem('silhoufit-auth-next')).toBe('/shop')
  })

  it.each([
    ['status 0', { status: 0, message: 'fetch failed' }, 'network'],
    ['status 500', { status: 500, message: 'boom' }, 'server'],
    ['no status', { message: 'provider is not enabled' }, 'server'],
  ])('maps a Supabase error with %s to %s and clears the stash', async (_name, error, kind) => {
    signInWithOAuth.mockResolvedValue({ data: { provider: 'google', url: null }, error })
    await expect(startGoogleAuth({ next: '/shop' })).rejects.toMatchObject({ kind })
    expect(readStashedNext()).toBeNull()
  })

  it('maps a TypeError (a script that would not load) to network and anything else to server', async () => {
    signInWithOAuth.mockRejectedValueOnce(new TypeError('Failed to fetch dynamically imported module'))
    await expect(startGoogleAuth({ next: null })).rejects.toMatchObject({ kind: 'network' })
    signInWithOAuth.mockRejectedValueOnce(new Error('supabaseUrl is required.'))
    await expect(startGoogleAuth({ next: null })).rejects.toMatchObject({ kind: 'server' })
  })

  it('still starts when sessionStorage is blocked', async () => {
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError')
    })
    await expect(startGoogleAuth({ next: '/shop' })).resolves.toBeUndefined()
    expect(signInWithOAuth).toHaveBeenCalledTimes(1)
    set.mockRestore()
  })
})

describe('googleErrorMessage', () => {
  it('gives each kind its own copy and falls back to the server copy', async () => {
    signInWithOAuth.mockRejectedValueOnce(new TypeError('x'))
    const failure = await startGoogleAuth({ next: null }).catch((error: unknown) => error)
    expect(googleErrorMessage(failure)).toBe(GOOGLE_START_ERROR.network)
    expect(googleErrorMessage(new Error('anything'))).toBe(GOOGLE_START_ERROR.server)
    expect(GOOGLE_START_ERROR.network).not.toBe(GOOGLE_START_ERROR.server)
  })
})
