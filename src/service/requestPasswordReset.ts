import type { RequestOptions } from './simulateRequest'

export type PasswordResetErrorKind = 'rate-limit' | 'network' | 'server'

/** `kind` lets the caller pick accurate copy. */
export class PasswordResetError extends Error {
  kind: PasswordResetErrorKind

  constructor(kind: PasswordResetErrorKind) {
    super(`Sending the password reset email failed (${kind}).`)
    this.kind = kind
  }
}

/**
 * Supabase Auth `POST /auth/v1/recover`: emails the address a link to choose a new password. Supabase answers 200 whether or not the address has an account,
 * so it cannot reveal which accounts exist. The call is made without supabase-js so no PKCE code verifier is tied to this browser: an administrator
 * sends the email for someone else, and that person must be able to open the link on their own device (the link carries a session in the URL hash).
 * The link lands on /auth/callback, which sends a recovery session on to /auth/set-password.
 */
export async function requestPasswordReset({ email }: { email: string }, { signal }: RequestOptions = {}): Promise<{ ok: true }> {
  const redirectTo = encodeURIComponent(`${window.location.origin}/auth/callback`)
  let response: Response
  try {
    response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/auth/v1/recover?redirect_to=${redirectTo}`, {
      method: 'POST',
      headers: { apikey: import.meta.env.VITE_SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
      signal,
    })
  } catch (failure) {
    if (signal?.aborted) throw failure
    throw new PasswordResetError('network')
  }
  if (response.ok) return { ok: true }
  throw new PasswordResetError(response.status === 429 ? 'rate-limit' : 'server')
}
