import { useEffect, useRef, useState, type MouseEvent, type ReactNode, type Ref } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useTheme } from '../../contexts/ThemeContext'
import { useCartCount } from '../../hooks/useCart'
import { useCurrentUser, type CurrentUser } from '../../hooks/useCurrentUser'
import { useShopSearch } from '../../hooks/useShopSearch'
import { useSavedIds } from '../../hooks/useWishlist'
import { isAuthPath } from '../../utils/authRoutes'
import { AccountLink } from '../AccountLink'
import { AccountMenu } from '../AccountMenu'
import { CustomerMessagesButton } from '../chat/dock/CustomerMessagesButton'
import { CartIcon, HeartIcon, MenuIcon, SearchIcon, UserIcon, XIcon } from '../form/icons'
import { ThemeToggle } from '../ThemeToggle'
import { homeFor, isStaffRole } from '../../utils/staffRole'
import { KRAL_ICON_BUTTON, KRAL_ICON_COUNT } from '../ui/kralIconButton'
import { Tooltip } from '../ui/Tooltip'
import { VisitWebsiteLink } from '../VisitWebsiteLink'
import { Logo } from './Logo'

const LINKS = [
  { label: 'Shop', to: '/shop' },
  { label: 'About', to: '/about' },
  { label: 'Contact us', to: '/contact' },
]

// Pages in the shopping flow share one bar (cart, account, theme; search on /shop only).
const SHOP_BAR = ['/shop', '/wishlist', '/cart', '/checkout', '/checkout/success', '/profile', '/messages', '/orders']

const trim = (pathname: string) => pathname.replace(/\/$/, '')

const isMac = typeof navigator !== 'undefined' && /mac|iphone|ipad/i.test(navigator.platform)

function isShopBar(pathname: string) {
  return SHOP_BAR.includes(trim(pathname)) || pathname.startsWith('/shop/') || pathname.startsWith('/messages/') || pathname.startsWith('/orders/')
}

// A corner badge, shown only when there is something to count (cart, wishlist and messages alike).
function Badge({ count }: { count: number }) {
  if (count === 0) return null
  return (
    <span aria-hidden="true" className={KRAL_ICON_COUNT}>
      {count > 99 ? '99+' : count}
    </span>
  )
}

function ThemeButton() {
  const { theme } = useTheme()
  return (
    <Tooltip label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}>
      {/* The sky switch is 20px tall; the wrapper gives it the 44px row of its neighbours and a little air. */}
      <span className="flex h-11 shrink-0 items-center px-1 sm:px-2">
        <ThemeToggle nativeTitle={false} />
      </span>
    </Tooltip>
  )
}

