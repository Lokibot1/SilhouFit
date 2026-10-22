import type { RequestOptions } from './simulateRequest'
import { getSupabase } from './supabase'

export interface SignInPayload {
  email: string
  password: string
  remember?: boolean
}

export type SignInResult = { ok: true; user: { name: string; email: string; avatarUrl?: string } } | { ok: false; reason: 'invalid' }

// Wrong password, unknown email and unconfirmed email all read the same, so the form never reveals which emails exist.
const INVALID_CODES = ['invalid_credentials', 'email_not_confirmed']

export type SignInErrorKind = 'network' | 'rate-limit' | 'profile' | 'server'

// Lets the form pick accurate copy; anything that is not a SignInError reads as 'server'.
export class SignInError extends Error {
  kind: SignInErrorKind

  constructor(kind: SignInErrorKind) {
    super(`Sign-in failed (${kind}).`)
    this.kind = kind
  }
}

interface Profile {
  email: string
  avatarUrl?: string | null
  firstName: string
  lastName: string
  fullName: string | null
}

// Signs in with Supabase Auth, then loads the profile from the API. Anything unexpected throws so the form shows its retry state.
export async function submitSignIn(
  { email, password }: SignInPayload,
  { signal }: RequestOptions = {},
): Promise<SignInResult> {
  const supabase = await getSupabase()
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) {
    // supabase-js cannot be aborted, so check once it settles.
    signal?.throwIfAborted()
    if (error.code && INVALID_CODES.includes(error.code)) return { ok: false, reason: 'invalid' }
    // Status 0 is supabase-js's fetch failure.
    throw new SignInError(error.status === 429 ? 'rate-limit' : error.status === 0 ? 'network' : 'server')
  }

  try {
    signal?.throwIfAborted()
    const response = await fetch(`${import.meta.env.VITE_API_URL}/users/me`, {
      headers: { Authorization: `Bearer ${data.session.access_token}` },
      signal,
    })
    if (!response.ok) throw new SignInError(response.status === 429 ? 'rate-limit' : 'profile')
    const profile = (await response.json()) as Profile
    return {
      ok: true,
      user: {
        name: profile.fullName ?? `${profile.firstName} ${profile.lastName}`,
        email: profile.email,
        avatarUrl: profile.avatarUrl ?? undefined,
      },
    }
  } catch (failure) {
    // No half sign-in: Supabase must not keep a session the app never got.
    try {
      await supabase.auth.signOut()
    } catch {
      // Best effort; the original failure is the one to report.
    }
    if (failure instanceof SignInError || signal?.aborted) throw failure
    throw new SignInError(failure instanceof TypeError ? 'network' : 'profile')
  }
}
