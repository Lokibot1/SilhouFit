import { getSupabase } from './supabase'

// Whether the first-run tour was finished or skipped. The truth lives in Supabase Auth user_metadata.onboarding so it
// follows the account across devices; localStorage is a cache (and holds a save that has not reached Supabase yet).
// The cache belongs to one Supabase account id, so a deleted or different account that reuses the email never inherits it.
const KEY = 'silhoufit-onboarding'

export type OnboardingChoice = 'completed' | 'skipped'
/** 'none' is a user who has not seen the tour; 'unknown' means nobody is signed in or Supabase could not be read. */
export type OnboardingStatus = 'none' | OnboardingChoice | 'unknown'

interface Cached {
  email: string
  userId: string
  status: OnboardingChoice
  synced: boolean
}

const isChoice = (value: unknown): value is OnboardingChoice => value === 'completed' || value === 'skipped'

function readCache(email: string, userId: string): Cached | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<Cached> | null
    if (!parsed || !isChoice(parsed.status) || typeof parsed.email !== 'string') return null
    if (parsed.email.toLowerCase() !== email.toLowerCase() || parsed.userId !== userId) return null
    return { email: parsed.email, userId, status: parsed.status, synced: parsed.synced === true }
  } catch {
    return null
  }
}

function writeCache(value: Cached) {
  try {
    localStorage.setItem(KEY, JSON.stringify(value))
  } catch {
    // Storage blocked: the account copy still holds the answer.
  }
}

/** Writes the choice to the account, merging into the user's other metadata. */
async function push(email: string, userId: string, status: OnboardingChoice): Promise<boolean> {
  try {
    const supabase = await getSupabase()
    const { data: session } = await supabase.auth.getSession()
    if (!session.session) return false
    const onboarding = { status, at: new Date().toISOString() }
    const { error } = await supabase.auth.updateUser({ data: { ...session.session.user.user_metadata, onboarding } })
    if (error) return false
    writeCache({ email, userId, status, synced: true })
    return true
  } catch {
    return false
  }
}

async function sessionUserId(): Promise<string | null> {
  try {
    const supabase = await getSupabase()
    return (await supabase.auth.getSession()).data.session?.user.id ?? null
  } catch {
    return null
  }
}

/** Remembers the choice on this device first, then on the account. */
export async function saveOnboardingStatus(email: string, status: OnboardingChoice): Promise<'ok' | 'failed'> {
  const userId = await sessionUserId()
  if (!userId) return 'failed'
  writeCache({ email, userId, status, synced: false })
  return (await push(email, userId, status)) ? 'ok' : 'failed'
}

export async function getOnboardingStatus(email: string): Promise<OnboardingStatus> {
  try {
    const supabase = await getSupabase()
    const { data } = await supabase.auth.getSession()
    if (!data.session) return 'unknown'
    const userId = data.session.user.id
    const cached = readCache(email, userId)
    if (cached) {
      // A save that never reached the account is tried again; its outcome does not change the answer.
      if (!cached.synced) void push(email, userId, cached.status)
      return cached.status
    }
    const status: unknown = data.session.user.user_metadata?.onboarding?.status
    if (isChoice(status)) {
      writeCache({ email, userId, status, synced: true })
      return status
    }
    return 'none'
  } catch {
    return 'unknown'
  }
}
