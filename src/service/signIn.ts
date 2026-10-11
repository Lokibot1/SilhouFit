import { simulateRequest, type RequestOptions } from './simulateRequest'

export interface SignInPayload {
  email: string
  password: string
  // Ignored here: persisting the session is Supabase's job once the real endpoint replaces this stub.
  remember?: boolean
}

export type SignInResult = { ok: true; user: { name: string; email: string } } | { ok: false; reason: 'invalid' }

// Stand-in for the real endpoint. Only the demo pair signs in; nothing is stored and the payload is not logged.
export async function submitSignIn(
  { email, password }: SignInPayload,
  { signal, delayMs = 1000 }: RequestOptions = {},
): Promise<SignInResult> {
  // Dev-only hook for exercising the error state: fail@example.com.
  await simulateRequest(delayMs, signal, () => import.meta.env.DEV && email.split('@')[0] === 'fail')
  return email === 'demo@silhoufit.com' && password === 'Demo@1234' ? { ok: true, user: { name: 'Demo Shopper', email } } : { ok: false, reason: 'invalid' }
}
