import { simulateRequest, type RequestOptions } from './simulateRequest'

// Stand-in for Google OAuth. No Google script or SDK is loaded and nothing is stored.
export async function submitGoogleSignIn({
  signal,
  delayMs = 1200,
}: RequestOptions = {}): Promise<{ ok: true; user: { name: string; email: string } }> {
  // Dev-only hook for exercising the error state: open /login?google=fail.
  await simulateRequest(
    delayMs,
    signal,
    () => import.meta.env.DEV && new URLSearchParams(window.location.search).get('google') === 'fail',
  )
  return { ok: true, user: { name: 'Demo Shopper', email: 'demo@silhoufit.com' } }
}
