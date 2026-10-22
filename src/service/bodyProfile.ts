import type { RequestOptions } from './simulateRequest'
import { getSupabase } from './supabase'

export type BodyModelId = 'male' | 'female'
export type BodyBuildId = 'skinny' | 'lean' | 'skinny_fat' | 'regular' | 'muscular' | 'overweight'

/** The saved body profile, as the API sends and accepts it. Lengths are cm, weight is kg; a cleared field is null. */
export interface BodyProfile {
  heightCm: number
  weightKg: number | null
  shoulderWidthCm: number | null
  chestCm: number | null
  bustCm: number | null
  torsoLengthCm: number | null
  waistCm: number | null
  hipsCm: number | null
  inseamCm: number | null
  outseamCm: number | null
  thighCm: number | null
  /** Shown to the user as "Sleeve length". */
  armLengthCm: number | null
  bodyModel: BodyModelId | null
  bodyBuild: BodyBuildId | null
}

export type BodyProfileErrorKind = 'unauthorized' | 'invalid' | 'rate-limit' | 'network' | 'server'

// Lets the caller pick accurate copy; 'unauthorized' means there is no valid Supabase session.
export class BodyProfileError extends Error {
  kind: BodyProfileErrorKind

  constructor(kind: BodyProfileErrorKind) {
    super(`The body profile request failed (${kind}).`)
    this.kind = kind
  }
}

const STATUS_KIND: Record<number, BodyProfileErrorKind> = { 400: 'invalid', 401: 'unauthorized', 422: 'invalid', 429: 'rate-limit' }
const NUMBER_KEYS = [
  'weightKg',
  'shoulderWidthCm',
  'chestCm',
  'bustCm',
  'torsoLengthCm',
  'waistCm',
  'hipsCm',
  'inseamCm',
  'outseamCm',
  'thighCm',
  'armLengthCm',
] as const

async function request(
  method: 'GET' | 'PUT' | 'PATCH',
  body: BodyProfile | { gender: BodyModelId } | undefined,
  signal?: AbortSignal,
  path = '/users/me/body-profile',
) {
  let token: string | undefined
  try {
    const supabase = await getSupabase()
    token = (await supabase.auth.getSession()).data.session?.access_token
  } catch {
    throw new BodyProfileError('server')
  }
  signal?.throwIfAborted()
  if (!token) throw new BodyProfileError('unauthorized')

  try {
    return await fetch(`${import.meta.env.VITE_API_URL}${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal,
    })
  } catch (failure) {
    if (signal?.aborted) throw failure
    throw new BodyProfileError('network')
  }
}

// A 200 with the wrong shape would otherwise show "undefined cm" or crash the page.
async function parse(response: Response): Promise<BodyProfile> {
  let raw: Record<string, unknown> | null
  try {
    raw = await response.json()
  } catch {
    throw new BodyProfileError('server')
  }
  if (typeof raw?.heightCm !== 'number') throw new BodyProfileError('server')
  const profile = { heightCm: raw.heightCm } as BodyProfile
  for (const key of NUMBER_KEYS) profile[key] = typeof raw[key] === 'number' ? raw[key] : null
  profile.bodyModel = raw.bodyModel === 'male' || raw.bodyModel === 'female' ? raw.bodyModel : null
  const builds: unknown[] = ['skinny', 'lean', 'skinny_fat', 'regular', 'muscular', 'overweight']
  profile.bodyBuild = builds.includes(raw.bodyBuild) ? (raw.bodyBuild as BodyBuildId) : null
  return profile
}

const TIMEOUT_MS = 8000
const aborted = () => new DOMException('The request was aborted.', 'AbortError')

// One GET at a time: the tour, the setup page and the profile section share a pending request instead of each sending one.
let pending: Promise<BodyProfile | null> | null = null

async function fetchProfile(): Promise<BodyProfile | null> {
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort()
      reject(new BodyProfileError('network'))
    }, TIMEOUT_MS)
  })
  const work = (async () => {
    const response = await request('GET', undefined, controller.signal)
    if (response.status === 404) return null
    if (!response.ok) throw new BodyProfileError(STATUS_KIND[response.status] ?? 'server')
    return parse(response)
  })()
  work.catch(() => {}) // once the timeout wins, a late failure of the abandoned request is not an unhandled rejection
  try {
    return await Promise.race([work, timeout])
  } finally {
    clearTimeout(timer)
  }
}

/**
 * The signed-in user's saved profile, or null when none is saved (404). A request that gets no answer in 8 seconds fails as
 * 'network'. Callers share one pending request; an abort stops that caller waiting (rejecting with the AbortError) and leaves the request running for the others.
 */
export function getBodyProfile({ signal }: RequestOptions = {}): Promise<BodyProfile | null> {
  if (signal?.aborted) return Promise.reject(aborted())
  if (!pending) {
    const started: Promise<BodyProfile | null> = fetchProfile().finally(() => {
      if (pending === started) pending = null
    })
    pending = started
  }
  const shared = pending
  if (!signal) return shared
  return new Promise((resolve, reject) => {
    signal.addEventListener('abort', () => reject(aborted()), { once: true })
    shared.then(resolve, reject)
  })
}

/** Creates or replaces the profile. Send only what the user entered; a field they cleared goes as null. */
export async function saveBodyProfile(profile: BodyProfile, { signal }: RequestOptions = {}): Promise<BodyProfile> {
  const response = await request('PUT', profile, signal)
  if (!response.ok) throw new BodyProfileError(STATUS_KIND[response.status] ?? 'server')
  const saved = await parse(response)
  pending = null // a GET still on the wire may carry the old profile
  return saved
}

/** Records the chosen body model as the account's gender, the one place the backend keeps it. */
export async function saveGender(gender: BodyModelId, { signal }: RequestOptions = {}): Promise<void> {
  const response = await request('PATCH', { gender }, signal, '/users/me')
  if (!response.ok) throw new BodyProfileError(STATUS_KIND[response.status] ?? 'server')
}
