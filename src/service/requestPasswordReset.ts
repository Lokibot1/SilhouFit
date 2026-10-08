import { simulateRequest, type RequestOptions } from './simulateRequest'

// Stand-in for the real endpoint. It answers the same for every address so it cannot reveal which accounts exist.
export function requestPasswordReset(
  { email }: { email: string },
  { signal, delayMs = 1000 }: RequestOptions = {},
): Promise<{ ok: true }> {
  // Dev-only hook for exercising the error state: fail@example.com.
  return simulateRequest(delayMs, signal, () => import.meta.env.DEV && email.split('@')[0] === 'fail')
}
