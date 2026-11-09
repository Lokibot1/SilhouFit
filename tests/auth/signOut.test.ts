import { beforeEach, describe, expect, it, vi } from 'vitest'

const signOutSupabase = vi.fn()
vi.mock('../../src/service/supabase', () => ({
  getSupabase: async () => ({ auth: { signOut: signOutSupabase } }),
}))

const { signOut } = await import('../../src/service/signOut')
const { readStashedNext } = await import('../../src/service/googleAuth')
const { getSession, setSession } = await import('../../src/service/session')
const { getCachedOrders, loadAllOrders } = await import('../../src/service/ordersApi')

beforeEach(() => {
  vi.clearAllMocks()
  signOutSupabase.mockResolvedValue({ error: null })
})

describe('signOut', () => {
  it('ends the Supabase and app sessions and drops a pending Google next path', async () => {
    setSession({ name: 'Demo Shopper', email: 'demo@silhoufit.com' })
    sessionStorage.setItem('silhoufit-auth-next', '/checkout')
    signOut()
    await vi.waitFor(() => expect(signOutSupabase).toHaveBeenCalledTimes(1))
    expect(getSession()).toBeNull()
    expect(readStashedNext()).toBeNull()
  })

  it('forgets the orders read for the account, so the next one never sees them', async () => {
    setSession({ name: 'Staff', email: 'staff@example.com', role: 'admin', simulated: true })
    await loadAllOrders({ delayMs: 0 } as never)
    expect(getCachedOrders()).not.toBeNull()
    signOut()
    expect(getCachedOrders()).toBeNull()
  })
})
