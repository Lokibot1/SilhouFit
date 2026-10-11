const MAX_LENGTH = 2000

/** A path on this site: one leading slash, never `//host` or `/\host`. */
const isLocalPath = (path: string) => path.startsWith('/') && !path.startsWith('//') && !path.startsWith('/\\')

/**
 * The page to return to after signing in (`/login?next=...`). Only a same-origin relative path is accepted;
 * anything else (another site, `//host`, `/\host`, `javascript:`, an absurdly long value) falls back, so the
 * redirect cannot be abused.
 */
export function safeNext(raw: string | null, fallback = '/shop'): string {
  if (!raw || raw.length > MAX_LENGTH || !isLocalPath(raw)) return fallback
  try {
    const url = new URL(raw, window.location.origin)
    if (url.origin !== window.location.origin) return fallback
    // Normalising can turn `/..//evil.com` into `//evil.com`, so the result is checked again, not just the input.
    const path = url.pathname + url.search + url.hash
    return isLocalPath(path) ? path : fallback
  } catch {
    return fallback
  }
}

/** `?next=<encoded>` to carry an already-safe return path along, or '' when there is none. */
export function nextQuery(raw: string | null): string {
  const next = safeNext(raw, '')
  return next ? `?next=${encodeURIComponent(next)}` : ''
}
