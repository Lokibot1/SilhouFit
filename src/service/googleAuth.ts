import { Capacitor } from '@capacitor/core'
import { BIRTHDAY_SCOPE } from './googleBirthday'
import { getSupabase } from './supabase'
import { safeNext } from '../utils/safeNext'

// Google sign-in and sign-up are the same call: Supabase creates the user on first use.
// Setup (Supabase dashboard): enable the Google provider under Authentication -> Providers, and add
// `http://localhost:5173/auth/callback` plus the production `<origin>/auth/callback` under
// Authentication -> URL Configuration -> Redirect URLs, or Supabase refuses the redirect. The native app also needs
// `com.silhoufit.app://auth/callback` in that list.
export const CALLBACK_PATH = '/auth/callback'
const NATIVE_REDIRECT = 'com.silhoufit.app://auth/callback'

// The safe `?next=` path waits here across the round trip to Google. A path, never a token.
const NEXT_KEY = 'silhoufit-auth-next'

export type GoogleAuthErrorKind = 'network' | 'server'

// Copy for a failure to start; the browser never left this page, so nothing was saved.
export const GOOGLE_START_ERROR: Record<GoogleAuthErrorKind, string> = {
  network:
    "We couldn't reach Google sign-in. The connection dropped before the request went through. Check your connection and try again.",
  server: "We couldn't start Google sign-in. Something went wrong on our side. Try again in a moment.",
}

export class GoogleAuthError extends Error {
  kind: GoogleAuthErrorKind

  constructor(kind: GoogleAuthErrorKind) {
    super(`Google sign-in could not start (${kind}).`)
    this.kind = kind
  }
}

export const googleErrorMessage = (failure: unknown) =>
  GOOGLE_START_ERROR[(failure as Partial<GoogleAuthError> | null)?.kind ?? 'server']

export function readStashedNext(): string | null {
  try {
    return sessionStorage.getItem(NEXT_KEY)
  } catch {
    return null
  }
}

export function clearStashedNext() {
  try {
    sessionStorage.removeItem(NEXT_KEY)
  } catch {
    // Storage blocked: nothing was stashed.
  }
}

// Redirects the browser to Google. Resolves once the redirect is under way; rejects with a GoogleAuthError.
export async function startGoogleAuth({ next }: { next: string | null }): Promise<void> {
  // Only a validated same-site path is kept. It stays out of redirectTo so Supabase's allow-list still matches.
  const safe = safeNext(next, '')
  clearStashedNext()
  if (safe) {
    try {
      sessionStorage.setItem(NEXT_KEY, safe)
    } catch {
      // Storage blocked: sign-in still works, it just lands on the profile.
    }
  }

  try {
    const supabase = await getSupabase()
    const native = Capacitor.isNativePlatform()
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: native
        ? { redirectTo: NATIVE_REDIRECT, skipBrowserRedirect: true, scopes: BIRTHDAY_SCOPE }
        : { redirectTo: `${window.location.origin}${CALLBACK_PATH}`, scopes: BIRTHDAY_SCOPE },
    })
    // Status 0 is supabase-js's fetch failure.
    if (error) throw new GoogleAuthError(error.status === 0 ? 'network' : 'server')
    // The system browser, not the webview, shows Google's page.
    if (native) await (await import('@capacitor/browser')).Browser.open({ url: data.url })
  } catch (failure) {
    clearStashedNext()
    if (failure instanceof GoogleAuthError) throw failure
    // A lazy chunk that cannot load rejects with a TypeError.
    throw new GoogleAuthError(failure instanceof TypeError ? 'network' : 'server')
  }
}
