import { beforeEach, describe, expect, it, vi } from 'vitest'

const getSession = vi.fn()
const updateUser = vi.fn()
vi.mock('../../src/service/supabase', () => ({
  getSupabase: async () => ({ auth: { getSession, updateUser } }),
}))

const { getOnboardingStatus, saveOnboardingStatus } = await import('../../src/service/onboarding')

const EMAIL = 'anne@example.com'
const CACHE = 'silhoufit-onboarding'
const ID = 'user-1'
const sessionWith = (user_metadata: object, id = ID) => ({ data: { session: { user: { id, user_metadata } } } })
const cached = () => JSON.parse(localStorage.getItem(CACHE) ?? 'null')

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  updateUser.mockResolvedValue({ error: null })
})

describe('getOnboardingStatus', () => {
  it('is unknown without a Supabase session', async () => {
    getSession.mockResolvedValue({ data: { session: null } })
    expect(await getOnboardingStatus(EMAIL)).toBe('unknown')
  })

  it('is none for an account that never chose, and reads the account flag otherwise', async () => {
    getSession.mockResolvedValue(sessionWith({ name: 'Anne' }))
    expect(await getOnboardingStatus(EMAIL)).toBe('none')

    getSession.mockResolvedValue(sessionWith({ onboarding: { status: 'skipped', at: '2026-01-01T00:00:00.000Z' } }))
    expect(await getOnboardingStatus(EMAIL)).toBe('skipped')
    expect(cached()).toEqual({ email: EMAIL, userId: ID, status: 'skipped', synced: true })
  })

  it('answers from the local cache of this account', async () => {
    localStorage.setItem(CACHE, JSON.stringify({ email: 'ANNE@example.com', userId: ID, status: 'completed', synced: true }))
    getSession.mockResolvedValue(sessionWith({}))
    expect(await getOnboardingStatus(EMAIL)).toBe('completed')
  })

  it('ignores the cache of another email', async () => {
    localStorage.setItem(CACHE, JSON.stringify({ email: 'other@example.com', userId: ID, status: 'completed', synced: true }))
    getSession.mockResolvedValue(sessionWith({}))
    expect(await getOnboardingStatus(EMAIL)).toBe('none')
  })

  it('ignores a cache left by an earlier account that used the same email, such as a deleted one', async () => {
    localStorage.setItem(CACHE, JSON.stringify({ email: EMAIL, userId: 'old-account', status: 'completed', synced: true }))
    getSession.mockResolvedValue(sessionWith({}))
    expect(await getOnboardingStatus(EMAIL)).toBe('none')
  })

  it('ignores a cache from before accounts were recorded', async () => {
    localStorage.setItem(CACHE, JSON.stringify({ email: EMAIL, status: 'completed', synced: true }))
    getSession.mockResolvedValue(sessionWith({}))
    expect(await getOnboardingStatus(EMAIL)).toBe('none')
  })

  it('retries a save that never reached the account', async () => {
    localStorage.setItem(CACHE, JSON.stringify({ email: EMAIL, userId: ID, status: 'skipped', synced: false }))
    getSession.mockResolvedValue(sessionWith({ plan: 'free' }))
    expect(await getOnboardingStatus(EMAIL)).toBe('skipped')
    await vi.waitFor(() => expect(updateUser).toHaveBeenCalledTimes(1))
    await vi.waitFor(() => expect(cached().synced).toBe(true))
  })

  it('is unknown when Supabase cannot be reached', async () => {
    getSession.mockRejectedValue(new TypeError('Failed to fetch'))
    expect(await getOnboardingStatus(EMAIL)).toBe('unknown')
  })
})

describe('saveOnboardingStatus', () => {
  it('writes the cache first, then merges the choice into the other metadata', async () => {
    getSession.mockResolvedValue(sessionWith({ name: 'Anne' }))
    expect(await saveOnboardingStatus(EMAIL, 'completed')).toBe('ok')
    const { data } = updateUser.mock.calls[0][0]
    expect(data.name).toBe('Anne')
    expect(data.onboarding.status).toBe('completed')
    expect(typeof data.onboarding.at).toBe('string')
    expect(cached()).toEqual({ email: EMAIL, userId: ID, status: 'completed', synced: true })
  })

  it('fails, but keeps the choice on this device, when the account cannot be updated', async () => {
    getSession.mockResolvedValue(sessionWith({}))
    updateUser.mockResolvedValue({ error: { message: 'down' } })
    expect(await saveOnboardingStatus(EMAIL, 'skipped')).toBe('failed')
    expect(cached()).toEqual({ email: EMAIL, userId: ID, status: 'skipped', synced: false })
  })
})
