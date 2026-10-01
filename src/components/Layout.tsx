import { useEffect } from 'react'
import { Navigate, Outlet, useLocation, useNavigationType } from 'react-router-dom'
import { CookieConsentBanner } from './CookieConsentBanner'
import { Footer } from './Footer'
import { Navbar } from './Navbar'
import { SiteSky } from './Sky'
import { SkipLink } from './SkipLink'

// Sections that moved from the landing page to /about. Bookmarks and shared
// links to the old anchors still land where the content now lives.
const MOVED_TO_ABOUT = ['#capabilities', '#how-it-works', '#boutiques']

export function Layout({ bare = false }: { bare?: boolean }) {
  const { pathname, hash, key } = useLocation()
  const navigationType = useNavigationType()

  useEffect(() => {
    if (hash) {
      // getElementById, not querySelector: a hand-typed hash such as "#1 2"
      // is an invalid selector and would throw.
      const target = document.getElementById(decodeURIComponent(hash.slice(1)))
      target?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      return
    }

    if (navigationType !== 'POP') {
      window.scrollTo(0, 0)
    }
    // `key` changes on every navigation, so choosing the same section twice
    // scrolls back to it instead of doing nothing.
  }, [pathname, hash, key, navigationType])

  if (pathname === '/' && MOVED_TO_ABOUT.includes(hash)) {
    return <Navigate to={`/about${hash}`} replace />
  }

  return (
    <div className="min-h-svh text-fg">
      <SiteSky />
      <SkipLink />
      {!bare && <Navbar />}
      <main id="main-content">
        <Outlet />
      </main>
      {!bare && <Footer />}
      <CookieConsentBanner />
    </div>
  )
}