/** The shop bar's search, wishlist, cart, messages, account and theme. Search belongs to /shop; below lg it opens as a row under the bar. */
function ShopControls({ user, logo }: { user: CurrentUser | null; logo: ReactNode }) {
  const [search, setSearch] = useShopSearch()
  const savedCount = useSavedIds()?.length ?? null // null until the catalogue is known
  const cartCount = useCartCount()
  const { pathname, search: query } = useLocation()
  const [searchOpen, setSearchOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const searchToggleRef = useRef<HTMLButtonElement>(null)
  const onShop = trim(pathname) === '/shop'
  const onWishlist = trim(pathname) === '/wishlist'
  const onCart = trim(pathname) === '/cart'

  useEffect(() => {
    if (searchOpen) inputRef.current?.focus()
  }, [searchOpen])

  // Ctrl/Cmd+K focuses the search, unless the keys are going into another field.
  useEffect(() => {
    if (!onShop) return
    function onKeyDown(event: KeyboardEvent) {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'k') return
      const target = event.target as HTMLElement
      const typingElsewhere =
        target !== inputRef.current && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))
      // An open dialog (the filter panel) keeps its own focus.
      if (typingElsewhere || target.closest('[role="dialog"]')) return
      event.preventDefault()
      setSearchOpen(true)
      inputRef.current?.focus()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onShop])

  return (
    <>
      {logo}
      {onShop && (
        <div
          role="search"
          data-tour="shop-search"
          className={`${searchOpen ? 'block' : 'hidden'} absolute inset-x-0 top-full border-b border-kral-rule bg-kral-bg px-4 py-2 sm:px-6 lg:static lg:mx-auto lg:block lg:max-w-md lg:min-w-48 lg:flex-1 lg:border-0 lg:bg-transparent lg:p-0`}
        >
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-kral-muted" />
            <input
              ref={inputRef}
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== 'Escape') return
                // Not the native clear: keep the text and q, just fold the row away.
                event.preventDefault()
                setSearchOpen(false)
                searchToggleRef.current?.focus()
              }}
              aria-label="Search the catalogue"
              placeholder="Search the catalogue"
              autoComplete="off"
              className="font-kral-mono kral-focus min-h-11 w-full rounded-xl border border-kral-rule bg-kral-bg pr-4 pl-10 text-base text-kral-fg placeholder:text-kral-muted lg:pr-20"
            />
            <kbd
              aria-hidden="true"
              className="font-kral-mono pointer-events-none absolute top-1/2 right-3 hidden -translate-y-1/2 rounded-md border border-kral-rule px-1.5 text-xs text-kral-muted lg:block"
            >
              {isMac ? '⌘K' : 'Ctrl K'}
            </kbd>
          </div>
        </div>
      )}

      <div className="sv2-controls flex items-center">
        {onShop && (
          <Tooltip label={searchOpen ? 'Close search' : 'Open search'}>
            <button
              ref={searchToggleRef}
              type="button"
              data-tour="shop-search-toggle"
              aria-expanded={searchOpen}
              aria-label={searchOpen ? 'Close search' : 'Open search'}
              onClick={() => setSearchOpen((open) => !open)}
              className={`${KRAL_ICON_BUTTON} lg:hidden`}
            >
              {searchOpen ? <XIcon /> : <SearchIcon />}
            </button>
          </Tooltip>
        )}
        <Tooltip label={savedCount === null ? 'Wishlist' : `Wishlist (${savedCount} saved)`}>
          <Link
            to="/wishlist"
            aria-current={onWishlist ? 'page' : undefined}
            aria-label={savedCount === null ? 'Wishlist' : `Wishlist, ${savedCount} saved`}
            className={KRAL_ICON_BUTTON}
          >
            <HeartIcon filled={onWishlist} />
            <Badge count={savedCount ?? 0} />
          </Link>
        </Tooltip>
        <Tooltip label={`Cart (${cartCount} ${cartCount === 1 ? 'item' : 'items'})`}>
          <Link
            to="/cart"
            data-tour="cart"
            aria-current={onCart ? 'page' : undefined}
            aria-label={`Cart, ${cartCount} ${cartCount === 1 ? 'item' : 'items'}`}
            className={KRAL_ICON_BUTTON}
          >
            <CartIcon />
            <Badge count={cartCount} />
          </Link>
        </Tooltip>
        {user && (!user.role || user.role === 'customer') && <CustomerMessagesButton />}
        {user ? (
          <>
            <VisitWebsiteLink tone="kral" />
            <AccountMenu user={user} tone="kral" />
          </>
        ) : (
          <Tooltip label="Sign in">
            <Link id="shop-sign-in" to={`/login?next=${encodeURIComponent(pathname + query)}`} aria-label="Sign in" className={KRAL_ICON_BUTTON}>
              <UserIcon />
            </Link>
          </Tooltip>
        )}
        <ThemeButton />
      </div>
    </>
  )
}

/**
 * The one site header. On the landing page (`landing`) it is the sticky bar over the hero: tagline, the theme toggle and a profile icon to sign in.
 * Everywhere else it is a fixed bar that follows the app theme (Paper in light, Obsidian in dark) whose content follows the route and the session: the page links with the
 * current one marked, Login and Sign up or the account for the public pages, the shop controls in the shopping flow.
 * Login and sign up carry their own logo beside the form, so there it is only the theme toggle.
 */
