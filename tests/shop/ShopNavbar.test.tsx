import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MotionGlobalConfig } from 'motion/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { Layout } from '../../src/components/Layout'
import { ShopNavbar } from '../../src/components/ShopNavbar'
import { ToastProvider } from '../../src/components/toast/ToastProvider'
import { CookieConsentProvider } from '../../src/contexts/CookieConsentContext'
import { ThemeProvider } from '../../src/contexts/ThemeContext'
import { PRODUCTS } from '../../src/data/products'
import { useCurrentUser } from '../../src/hooks/useCurrentUser'
import { primeProductsCache, resetProductsCache } from '../../src/hooks/useProducts'
import { getSession, setSession } from '../../src/service/session'

vi.mock('../../src/hooks/useCurrentUser', () => ({ useCurrentUser: vi.fn(() => null) }))
const currentUser = vi.mocked(useCurrentUser)

const KEY = 'silhoufit-wishlist'
const CART_KEY = 'silhoufit-cart'
function syncCart(lines: { id: string; qty: number; size?: string; color?: string }[]) {
  localStorage.setItem(CART_KEY, JSON.stringify(lines))
  act(() => {
    window.dispatchEvent(new StorageEvent('storage', { key: CART_KEY }))
  })
}
const CATALOGUE = { products: PRODUCTS, syncedAt: '2026-10-10T15:05:00' }

// The store re-reads localStorage on a storage event, which is also how another tab reaches it.
function syncWishlist(ids?: string[]) {
  if (ids) localStorage.setItem(KEY, JSON.stringify(ids))
  else localStorage.clear()
  act(() => {
    window.dispatchEvent(new StorageEvent('storage', { key: ids ? KEY : null }))
  })
}

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true
  const observer = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal('IntersectionObserver', observer)
  vi.stubGlobal('ResizeObserver', observer)
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    addEventListener() {},
    removeEventListener() {},
  }))
  Element.prototype.scrollIntoView = vi.fn()
  HTMLCanvasElement.prototype.getContext = vi.fn(() => null) as never
})

beforeEach(() => {
  syncWishlist()
  syncCart([])
  resetProductsCache()
  primeProductsCache(CATALOGUE)
  currentUser.mockReturnValue(null)
})
afterEach(() => {
  vi.clearAllMocks()
  vi.restoreAllMocks()
})

function Where() {
  const { search } = useLocation()
  return <span data-testid="search">{search}</span>
}
const urlSearch = () => screen.getByTestId('search').textContent ?? ''

function renderNavbar(url = '/shop') {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <ThemeProvider>
        <ToastProvider>
          <ShopNavbar />
          <Where />
          <input aria-label="Other field" />
          <div role="dialog" aria-label="Stub dialog">
            <button type="button">Apply</button>
          </div>
        </ToastProvider>
      </ThemeProvider>
    </MemoryRouter>,
  )
}

describe('route selects the navbar', () => {
  function renderLayout(url: string) {
    return render(
      <MemoryRouter initialEntries={[url]}>
        <ThemeProvider>
          <CookieConsentProvider>
            <Routes>
              <Route element={<Layout />}>
                <Route path="shop" element={<p>shop page</p>} />
                <Route path="checkout" element={<p>checkout page</p>} />
                <Route path="checkout/success" element={<p>success page</p>} />
                <Route path="about" element={<p>about page</p>} />
              </Route>
            </Routes>
          </CookieConsentProvider>
        </ThemeProvider>
      </MemoryRouter>,
    )
  }

  it.each(['/shop', '/shop/'])('uses the shop navbar on %s', (url) => {
    renderLayout(url)
    expect(screen.getByRole('searchbox', { name: 'Search the catalogue' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Wishlist, 0 saved' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Sign Up now!' })).toBeNull()
  })

  it.each(['/checkout', '/checkout/success'])('uses the shop bar on %s, without the search', (url) => {
    renderLayout(url)
    expect(screen.getByRole('button', { name: /^Cart/ })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', `/login?next=${encodeURIComponent(url)}`)
    expect(screen.getByRole('checkbox', { name: /Switch to (dark|light) mode/ })).toBeInTheDocument()
    expect(screen.queryByRole('searchbox')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Open search' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Sign Up now!' })).toBeNull()
  })

  it('keeps the regular navbar elsewhere', () => {
    renderLayout('/about')
    expect(screen.getAllByRole('link', { name: 'Sign Up now!' }).length).toBeGreaterThan(0)
    expect(screen.queryByRole('searchbox')).toBeNull()
    expect(screen.queryByRole('link', { name: /^Wishlist/ })).toBeNull()
  })
})

