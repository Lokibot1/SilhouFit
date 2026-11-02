import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useTheme } from '../contexts/ThemeContext'
import { useCartCount } from '../hooks/useCart'
import { useCurrentUser } from '../hooks/useCurrentUser'
import { useShopSearch } from '../hooks/useShopSearch'
import { useSavedIds } from '../hooks/useWishlist'
import { CartIcon, HeartIcon, SearchIcon, UserIcon, XIcon } from './form/icons'
import { SilhouetteMark } from './landing/SilhouetteMark'
import { ThemeToggle } from './ThemeToggle'
import { AccountMenu } from './AccountMenu'
import { VisitWebsiteLink } from './VisitWebsiteLink'
import { Tooltip } from './ui/Tooltip'

const ICON_BUTTON =
  'relative flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-xl text-fg hover:bg-fg/10 aria-pressed:bg-fg/10'

const isMac = typeof navigator !== 'undefined' && /mac|iphone|ipad/i.test(navigator.platform)

function Badge({ count }: { count: number }) {
  if (count === 0) return null
  return (
    <span
      aria-hidden="true"
      className="font-ui absolute top-0.5 right-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-fg px-1 text-xs font-semibold text-canvas tabular-nums"
    >
      {count}
    </span>
  )
}

/** The navbar on /shop: the lockup, the shop search, wishlist, cart, account and the theme toggle. */
export function ShopNavbar() {
  const [search, setSearch] = useShopSearch()
  const savedCount = useSavedIds()?.length ?? null // null until the catalogue is known
  const cartCount = useCartCount()
  const user = useCurrentUser()
  const { pathname, search: query } = useLocation()
  const { theme } = useTheme()
  const [searchOpen, setSearchOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const searchToggleRef = useRef<HTMLButtonElement>(null)
  // The search belongs to the shop page; on the wishlist, cart and checkout the same bar keeps cart, account and theme.
  const onShop = pathname.replace(/\/$/, '') === '/shop'
  const onWishlist = pathname.replace(/\/$/, '') === '/wishlist'
  const onCart = pathname.replace(/\/$/, '') === '/cart'

  // Below lg the search is a row that opens on demand.
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

  const lockup = (
    <>
      <SilhouetteMark className="h-8 w-6 text-fg" />
      <span className="leading-none">
        <span className="font-display block text-lg font-bold tracking-[-0.02em] text-fg max-[359px]:sr-only">
          SilhouFit
        </span>
        <span className="font-ui hidden text-xs tracking-[0.22em] text-fg-muted uppercase transition-colors group-hover:text-chrome-strong sm:block lg:hidden xl:block">
          Omnichannel apparel
        </span>
      </span>
    </>
  )

  return (
    <header className="fixed inset-x-0 top-0 z-50 pt-[env(safe-area-inset-top)] border-b border-line bg-canvas/85 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center 2xl:max-w-[88rem] gap-x-1 px-3 py-2 sm:px-6 lg:gap-x-4">
        {user ? (
          <div className="flex items-center gap-2 sm:gap-3">{lockup}</div>
        ) : (
          <Link to="/" className="tap group flex items-center gap-2 sm:gap-3">
            {lockup}
          </Link>
        )}

        {onShop && (
        <div
          role="search"
          data-tour="shop-search"
          className={`${searchOpen ? 'block' : 'hidden'} order-last w-full basis-full pb-2 lg:order-none lg:mx-auto lg:block lg:max-w-md lg:min-w-48 lg:flex-1 lg:basis-0 lg:pb-0`}
        >
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-fg-muted" />
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
              className="font-ui min-h-11 w-full rounded-xl border border-line-strong bg-canvas pr-4 pl-10 text-base text-fg placeholder:text-fg-muted lg:pr-20"
            />
            <kbd
              aria-hidden="true"
              className="font-ui pointer-events-none absolute top-1/2 right-3 hidden -translate-y-1/2 rounded-xl border border-line-strong px-1.5 text-xs text-fg-muted lg:block"
            >
              {isMac ? '⌘K' : 'Ctrl K'}
            </kbd>
          </div>
        </div>
        )}

        <div className={`ml-auto flex items-center ${onShop ? 'lg:ml-0' : ''}`}>
          {onShop && (
          <Tooltip label={searchOpen ? 'Close search' : 'Open search'}>
            <button
              ref={searchToggleRef}
              type="button"
              data-tour="shop-search-toggle"
              aria-expanded={searchOpen}
              aria-label={searchOpen ? 'Close search' : 'Open search'}
              onClick={() => setSearchOpen((open) => !open)}
              className={`${ICON_BUTTON} lg:hidden`}
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
              className={`${ICON_BUTTON} ${onWishlist ? 'bg-fg/10' : ''}`}
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
              className={`${ICON_BUTTON} ${onCart ? 'bg-fg/10' : ''}`}
            >
              <CartIcon />
              <Badge count={cartCount} />
            </Link>
          </Tooltip>
          {user ? (
            <>
              <VisitWebsiteLink />
              <AccountMenu user={user} />
            </>
          ) : (
            <Tooltip label="Sign in">
              <Link id="shop-sign-in" to={`/login?next=${encodeURIComponent(pathname + query)}`} aria-label="Sign in" className={ICON_BUTTON}>
                <UserIcon />
              </Link>
            </Tooltip>
          )}
          <div className="ml-1">
            <Tooltip label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}>
              <ThemeToggle nativeTitle={false} />
            </Tooltip>
          </div>
        </div>
      </div>
    </header>
  )
}
