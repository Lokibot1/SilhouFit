import { Capacitor } from '@capacitor/core'
import type { SignUpPayload } from '../utils/signUpValidation'
import type { RequestOptions } from './simulateRequest'
import { getSupabase } from './supabase'

export type SignUpErrorKind = 'network' | 'rate-limit' | 'weak-password' | 'invalid-email' | 'signup-disabled' | 'server'

// Lets the form pick accurate copy; anything that is not a SignUpError reads as 'server'.
export class SignUpError extends Error {
  kind: SignUpErrorKind

  constructor(kind: SignUpErrorKind) {
    super(`Sign-up failed (${kind}).`)
    this.kind = kind
  }
}

// Returned instead of a success only when email confirmation is off, which would reveal a registered email.
const EXISTING_CODES = ['user_already_exists', 'email_exists']
const INVALID_EMAIL_CODES = ['email_address_invalid', 'email_address_not_authorized', 'validation_failed']
const DISABLED_CODES = ['signup_disabled', 'email_provider_disabled']

function toSignUpError({ status, code }: { status?: number; code?: string }) {
  if (status === 429) return new SignUpError('rate-limit')
  // Status 0 is supabase-js's fetch failure.
  if (status === 0) return new SignUpError('network')
  if (code === 'weak_password') return new SignUpError('weak-password')
  if (code && INVALID_EMAIL_CODES.includes(code)) return new SignUpError('invalid-email')
  if (code && DISABLED_CODES.includes(code)) return new SignUpError('signup-disabled')
  return new SignUpError('server')
}

// Creates the Supabase Auth user. The project requires email confirmation, so no session comes back and nobody is signed in.
export async function submitSignUp(
  { firstName, middleName, lastName, suffix, email, password }: SignUpPayload,
  { signal }: RequestOptions = {},
): Promise<{ ok: true }> {
  const supabase = await getSupabase()
  let error
  // The native webview's own origin is not a link an email can open.
  const siteUrl = (Capacitor.isNativePlatform() && import.meta.env.VITE_SITE_URL) || window.location.origin
  try {
    const result = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          first_name: firstName,
          middle_name: middleName,
          last_name: lastName,
          suffix,
          full_name: [firstName, middleName, lastName, suffix].filter(Boolean).join(' '),
        },
        emailRedirectTo: `${siteUrl}/login`,
      },
    })
    error = result.error
  } catch (failure) {
    signal?.throwIfAborted()
    throw new SignUpError(failure instanceof TypeError ? 'network' : 'server')
  }
  // supabase-js cannot be aborted, so check once it settles.
  signal?.throwIfAborted()
  // An already-registered email comes back as an obfuscated user with no error; it reads as success so emails are never revealed.
  if (error && !(error.code && EXISTING_CODES.includes(error.code))) throw toSignUpError(error)
  return { ok: true }
}
