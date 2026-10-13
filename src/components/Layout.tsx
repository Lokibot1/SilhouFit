import { useEffect } from 'react'
import { MotionConfig, motion } from 'motion/react'
import { Navigate, Outlet, useLocation, useNavigationType } from 'react-router-dom'
import { CookieConsentBanner } from './CookieConsentBanner'
import { Footer } from './Footer'
import { Navbar } from './Navbar'
import { ShopNavbar } from './ShopNavbar'
import { SiteSky } from './Sky'
import { SkipLink } from './SkipLink'
import { ToastProvider } from './toast/ToastProvider'
import { DURATION, EASE_OUT } from '../motion/tokens'
import { isAuthPath } from '../utils/authRoutes'

// Sections moved to /about; old anchors still land on them.
const MOVED_TO_ABOUT = ['#capabilities', '#how-it-works', '#boutiques']

// Pages in the shopping flow share one bar (cart, account, theme; search on /shop only).
const SHOP_BAR = ['/shop', '/wishlist', '/cart', '/checkout', '/checkout/success', '/profile']

// The cart and wishlist are working lists, so they end without the site footer.
const NO_FOOTER = ['/wishlist', '/cart']

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
    <ToastProvider>
      <div className="min-h-svh text-fg">
        <SiteSky />
        <SkipLink />
        {!bare && (SHOP_BAR.includes(pathname.replace(/\/$/, '')) ? <ShopNavbar /> : <Navbar />)}
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
        {!bare && !isAuthPath(pathname) && !NO_FOOTER.includes(pathname.replace(/\/$/, '')) && <Footer />}
        <CookieConsentBanner />
      </div>
    </ToastProvider>
  )
}
