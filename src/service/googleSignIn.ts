import { simulateRequest, type RequestOptions } from './simulateRequest'

// Stand-in for Google OAuth. No Google script or SDK is loaded and nothing is stored.
export function submitGoogleSignIn({ signal, delayMs = 1200 }: RequestOptions = {}): Promise<{ ok: true }> {
  // Dev-only hook for exercising the error state: open /login?google=fail.
  return simulateRequest(
    delayMs,
    signal,
    () => import.meta.env.DEV && new URLSearchParams(window.location.search).get('google') === 'fail',
  )
}
