import type { SignUpPayload } from '../utils/signUpValidation'
import { simulateRequest, type RequestOptions } from './simulateRequest'

// Stand-in for the real endpoint. Nothing is stored; the payload is not logged.
export function submitSignUp(
  payload: SignUpPayload,
  { signal, delayMs = 1200 }: RequestOptions = {},
): Promise<{ ok: true }> {
  // Dev-only hook for exercising the error state: fail@example.com.
  return simulateRequest(
    delayMs,
    signal,
    () => import.meta.env.DEV && payload.email.split('@')[0] === 'fail',
  )
}
