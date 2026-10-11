import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clearSession, getSession, setSession, subscribe } from '../../src/service/session'

const KEY = 'silhoufit-session'
const USER = { name: 'Demo Shopper', email: 'demo@silhoufit.com' }

function fromAnotherTab(raw: string | null) {
  if (raw === null) localStorage.removeItem(KEY)
  else localStorage.setItem(KEY, raw)
  window.dispatchEvent(new StorageEvent('storage', { key: KEY }))
}

beforeEach(() => {
  clearSession()
  vi.restoreAllMocks()
})

describe('session store', () => {
  it('stores only name and email, and clears them', () => {
    setSession({ ...USER, token: 'secret', password: 'x' } as typeof USER)
    expect(getSession()).toEqual(USER)
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual(USER)
    clearSession()
    expect(getSession()).toBeNull()
    expect(localStorage.getItem(KEY)).toBeNull()
  })

  it('notifies subscribers and stops after unsubscribe', () => {
    const listener = vi.fn()
    const stop = subscribe(listener)
    setSession(USER)
    clearSession()
    expect(listener).toHaveBeenCalledTimes(2)
    stop()
    setSession(USER)
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it('follows another tab through the storage event', () => {
    fromAnotherTab(JSON.stringify(USER))
    expect(getSession()).toEqual(USER)
    fromAnotherTab(null)
    expect(getSession()).toBeNull()
  })

  it('ignores corrupt or incomplete stored data', () => {
    fromAnotherTab('not json')
    expect(getSession()).toBeNull()
    fromAnotherTab(JSON.stringify({ name: 5 }))
    expect(getSession()).toBeNull()
  })

  it('keeps the session in memory when storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    setSession(USER)
    expect(getSession()).toEqual(USER)
  })
})