describe('ShopNavbar', () => {
  it('shows the brand and the theme toggle, with no About Us or Shop links', () => {
    renderNavbar()
    expect(screen.getByRole('link', { name: /SilhouFit/ })).toHaveAttribute('href', '/')
    expect(screen.queryByRole('link', { name: 'About Us' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Shop' })).toBeNull()
    expect(screen.queryByRole('navigation', { name: 'Primary' })).toBeNull()
    expect(screen.getByRole('checkbox', { name: /Switch to (dark|light) mode/ })).toBeInTheDocument()
  })

  it('links a logged-out user icon to /login and returns to the current page afterwards', () => {
    renderNavbar()
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login?next=%2Fshop')
  })

  it('keeps the filters in the return path', () => {
    renderNavbar('/shop?category=Tops&sort=newest')
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute(
      'href',
      '/login?next=%2Fshop%3Fcategory%3DTops%26sort%3Dnewest',
    )
  })

  it('shows the user avatar with initials, inside an account button, when someone is signed in', () => {
    currentUser.mockReturnValue({ name: 'Ana Reyes' })
    renderNavbar()
    expect(screen.queryByRole('link', { name: 'Sign in' })).toBeNull()
    expect(screen.getByRole('img', { name: 'Ana Reyes' })).toHaveTextContent('AR')
    expect(screen.getByRole('button', { name: 'Account, Ana Reyes' })).toHaveAttribute('aria-expanded', 'false')
  })

  describe('account menu', () => {
    const open = async (user: ReturnType<typeof userEvent.setup>) => {
      currentUser.mockReturnValue({ name: 'Ana Reyes', email: 'ana@example.com' })
      renderNavbar()
      await user.click(screen.getByRole('button', { name: 'Account, Ana Reyes' }))
      return screen.getByRole('group', { name: 'Account' })
    }

    it('shows the name and email with a Sign out button, and moves focus into it', async () => {
      const user = userEvent.setup()
      const panel = await open(user)
      expect(panel).toHaveTextContent('Ana Reyes')
      expect(panel).toHaveTextContent('ana@example.com')
      expect(screen.getByRole('button', { name: 'Account, Ana Reyes' })).toHaveAttribute('aria-expanded', 'true')
      expect(screen.getByRole('button', { name: 'Sign out' })).toHaveFocus()
    })

    it('closes on Escape and returns focus to the avatar', async () => {
      const user = userEvent.setup()
      await open(user)
      await user.keyboard('{Escape}')
      await waitFor(() => expect(screen.queryByRole('group', { name: 'Account' })).toBeNull())
      expect(screen.getByRole('button', { name: 'Account, Ana Reyes' })).toHaveFocus()
    })

    it('closes on a click outside', async () => {
      const user = userEvent.setup()
      await open(user)
      await user.click(document.body)
      await waitFor(() => expect(screen.queryByRole('group', { name: 'Account' })).toBeNull())
    })

    it('signs out, clears the session and says so', async () => {
      setSession({ name: 'Ana Reyes', email: 'ana@example.com' })
      const user = userEvent.setup()
      await open(user)
      await user.click(screen.getByRole('button', { name: 'Sign out' }))
      expect(getSession()).toBeNull()
      expect(await screen.findByText('Signed out')).toBeInTheDocument()
      await waitFor(() => expect(screen.queryByRole('group', { name: 'Account' })).toBeNull())
    })
  })

  it('writes the debounced search to q in the URL and drops the page', async () => {
    const user = userEvent.setup()
    renderNavbar('/shop?page=2')
    await user.type(screen.getByRole('searchbox'), 'polo')
    await waitFor(() => expect(urlSearch()).toBe('?q=polo'))
  })

  it('starts from q in the URL', () => {
    renderNavbar('/shop?q=denim')
    expect(screen.getByRole('searchbox')).toHaveValue('denim')
  })

  it('focuses the search on Ctrl+K or Cmd+K, but not while typing in another field', async () => {
    const user = userEvent.setup()
    renderNavbar()
    await user.keyboard('{Control>}k{/Control}')
    expect(screen.getByRole('searchbox')).toHaveFocus()

    const other = screen.getByRole('textbox', { name: 'Other field' })
    await user.click(other)
    await user.keyboard('{Control>}k{/Control}')
    expect(other).toHaveFocus()

    ;(document.activeElement as HTMLElement).blur()
    await user.keyboard('{Meta>}k{/Meta}')
    expect(screen.getByRole('searchbox')).toHaveFocus()
  })

  it('leaves focus alone inside an open dialog, even on a button', async () => {
    const user = userEvent.setup()
    renderNavbar()
    const apply = screen.getByRole('button', { name: 'Apply' })
    apply.focus()
    await user.keyboard('{Control>}k{/Control}')
    expect(apply).toHaveFocus()
  })

  it('opens and closes the search row below the lg breakpoint', async () => {
    const user = userEvent.setup()
    renderNavbar()
    const toggle = screen.getByRole('button', { name: 'Open search' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await user.click(toggle)
    expect(screen.getByRole('searchbox')).toHaveFocus()
    await user.click(screen.getByRole('button', { name: 'Close search' }))
    expect(screen.getByRole('button', { name: 'Open search' })).toHaveAttribute('aria-expanded', 'false')
  })

  it('closes the search row on Escape, keeping the text and returning focus to the toggle', async () => {
    const user = userEvent.setup()
    renderNavbar()
    await user.click(screen.getByRole('button', { name: 'Open search' }))
    await user.type(screen.getByRole('searchbox'), 'polo')
    await waitFor(() => expect(urlSearch()).toBe('?q=polo'))

    await user.keyboard('{Escape}')
    const toggle = screen.getByRole('button', { name: 'Open search' })
    expect(toggle).toHaveFocus()
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByRole('searchbox')).toHaveValue('polo')
    expect(urlSearch()).toBe('?q=polo')
  })

  it('shows the wishlist count in the label and a badge, and links to the wishlist page', () => {
    syncWishlist(['p01', 'p02'])
    renderNavbar('/shop?page=2')
    const heart = screen.getByRole('link', { name: 'Wishlist, 2 saved' })
    expect(heart).toHaveTextContent('2')
    expect(heart).toHaveAttribute('href', '/wishlist')
    expect(heart).not.toHaveAttribute('aria-current')
  })

  it('marks the wishlist link as the current page on /wishlist', () => {
    renderNavbar('/wishlist')
    expect(screen.getByRole('link', { name: 'Wishlist, 0 saved' })).toHaveAttribute('aria-current', 'page')
  })

  it('counts only saved pieces that exist, without deleting the others from storage', () => {
    syncWishlist(['p01', 'gone', 'also-gone'])
    renderNavbar()
    expect(screen.getByRole('link', { name: 'Wishlist, 1 saved' })).toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual(['p01', 'gone', 'also-gone'])
  })

  it('shows no count until the catalogue is known', () => {
    syncWishlist(['p01', 'gone'])
    resetProductsCache()
    renderNavbar()
    expect(screen.getByRole('link', { name: 'Wishlist' })).toHaveTextContent('')
    act(() => primeProductsCache(CATALOGUE))
    expect(screen.getByRole('link', { name: 'Wishlist, 1 saved' })).toHaveTextContent('1')
  })

  it('follows a change made in another tab through the storage event', () => {
    renderNavbar()
    expect(screen.getByRole('link', { name: 'Wishlist, 0 saved' })).toBeInTheDocument()
    syncWishlist(['p03', 'p04'])
    expect(screen.getByRole('link', { name: 'Wishlist, 2 saved' })).toBeInTheDocument()
    syncWishlist(['p03'])
    expect(screen.getByRole('link', { name: 'Wishlist, 1 saved' })).toBeInTheDocument()
  })

  it('opens the cart drawer from the cart button: empty at zero, with the lines when there are some', async () => {
    const user = userEvent.setup()
    const { unmount } = renderNavbar()
    const empty = screen.getByRole('button', { name: 'Cart, 0 items' })
    expect(empty.querySelector('span')).toBeNull() // no badge at zero
    await user.click(empty)
    const drawer = await screen.findByRole('dialog', { name: 'Your cart' })
    expect(within(drawer).getByRole('heading', { name: 'Your cart is empty' })).toBeInTheDocument()
    expect(within(drawer).getByRole('button', { name: 'Checkout' })).toBeDisabled()
    unmount()

    syncCart([{ id: 'p01', size: 'M', color: 'Navy', qty: 1 }])
    renderNavbar()
    const one = screen.getByRole('button', { name: 'Cart, 1 item' })
    expect(one).toHaveTextContent('1')
    await user.click(one)
    const full = await screen.findByRole('dialog', { name: 'Your cart' })
    expect(within(full).getByRole('heading', { name: 'Heritage Polo' })).toBeInTheDocument()
    expect(within(full).getByRole('button', { name: 'Checkout' })).toBeEnabled()
  })

  it('totals quantities, caps each at stock and ignores pieces outside the catalogue without deleting them', () => {
    // p02 has 4 in stock; p03 is fine; "gone" is not in the catalogue.
    syncCart([
      { id: 'p02', size: 'M', color: 'Black', qty: 9 },
      { id: 'p03', size: 'S', color: 'Black', qty: 2 },
      { id: 'gone', size: 'M', color: 'Navy', qty: 5 },
    ])
    renderNavbar()
    expect(screen.getByRole('button', { name: 'Cart, 6 items' })).toHaveTextContent('6')
    expect(JSON.parse(localStorage.getItem(CART_KEY)!)).toHaveLength(3)
  })

  it('counts only what can be bought, the same as the drawer subtotal', async () => {
    syncCart([
      { id: 'p03', size: 'S', color: 'Black', qty: 2 }, // buyable
      { id: 'gone', size: 'M', color: 'Navy', qty: 1 }, // not in the catalogue
      { id: 'p24', size: 'M', color: 'Indigo', qty: 1 }, // sold out
      { id: 'p01', size: '34', color: 'Navy', qty: 1 }, // a size this piece does not come in
      { id: 'p01', qty: 3 }, // from before sizes existed
      { id: 'p04', size: '30', color: 'Indigo', qty: 1 }, // buyable
    ])
    const user = userEvent.setup()
    renderNavbar()
    expect(screen.getByRole('button', { name: 'Cart, 3 items' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Cart, 3 items' }))
    const drawer = await screen.findByRole('dialog', { name: 'Your cart' })
    expect(within(drawer).getByText('Subtotal (3 items)')).toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem(CART_KEY)!)).toHaveLength(6) // nothing was deleted
  })

  it('shows no cart count until the catalogue is known', () => {
    syncCart([{ id: 'p01', size: 'M', color: 'Navy', qty: 2 }])
    resetProductsCache()
    renderNavbar()
    expect(screen.getByRole('button', { name: 'Cart, 0 items' })).toBeInTheDocument()
    act(() => primeProductsCache(CATALOGUE))
    expect(screen.getByRole('button', { name: 'Cart, 2 items' })).toBeInTheDocument()
  })

  it('has no menu button: the theme toggle sits in the bar', () => {
    renderNavbar()
    expect(screen.queryByRole('button', { name: /menu/i })).toBeNull()
    expect(screen.queryByRole('navigation', { name: 'Mobile' })).toBeNull()
    expect(screen.getByRole('checkbox', { name: /Switch to (dark|light) mode/ })).toBeInTheDocument()
  })

  it('shows tooltips on keyboard focus with live counts and no native titles', async () => {
    syncWishlist(['p01', 'p02'])
    syncCart([{ id: 'p01', size: 'M', color: 'Navy', qty: 1 }])
    const user = userEvent.setup()
    renderNavbar()
    const wishlist = screen.getByRole('link', { name: 'Wishlist, 2 saved' })
    const cart = screen.getByRole('button', { name: 'Cart, 1 item' })
    const signIn = screen.getByRole('link', { name: 'Sign in' })
    for (const control of [wishlist, cart, signIn]) expect(control).not.toHaveAttribute('title')

    // jsdom's :focus-visible heuristic is unreliable after text inputs; a real browser shows it for keyboard focus.
    const matches = Element.prototype.matches
    vi.spyOn(Element.prototype, 'matches').mockImplementation(function (this: Element, selector: string) {
      return selector === ':focus-visible' ? this === document.activeElement : matches.call(this, selector)
    })
    for (let i = 0; i < 10 && document.activeElement !== wishlist; i++) await user.tab()
    expect(wishlist).toHaveFocus()
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Wishlist (2 saved)')
    await user.tab()
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Cart (1 item)')
    await user.tab()
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Sign in')
    await user.tab()
    expect(await screen.findByRole('tooltip')).toHaveTextContent(/Switch to (light|dark) theme/)
    expect(screen.getByRole('checkbox', { name: /Switch to (dark|light) mode/ }).closest('label')).not.toHaveAttribute('title')
  })
})
