import type { User } from '@supabase/supabase-js'
import { SIMULATED_AUTH } from '../config/accountPolicy'
import { getSession } from './session'
import type { RequestOptions } from './simulateRequest'
import { getSupabase } from './supabase'

export type ChangePasswordErrorKind = 'wrong-password' | 'same' | 'weak' | 'rate-limit' | 'network' | 'unauthorized' | 'unavailable' | 'server'

/** `kind` lets the sheet pick accurate copy; `detail` is Supabase's own message for a password it refuses (`weak`). */
export class ChangePasswordError extends Error {
  kind: ChangePasswordErrorKind
  detail?: string

  constructor(kind: ChangePasswordErrorKind, detail?: string) {
    super(`Changing the password failed (${kind}).`)
    this.kind = kind
    this.detail = detail
  }
}

type AuthFailure = { code?: string; status?: number; message?: string }

/** Whether the signed-in account has a password to change: false for one that signs in only with Google (or another provider). Unknown reads as true. */
export async function hasPasswordLogin(): Promise<boolean> {
  if (SIMULATED_AUTH && getSession()?.simulated) return true
  try {
    const supabase = await getSupabase()
    const user: User | undefined = (await supabase.auth.getSession()).data.session?.user
    if (!user) return true
    const providers = [...(user.identities ?? []).map((identity) => identity.provider), ...((user.app_metadata?.providers as string[] | undefined) ?? [])]
    return providers.length === 0 || providers.includes('email')
  } catch {
    return true
  }
}

/** Supabase answers status 0 when the request never reached it. */
function failureKind({ code, status }: AuthFailure): ChangePasswordErrorKind {
  if (status === 0) return 'network'
  if (status === 429 || code === 'over_request_rate_limit') return 'rate-limit'
  if (status === 502 || status === 503 || status === 504) return 'unavailable'
  return 'server'
}

/**
 * Changes the signed-in person's password straight through Supabase Auth (the API has no password routes), for every role. The current password is checked
 * first by signing in with it again, then `updateUser` sets the new one. The app's sign-up password rules are checked by the form first; Supabase may still refuse a password, and its message
 * for a refused password is kept in `detail`. A simulated account is answered from the saved accounts instead.
 */
export async function changePassword(currentPassword: string, newPassword: string, { signal }: RequestOptions = {}): Promise<void> {
  const session = getSession()
  if (SIMULATED_AUTH && session?.simulated) {
    const { changePassword: changeSimulated } = await import('./accountService')
    try {
      await changeSimulated(session.accountId ?? '', currentPassword, newPassword, { signal })
    } catch (failure) {
      const kind = (failure as { kind?: string } | null)?.kind
      throw new ChangePasswordError(kind === 'wrong-password' ? 'wrong-password' : kind === 'same' ? 'same' : kind === 'validation' ? 'weak' : 'server')
    }
    return
  }

  let supabase: Awaited<ReturnType<typeof getSupabase>>
  let email: string | undefined
  try {
    supabase = await getSupabase()
    email = (await supabase.auth.getSession()).data.session?.user.email
  } catch {
    throw new ChangePasswordError('server')
  }
  if (!email) throw new ChangePasswordError('unauthorized')

  const check = await supabase.auth.signInWithPassword({ email, password: currentPassword })
  signal?.throwIfAborted()
  if (check.error) {
    const { code } = check.error as AuthFailure
    if (code === 'invalid_credentials') throw new ChangePasswordError('wrong-password')
    if (code === 'user_banned') throw new ChangePasswordError('unauthorized')
    throw new ChangePasswordError(failureKind(check.error))
  }

  const { error } = await supabase.auth.updateUser({ password: newPassword })
  signal?.throwIfAborted()
  if (!error) return
  const { code, status, message } = error as AuthFailure
  if (code === 'same_password') throw new ChangePasswordError('same')
  if (code === 'weak_password') throw new ChangePasswordError('weak', message)
  if (status === 401 || code === 'session_not_found' || code === 'session_expired') throw new ChangePasswordError('unauthorized')
  throw new ChangePasswordError(failureKind(error))
}
