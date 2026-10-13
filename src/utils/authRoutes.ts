/** Pages for signing in or up: just the logo and theme toggle in the navbar, no footer. */
const AUTH_PATHS = ['/signup', '/login', '/forgot-password', '/auth/callback']

export function isAuthPath(pathname: string): boolean {
  return AUTH_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`))
}
