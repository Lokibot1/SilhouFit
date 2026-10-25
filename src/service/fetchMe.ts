import type { RequestOptions } from './simulateRequest'
import { getSupabase } from './supabase'

export interface Me {
  id: string
  email: string
  role?: 'superadmin' | 'admin' | 'staff' | 'customer'
  firstName: string
  middleName: string | null
  lastName: string
  suffix: string | null
  fullName: string | null
  avatarUrl: string | null
  /** YYYY-MM-DD. */
  birthday: string | null
  gender: 'male' | 'female' | 'other' | 'unisex' | null
  createdAt: string
  updatedAt: string
}

export type MeErrorKind = 'unauthorized' | 'not-found' | 'rate-limit' | 'network' | 'server'

// Lets the page pick accurate copy; 'unauthorized' means there is no valid Supabase session.
export class MeError extends Error {
  kind: MeErrorKind

  constructor(kind: MeErrorKind) {
    super(`Loading the profile failed (${kind}).`)
    this.kind = kind
  }
}

const STATUS_KIND: Record<number, MeErrorKind> = { 401: 'unauthorized', 404: 'not-found', 429: 'rate-limit' }

const GENDERS: unknown[] = ['male', 'female', 'other', 'unisex']

/** The profile from a /users/me body, or null when it lacks what the page cannot do without. A 200 with the wrong shape would otherwise crash the page or show "undefined undefined". */
export function toMe(body: Partial<Me> | null): Me | null {
  const required = [body?.id, body?.email, body?.firstName, body?.lastName]
  if (!body || !required.every((value) => typeof value === 'string' && value)) return null
  return {
    ...body,
    birthday: typeof body.birthday === 'string' ? body.birthday : null,
    gender: GENDERS.includes(body.gender) ? body.gender! : null,
  } as Me
}

// Loads the signed-in user's profile with the Supabase access token. An abort rejects with the AbortError itself.
export async function fetchMe({ signal }: RequestOptions = {}): Promise<Me> {
  let token: string | undefined
  try {
    const supabase = await getSupabase()
    token = (await supabase.auth.getSession()).data.session?.access_token
  } catch {
    throw new MeError('server')
  }
  signal?.throwIfAborted()
  if (!token) throw new MeError('unauthorized')

  let response: Response
  try {
    response = await fetch(`${import.meta.env.VITE_API_URL}/users/me`, {
      headers: { Authorization: `Bearer ${token}` },
      signal,
    })
  } catch (failure) {
    if (signal?.aborted) throw failure
    throw new MeError('network')
  }
  if (!response.ok) throw new MeError(STATUS_KIND[response.status] ?? 'server')
  let body: Partial<Me> | null
  try {
    body = await response.json()
  } catch {
    throw new MeError('server')
  }
  const me = toMe(body)
  if (!me) throw new MeError('server')
  return me
}
