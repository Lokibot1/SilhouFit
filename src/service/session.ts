// The signed-in user, kept in localStorage so a reload and other tabs agree. Only { name, email, avatarUrl } is stored: never a
// token or password. supabase-js keeps its own token in localStorage; this store stays the { name, email } cache of /users/me.
const KEY = 'silhoufit-session'

export interface Session {
  name: string
  email: string
  avatarUrl?: string
}

function load(): Session | null {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? 'null')
    const user = parsed as Partial<Session> | null
    if (typeof user?.name !== 'string' || typeof user.email !== 'string') return null
    return { name: user.name, email: user.email, avatarUrl: typeof user.avatarUrl === 'string' ? user.avatarUrl : undefined }
  } catch {
    return null
  }
}

let session = load()
const listeners = new Set<() => void>()

function commit(next: Session | null) {
  session = next
  // Storage can be blocked, so the session then lives for this tab only.
  try {
    if (next) localStorage.setItem(KEY, JSON.stringify(next))
    else localStorage.removeItem(KEY)
  } catch {
    // Blocked or full: keep the in-memory session.
  }
  listeners.forEach((listener) => listener())
}

// Another tab signed in or out.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key !== KEY && event.key !== null) return
    session = load()
    listeners.forEach((listener) => listener())
  })
}

export const getSession = () => session
export const setSession = (user: Session) => commit({ name: user.name, email: user.email, avatarUrl: user.avatarUrl })
export const clearSession = () => commit(null)

export function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
