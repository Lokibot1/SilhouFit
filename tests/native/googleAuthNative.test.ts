import { afterEach, describe, expect, it, vi } from 'vitest'

const signInWithOAuth = vi.fn()
const open = vi.fn()
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => true } }))
vi.mock('@capacitor/browser', () => ({ Browser: { open } }))
vi.mock('../../src/service/supabase', () => ({
  getSupabase: async () => ({ auth: { signInWithOAuth } }),
}))

const { startGoogleAuth, GoogleAuthError } = await import('../../src/service/googleAuth')

afterEach(() => vi.clearAllMocks())

describe('startGoogleAuth on a native platform', () => {
  it('redirects to the app scheme, skips the in-webview redirect and opens the system browser', async () => {
    signInWithOAuth.mockResolvedValue({ data: { provider: 'google', url: 'https://accounts.google.test/x' }, error: null })
    await startGoogleAuth({ next: null })
    expect(signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: { redirectTo: 'com.silhoufit.app://auth/callback', skipBrowserRedirect: true },
    })
    expect(open).toHaveBeenCalledWith({ url: 'https://accounts.google.test/x' })
  })

  it('does not open the browser when Supabase refuses', async () => {
    signInWithOAuth.mockResolvedValue({ data: { provider: 'google', url: null }, error: { status: 500 } })
    await expect(startGoogleAuth({ next: null })).rejects.toBeInstanceOf(GoogleAuthError)
    expect(open).not.toHaveBeenCalled()
  })
})
