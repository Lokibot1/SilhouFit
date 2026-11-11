import { useEffect, useRef } from 'react'
import { MotionConfig, motion } from 'motion/react'
import { Navigate, Outlet, useLocation, useNavigationType } from 'react-router-dom'
import { ChatDock } from './chat/dock/ChatDock'
import { CookieConsentBanner } from './CookieConsentBanner'
import './landing-v2/landing-v2.css'
import { SiteFooter } from './landing-v2/SiteFooter'
import { SiteHeader } from './landing-v2/SiteHeader'
import { OnboardingGate } from './onboarding/OnboardingGate'
import { SkipLink } from './SkipLink'
import { useToast } from './toast/useToast'
import { pageKeyFor } from '../config/pagePermissions'
import { useCurrentUser } from '../hooks/useCurrentUser'
import { useCanView } from '../hooks/usePermissions'
import { DURATION, EASE_OUT } from '../motion/tokens'
import { isAuthPath } from '../utils/authRoutes'

// Sections moved to /about; old anchors still land on them.
const MOVED_TO_ABOUT = ['#capabilities', '#how-it-works', '#boutiques']

// The cart, wishlist, checkout and profile are working pages, so they end without the site footer.
const NO_FOOTER = ['/wishlist', '/cart', '/checkout', '/messages', '/profile', '/orders']

// Full-screen flows: no top bar or footer. Kept inside the main Layout so toasts and the tour carry across the exit.
const BARE_PATHS = ['/profile/measurements']

const SETTLE_MS = 2000

/** Scrolls to the section now and re-aligns it whenever the page height changes, for a short window. Any user scroll input ends it. Returns the cleanup. */
function holdOnSection(id: string) {
  let released = false
  const align = () => {
    if (!released) document.getElementById(id)?.scrollIntoView({ behavior: 'instant', block: 'start' })
  }
  align()
  const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(align)
  resize?.observe(document.body)
  void document.fonts?.ready.then(align)
  const events = ['wheel', 'touchstart', 'pointerdown', 'keydown'] as const
  const release = () => {
    released = true
    resize?.disconnect()
    window.clearTimeout(timer)
    events.forEach((name) => window.removeEventListener(name, release))
  }
  const timer = window.setTimeout(release, SETTLE_MS)
  events.forEach((name) => window.addEventListener(name, release, { passive: true }))
  return release
}

export function Layout({ bare: bareProp = false }: { bare?: boolean }) {
  const { pathname, hash, key } = useLocation()
  const headerRef = useRef<HTMLElement>(null)
  const previousPath = useRef(pathname)
  const bare = bareProp || BARE_PATHS.includes(pathname.replace(/\/$/, ''))
  const navigationType = useNavigationType()
  const toast = useToast()
  const canView = useCanView(useCurrentUser()?.role)
  // A superadmin turned this storefront page off for customers (and visitors who are not signed in).
  const blocked = !canView(pageKeyFor(pathname))

  useEffect(() => {
    if (blocked) toast.show({ kind: 'info', message: 'That page is not available right now.' })
  }, [blocked, pathname, toast])

  // The fixed bar wraps to two rows on the narrowest phones, taller than the top padding the pages reserve for it.
  // Publish the overshoot so <main> can pad it away and nothing slides under the bar.
  useEffect(() => {
    const header = headerRef.current
    if (!header) {
      document.documentElement.style.removeProperty('--site-header-extra')
      return
    }
    const measure = () => {
      const extra = Math.max(0, header.offsetHeight - parseFloat(getComputedStyle(header).minHeight))
      document.documentElement.style.setProperty('--site-header-extra', `${extra}px`)
    }
    measure()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    observer?.observe(header)
    return () => {
      observer?.disconnect()
      document.documentElement.style.removeProperty('--site-header-extra')
    }
  }, [bare, pathname])

  useEffect(() => {
    const crossPage = previousPath.current !== pathname
    previousPath.current = pathname
    if (hash) {
      // getElementById: a hand-typed hash such as "#1 2" is an invalid selector.
      const id = decodeURIComponent(hash.slice(1))
      const target = document.getElementById(id)
      if (target && !crossPage) {
        const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
        target.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' })
        return
      }
      // Arriving from another page (a footer link to /#section): the lazy page may not have rendered its sections yet,
      // and what has rendered is still growing (images, fonts, reveals). Wait for the section, then keep it
      // under the bar until the layout settles or the visitor scrolls.
      let releaseSettle: (() => void) | undefined
      const settle = () => (releaseSettle = holdOnSection(id))
      let observer: MutationObserver | undefined
      let stop: number | undefined
      if (target) {
        settle()
      } else {
        observer = new MutationObserver(() => {
          if (!document.getElementById(id)) return
          observer?.disconnect()
          settle()
        })
        observer.observe(document.body, { childList: true, subtree: true })
        stop = window.setTimeout(() => observer?.disconnect(), 5000)
      }
      return () => {
        observer?.disconnect()
        window.clearTimeout(stop)
        releaseSettle?.()
      }
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
      {/* Fixed KRAL ground: flat Paper/Obsidian plus grain. Covers the body's --canvas colour behind it. */}
      <div aria-hidden="true" className="pointer-events-none fixed inset-x-0 top-0 -z-10 h-lvh bg-kral-bg">
        <div className="kral-grain absolute inset-0 opacity-[0.05] dark:opacity-[0.03] dark:invert" />
      </div>
      <SkipLink tone="kral" />
      {!bare && (
        <div className="sv2 sv2--themed">
          <SiteHeader ref={headerRef} />
        </div>
      )}
      {/* tabIndex -1: the skip link focuses it. Not a tab stop, so no ring is needed on it. */}
      <main id="main-content" tabIndex={-1} className="outline-none" style={{ paddingTop: 'var(--site-header-extra, 0px)' }}>
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
      {!bare && !isAuthPath(pathname) && !NO_FOOTER.includes(pathname.replace(/\/$/, '')) && !pathname.startsWith('/shop/') && !pathname.startsWith('/messages/') && !pathname.startsWith('/orders/') && (
        <div className="sv2 sv2--themed">
          <SiteFooter />
        </div>
      )}
      <CookieConsentBanner />
      <OnboardingGate />
      {/* The landing page is bare, but still carries the Help chat. */}
      {(!bare || pathname === '/') && <ChatDock />}
    </div>
  )
}
