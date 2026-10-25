import { toMe, type Me } from './fetchMe'
import type { RequestOptions } from './simulateRequest'
import { getSupabase } from './supabase'

/** Only the fields to change. A null clears the field on the server. */
export interface MePatch {
  firstName?: string
  middleName?: string | null
  lastName?: string
  suffix?: string | null
  birthday?: string | null
  gender?: Me['gender']
  avatarUrl?: string | null
}

export type UpdateMeErrorKind = 'unauthorized' | 'invalid' | 'not-found' | 'rate-limit' | 'network' | 'server'

// Lets the form pick accurate copy; 'unauthorized' means there is no valid Supabase session.
export class UpdateMeError extends Error {
  kind: UpdateMeErrorKind
  /** What the server said was wrong, when it said (the Nest validation message on a 400). */
  detail?: string

  constructor(kind: UpdateMeErrorKind, detail?: string) {
    super(`Updating the profile failed (${kind}).`)
    this.kind = kind
    this.detail = detail
  }
}

const STATUS_KIND: Record<number, UpdateMeErrorKind> = { 400: 'invalid', 401: 'unauthorized', 404: 'not-found', 422: 'invalid', 429: 'rate-limit' }

/** The server's own message (Nest sends a string or a list of them), or undefined when the body is not that. */
async function errorDetail(response: Response): Promise<string | undefined> {
  try {
    const { message } = (await response.json()) as { message?: unknown }
    const text = Array.isArray(message) ? message.filter((m) => typeof m === 'string').join('; ') : message
    return typeof text === 'string' && text ? text.slice(0, 300) : undefined
  } catch {
    return undefined
  }
}

/** PATCH /users/me with the Supabase access token. Returns the saved profile. An abort rejects with the AbortError itself. */
export async function updateMe(patch: MePatch, { signal }: RequestOptions = {}): Promise<Me> {
  let token: string | undefined
  try {
    const supabase = await getSupabase()
    token = (await supabase.auth.getSession()).data.session?.access_token
  } catch {
    throw new UpdateMeError('server')
  }
  signal?.throwIfAborted()
  if (!token) throw new UpdateMeError('unauthorized')

  let response: Response
  try {
    response = await fetch(`${import.meta.env.VITE_API_URL}/users/me`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
      signal,
    })
  } catch (failure) {
    if (signal?.aborted) throw failure
    throw new UpdateMeError('network')
  }
  if (!response.ok) {
    const kind = STATUS_KIND[response.status] ?? 'server'
    throw new UpdateMeError(kind, kind === 'invalid' ? await errorDetail(response) : undefined)
  }
  let body: Partial<Me> | null
  try {
    body = await response.json()
  } catch {
    throw new UpdateMeError('server')
  }
  const me = toMe(body)
  if (!me) throw new UpdateMeError('server')
  return me
}
