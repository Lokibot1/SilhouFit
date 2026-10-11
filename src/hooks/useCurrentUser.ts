import { useSyncExternalStore } from 'react'
import { getSession, subscribe } from '../service/session'

export interface CurrentUser {
  name: string
  email?: string
  avatarUrl?: string
}

// The signed-in user from the session store (service/session.ts), or null. Swap the store for the real /me call later.
export function useCurrentUser(): CurrentUser | null {
  return useSyncExternalStore(subscribe, getSession)
}