export function SiteHeader({
  ref,
  landing = false,
  onLogoClick,
}: {
  ref?: Ref<HTMLElement>
  landing?: boolean
  onLogoClick?: (event: MouseEvent<HTMLAnchorElement>) => void
}) {
  const { pathname } = useLocation()
  const user = useCurrentUser()
  const cartCount = useCartCount()
  const [open, setOpen] = useState(false)
  const navRef = useRef<HTMLElement>(null)
  const menuRef = useRef<HTMLButtonElement>(null)
  const shop = !landing && isShopBar(pathname)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setOpen(false)
      menuRef.current?.focus()
    }
    const onDown = (e: PointerEvent) => {
      if (!navRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onDown)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onDown)
    }
  }, [open])

  if (!landing && isAuthPath(pathname)) {
    // Login and sign up keep the logo in the top-right corner, so the toggle sits bottom-right there instead.
    // auth-toggle-slot: AuthSplit hides it on the pages without a photo, which are always dark.
    const corner = ['/login', '/signup'].includes(trim(pathname))
    return (
      <div className={`auth-toggle-slot fixed z-50 ${corner ? 'right-4 bottom-[calc(max(1rem,env(safe-area-inset-bottom))+var(--cookie-banner-h,0px))]' : 'top-[max(0.5rem,env(safe-area-inset-top))] right-2 sm:right-3'}`}>
        <ThemeButton />
      </div>
    )
  }

  const rise = (n: number) => (landing ? { 'data-rise': n } : {})
  const logo = (
    <Link to="/" className="sv2-logo" aria-label="KRAL home" onClick={onLogoClick} {...rise(0)}>
      <Logo className="sv2-logo-mark" />
    </Link>
  )

  return (
    <header ref={ref} className={`sv2-header${landing ? '' : ' sv2-header--fixed'}${shop ? ' sv2-header--shop' : ''}`}>
      <div className="sv2-bar">
        {shop ? (
          <ShopControls user={user} logo={logo} />
        ) : (
          <>
            {logo}
            <nav ref={navRef} className="sv2-nav" aria-label="Primary" {...rise(0)}>
              <Tooltip label="Menu">
                <button
                  ref={menuRef}
                  type="button"
                  className="sv2-menu-btn"
                  aria-label={cartCount ? `Menu, ${cartCount} ${cartCount === 1 ? 'item' : 'items'} in cart` : 'Menu'}
                  aria-expanded={open}
                  aria-controls="sv2-links"
                  onClick={() => setOpen((o) => !o)}
                >
                  {open ? <XIcon size={20} /> : <MenuIcon />}
                  {cartCount > 0 && !open && <span aria-hidden="true" className="sv2-menu-dot" />}
                </button>
              </Tooltip>
              <ul id="sv2-links" className="sv2-links" data-open={open || undefined} onClick={() => setOpen(false)}>
                {LINKS.map(({ label, to }) => (
                  <li key={label}>
                    <Link to={to} aria-current={pathname === to || pathname.startsWith(`${to}/`) ? 'page' : undefined}>
                      {label}
                    </Link>
                  </li>
                ))}
                {!landing && !user && (
                  <li className="sv2-links-signup">
                    <Link to="/signup">Sign Up now!</Link>
                  </li>
                )}
                {/* Below 1075px the bar keeps only the logo and this menu; the cart, account and theme live here. */}
                <li className="sv2-links-tool">
                  <Link to="/cart" aria-current={pathname === '/cart' ? 'page' : undefined}>
                    Cart{cartCount > 0 && <span className="sv2-links-count">{cartCount > 99 ? '99+' : cartCount}</span>}
                  </Link>
                </li>
                <li className="sv2-links-tool">
                  {user ? (
                    <Link to={homeFor(user.role)}>{isStaffRole(user.role) ? 'Dashboard' : 'Profile'}</Link>
                  ) : (
                    <Link to="/login">Login</Link>
                  )}
                </li>
                <li className="sv2-links-tool sv2-links-theme" onClick={(e) => e.stopPropagation()}>
                  <span>Theme</span>
                  <ThemeToggle />
                </li>
              </ul>
            </nav>
            {landing ? (
              <>
                <p className="sv2-tag" data-rise="1">
                  Because fit is what matters
                </p>
                <div className="sv2-actions">
                  <div className="sv2-theme" data-rise="3">
                    <ThemeButton />
                  </div>
                  <div className="sv2-profile" data-rise="3">
                    {user ? (
                      <AccountLink user={user} />
                    ) : (
                      <Tooltip label="Sign in">
                        <Link to="/login" aria-label="Sign in" className="sv2-profile-btn kral-focus">
                          <UserIcon />
                        </Link>
                      </Tooltip>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <div className="sv2-controls sv2-bar-tools flex items-center gap-2">
                {!user && (
                  <>
                    <Link to="/login" className="sv2-btn sv2-btn--red">
                      Login!
                    </Link>
                    <Link to="/signup" className="sv2-btn sv2-btn--line sv2-signup">
                      Sign Up now!
                    </Link>
                  </>
                )}
                <div className="flex items-center">
                  {user && <AccountLink user={user} />}
                  <ThemeButton />
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </header>
  )
}
