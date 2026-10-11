export interface CurrentUser {
  name: string
  avatarUrl?: string
}

// Seam for auth: there is no login yet, so nobody is signed in. Return the session user here once the
// backend exists; the shop navbar already renders an avatar for it.
export function useCurrentUser(): CurrentUser | null {
  return null
}
