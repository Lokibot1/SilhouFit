// A one-shot message for the sign-in page, set just before a sign-out that is not a plain "Signed out". In memory only: it must not survive a reload.
export type LoginNotice = 'password-changed' | 'password-reset' | 'password-expired' | 'account-archived'

let notice: LoginNotice | null = null

export const setLoginNotice = (next: LoginNotice) => {
  notice = next
}

/** Read without clearing, so the route guards and the sign-in page can all see it. */
export const peekLoginNotice = () => notice

/** Read and clear. */
export function takeLoginNotice() {
  const current = notice
  notice = null
  return current
}
