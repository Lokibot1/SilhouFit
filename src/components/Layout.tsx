import { useEffect } from 'react'
import { MotionConfig, motion } from 'motion/react'
import { Navigate, Outlet, useLocation, useNavigationType } from 'react-router-dom'
import { CookieConsentBanner } from './CookieConsentBanner'
import { Footer } from './Footer'
import { Navbar } from './Navbar'
import { OnboardingGate } from './onboarding/OnboardingGate'
import { ShopNavbar } from './ShopNavbar'
import { SiteSky } from './Sky'
import { SkipLink } from './SkipLink'
import { useToast } from './toast/useToast'
import { pageKeyFor } from '../config/pagePermissions'
import { useCurrentUser } from '../hooks/useCurrentUser'
import { useCanView } from '../hooks/usePermissions'
import { DURATION, EASE_OUT } from '../motion/tokens'
import { isAuthPath } from '../utils/authRoutes'

// Sections moved to /about; old anchors still land on them.
const MOVED_TO_ABOUT = ['#capabilities', '#how-it-works', '#boutiques']

// Pages in the shopping flow share one bar (cart, account, theme; search on /shop only).
const SHOP_BAR = ['/shop', '/wishlist', '/cart', '/checkout', '/checkout/success', '/profile', '/messages']

// The cart, wishlist and checkout are working pages, so they end without the site footer.
const NO_FOOTER = ['/wishlist', '/cart', '/checkout', '/messages']

// Full-screen flows: no top bar or footer. Kept inside the main Layout so toasts and the tour carry across the exit.
const BARE_PATHS = ['/profile/measurements']

export function Layout({ bare: bareProp = false }: { bare?: boolean }) {
  const { pathname, hash, key } = useLocation()
  const bare = bareProp || BARE_PATHS.includes(pathname.replace(/\/$/, ''))
  const navigationType = useNavigationType()
  const toast = useToast()
  const canView = useCanView(useCurrentUser()?.role)
  // A superadmin turned this storefront page off for customers (and visitors who are not signed in).
  const blocked = !canView(pageKeyFor(pathname))

  useEffect(() => {
    if (blocked) toast.show({ kind: 'info', message: 'That page is not available right now.' })
  }, [blocked, pathname, toast])

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

  if (blocked) return <Navigate to="/" replace />

  if (pathname === '/' && MOVED_TO_ABOUT.includes(hash)) {
    return <Navigate to={`/about${hash}`} replace />
  }

  return (
    <div className="min-h-svh text-fg">
      <SiteSky />
      <SkipLink />
      {!bare && (SHOP_BAR.includes(pathname.replace(/\/$/, '')) || pathname.startsWith('/shop/') || pathname.startsWith('/messages/') ? <ShopNavbar /> : <Navbar />)}
      <main id="main-content">
        {/* Enter-only fade and rise, keyed by route. Settles to transform: none so sticky/fixed children keep working. */}
        <MotionConfig reducedMotion="user">
          <motion.div
            key={pathname}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: DURATION.state, ease: EASE_OUT }}
          >
            <Outlet />
          </motion.div>
        </MotionConfig>
      </main>
      {!bare && !isAuthPath(pathname) && !NO_FOOTER.includes(pathname.replace(/\/$/, '')) && !pathname.startsWith('/shop/') && !pathname.startsWith('/messages/') && <Footer />}
      <CookieConsentBanner />
      <OnboardingGate />
    </div>
  )
}
