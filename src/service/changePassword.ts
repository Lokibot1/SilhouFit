import { SIMULATED_AUTH } from '../config/accountPolicy'
import { getSession } from './session'
import type { RequestOptions } from './simulateRequest'
import { getSupabase } from './supabase'

export type ChangePasswordErrorKind = 'wrong-password' | 'same' | 'weak' | 'rate-limit' | 'network' | 'unauthorized' | 'unavailable' | 'server'

/** `kind` lets the sheet pick accurate copy. */
export class ChangePasswordError extends Error {
  kind: ChangePasswordErrorKind

  constructor(kind: ChangePasswordErrorKind) {
    super(`Changing the password failed (${kind}).`)
    this.kind = kind
  }
}

const codeOf = async (response: Response) => {
  try {
    return ((await response.json()) as { code?: unknown } | null)?.code
  } catch {
    return undefined
  }
}

/**
 * POST /users/me/password (staff only). The server answers 204; 403 `invalid_current_password` is a wrong current password and 422
 * `same_password` a new one equal to it. A simulated account is answered from the saved accounts instead.
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

  let token: string | undefined
  try {
    const supabase = await getSupabase()
    token = (await supabase.auth.getSession()).data.session?.access_token
  } catch {
    throw new ChangePasswordError('server')
  }
  if (!token) throw new ChangePasswordError('unauthorized')

  let response: Response
  try {
    response = await fetch(`${import.meta.env.VITE_API_URL}/users/me/password`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword, newPassword }),
      signal,
    })
  } catch (failure) {
    if (signal?.aborted) throw failure
    throw new ChangePasswordError('network')
  }
  if (response.ok) return
  if (response.status === 400) throw new ChangePasswordError('weak')
  if (response.status === 401) throw new ChangePasswordError('unauthorized')
  if (response.status === 403 && (await codeOf(response)) === 'invalid_current_password') throw new ChangePasswordError('wrong-password')
  if (response.status === 422) throw new ChangePasswordError((await codeOf(response)) === 'same_password' ? 'same' : 'weak')
  if (response.status === 429) throw new ChangePasswordError('rate-limit')
  if (response.status === 502 || response.status === 503) throw new ChangePasswordError('unavailable')
  throw new ChangePasswordError('server')
}
