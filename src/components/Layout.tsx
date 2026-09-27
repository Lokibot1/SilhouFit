import { useEffect } from 'react'
import { Outlet, useLocation, useNavigationType } from 'react-router-dom'
import { CookieConsentBanner } from './CookieConsentBanner'
import { Footer } from './Footer'
import { Navbar } from './Navbar'
import { SkipLink } from './SkipLink'

export function Layout() {
  const { pathname, hash } = useLocation()
  const navigationType = useNavigationType()

  useEffect(() => {
    if (hash) {
      const target = document.querySelector(hash)
      target?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      return
    }

    if (navigationType !== 'POP') {
      window.scrollTo(0, 0)
    }
  }, [pathname, hash, navigationType])

  return (
    <div className="min-h-svh bg-bone text-ink dark:bg-ink dark:text-bone">
      <SkipLink />
      <Navbar />
      <main id="main-content">
        <Outlet />
      </main>
      <Footer />
      <CookieConsentBanner />
    </div>
  )
}
