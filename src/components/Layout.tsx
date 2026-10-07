import { useEffect } from 'react'
import { Navigate, Outlet, useLocation, useNavigationType } from 'react-router-dom'
import { CookieConsentBanner } from './CookieConsentBanner'
import { Footer } from './Footer'
import { Navbar } from './Navbar'
import { SiteSky } from './Sky'
import { SkipLink } from './SkipLink'

// Sections moved to /about; old anchors still land on them.
const MOVED_TO_ABOUT = ['#capabilities', '#how-it-works', '#boutiques']

export function Layout({ bare = false }: { bare?: boolean }) {
  const { pathname, hash, key } = useLocation()
  const navigationType = useNavigationType()

  useEffect(() => {
    if (hash) {
      // getElementById: a hand-typed hash such as "#1 2" is an invalid selector.
      const target = document.getElementById(decodeURIComponent(hash.slice(1)))
      target?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      return
    }

    if (navigationType !== 'POP') {
      window.scrollTo(0, 0)
    }
    // `key` changes per navigation, so choosing the same section twice rescrolls.
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
