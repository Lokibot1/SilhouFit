import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MotionGlobalConfig } from 'motion/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { Layout } from '../../src/components/Layout'
import { ShopNavbar } from '../../src/components/ShopNavbar'
import { ToastProvider } from '../../src/components/toast/ToastProvider'
import { CookieConsentProvider } from '../../src/contexts/CookieConsentContext'
import { ThemeProvider } from '../../src/contexts/ThemeContext'
import { clearCartCache } from '../../src/hooks/useCart'
import { useCurrentUser } from '../../src/hooks/useCurrentUser'
import { clearProductCache } from '../../src/hooks/useProducts'
import { fetchCart } from '../../src/service/cartApi'
import { ProductListError } from '../../src/service/fetchProductList'
import { fetchShopProduct } from '../../src/service/fetchShopProducts'
import { clearSession, getSession, setSession } from '../../src/service/session'
import { createCartStore } from '../fixtures/cartStore'
import { BLAZER, POLO, shopProduct, TROUSERS, variant } from '../fixtures/shopProducts'
import { storeProducts, wireCartApi, wireShopProducts } from '../fixtures/wireCartApi'

vi.mock('../../src/hooks/useCurrentUser', () => ({ useCurrentUser: vi.fn(() => null) }))
vi.mock('../../src/service/cartApi')
vi.mock('../../src/service/fetchShopProducts')
const currentUser = vi.mocked(useCurrentUser)

const KEY = 'silhoufit-wishlist'
const CART_KEY = 'silhoufit-cart'
const PIECES = [POLO, BLAZER, TROUSERS]
function syncCart(lines: { variantId: string; productId: string; qty: number }[]) {
  localStorage.setItem(CART_KEY, JSON.stringify(lines))
  act(() => {
    window.dispatchEvent(new StorageEvent('storage', { key: CART_KEY }))
  })
}

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
  vi.resetAllMocks()
  clearProductCache()
  act(() => clearSession())
  syncWishlist()
  syncCart([])
  clearCartCache()
  wireShopProducts(PIECES)
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
            <ToastProvider>
              <Routes>
                <Route element={<Layout />}>
                  <Route path="shop" element={<p>shop page</p>} />
                  <Route path="cart" element={<p>cart page</p>} />
                  <Route path="checkout" element={<p>checkout page</p>} />
                  <Route path="checkout/success" element={<p>success page</p>} />
                  <Route path="about" element={<p>about page</p>} />
                </Route>
              </Routes>
            </ToastProvider>
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

  it.each(['/cart', '/checkout', '/checkout/success'])('uses the shop bar on %s, without the search', (url) => {
    renderLayout(url)
    expect(screen.getByRole('link', { name: /^Cart/ })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', `/login?next=${encodeURIComponent(url)}`)
    expect(screen.getByRole('checkbox', { name: /Switch to (dark|light) mode/ })).toBeInTheDocument()
    expect(screen.queryByRole('searchbox')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Open search' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Sign Up now!' })).toBeNull()
  })

  it('keeps the regular navbar elsewhere', () => {
    renderLayout('/about')
    expect(screen.getAllByRole('link', { name: 'Login!' }).length).toBeGreaterThan(0)
    expect(screen.queryByRole('searchbox')).toBeNull()
    expect(screen.queryByRole('link', { name: /^Wishlist, / })).toBeNull() // the footer's plain "Wishlist" link is fine
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
    renderNavbar('/shop?category=Hoodie&sort=newest')
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute(
      'href',
      '/login?next=%2Fshop%3Fcategory%3DHoodie%26sort%3Dnewest',
    )
  })

  it('shows the user avatar with initials, inside an account button, when someone is signed in', () => {
    currentUser.mockReturnValue({ name: 'Ana Reyes' })
    renderNavbar()
    expect(screen.queryByRole('link', { name: 'Sign in' })).toBeNull()
    expect(screen.getByRole('img', { name: 'Ana Reyes' })).toHaveTextContent('AR')
    expect(screen.getByRole('button', { name: 'Account, Ana Reyes' })).toHaveAttribute('aria-expanded', 'false')
  })

  it('links the logo to the landing page only when signed out', () => {
    const { unmount } = renderNavbar()
    expect(screen.getByRole('link', { name: /SilhouFit/ })).toHaveAttribute('href', '/')
    expect(screen.queryByRole('link', { name: 'Visit website' })).toBeNull()
    unmount()

    currentUser.mockReturnValue({ name: 'Ana Reyes' })
    renderNavbar()
    expect(screen.queryByRole('link', { name: /SilhouFit/ })).toBeNull()
    expect(screen.getByRole('link', { name: 'Visit website' })).toHaveAttribute('href', '/')
  })

  describe('account menu', () => {
    const open = async (user: ReturnType<typeof userEvent.setup>) => {
      currentUser.mockReturnValue({ name: 'Ana Reyes', email: 'ana@example.com' })
      renderNavbar()
      await user.click(screen.getByRole('button', { name: 'Account, Ana Reyes' }))
      return screen.getByRole('group', { name: 'Account' })
    }

    it('shows the name and email with Profile and Sign out, and moves focus to Profile', async () => {
      const user = userEvent.setup()
      const panel = await open(user)
      expect(panel).toHaveTextContent('Ana Reyes')
      expect(panel).toHaveTextContent('ana@example.com')
      expect(screen.getByRole('button', { name: 'Account, Ana Reyes' })).toHaveAttribute('aria-expanded', 'true')
      expect(screen.getByRole('link', { name: 'Profile' })).toHaveFocus()
      expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument()
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

  it('shows the wishlist count in the label and a badge, and links to the wishlist page', async () => {
    syncWishlist(['p01', 'p02'])
    renderNavbar('/shop?page=2')
    const heart = await screen.findByRole('link', { name: 'Wishlist, 2 saved' })
    expect(heart).toHaveTextContent('2')
    expect(heart).toHaveAttribute('href', '/wishlist')
    expect(heart).not.toHaveAttribute('aria-current')
  })

  it('marks the wishlist link as the current page on /wishlist', () => {
    renderNavbar('/wishlist')
    expect(screen.getByRole('link', { name: 'Wishlist, 0 saved' })).toHaveAttribute('aria-current', 'page')
  })

  it('counts products with API (UUID) ids', async () => {
    const ids = ['00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002']
    const pieces = ids.map((id, n) => shopProduct(id, `Linen ${n}`, [variant(`v${n}`, 'M', 'Navy')]))
    wireShopProducts(pieces)
    syncWishlist(ids)
    renderNavbar()
    expect(await screen.findByRole('link', { name: 'Wishlist, 2 saved' })).toHaveTextContent('2')
  })

  it('counts only saved pieces that can still be bought, without deleting the others from storage', async () => {
    syncWishlist(['p01', 'gone', 'also-gone'])
    renderNavbar()
    expect(await screen.findByRole('link', { name: 'Wishlist, 1 saved' })).toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual(['p01', 'gone', 'also-gone'])
  })

  it('shows no count until the saved pieces are known', async () => {
    syncWishlist(['p01', 'gone'])
    let resolve!: (value: typeof POLO) => void
    vi.mocked(fetchShopProduct).mockImplementation((id) => (id === 'p01' ? new Promise((r) => (resolve = r)) : Promise.reject(new ProductListError('not-found'))))
    renderNavbar()
    expect(screen.getByRole('link', { name: 'Wishlist' })).toHaveTextContent('')
    await act(async () => resolve(POLO))
    expect(await screen.findByRole('link', { name: 'Wishlist, 1 saved' })).toHaveTextContent('1')
  })

  it('follows a change made in another tab through the storage event', async () => {
    renderNavbar()
    expect(screen.getByRole('link', { name: 'Wishlist, 0 saved' })).toBeInTheDocument()
    syncWishlist(['p03', 'p01'])
    expect(await screen.findByRole('link', { name: 'Wishlist, 2 saved' })).toBeInTheDocument()
    syncWishlist(['p03'])
    expect(await screen.findByRole('link', { name: 'Wishlist, 1 saved' })).toBeInTheDocument()
  })

  it('links to the cart page: no badge at zero, the count when there are lines, and the current page when on it', async () => {
    const { unmount } = renderNavbar()
    const empty = screen.getByRole('link', { name: 'Cart, 0 items' })
    expect(empty).toHaveAttribute('href', '/cart')
    expect(empty).not.toHaveAttribute('aria-current')
    expect(empty.querySelector('span')).toBeNull() // no badge at zero
    unmount()

    syncCart([{ variantId: 'p01-m-navy', productId: 'p01', qty: 1 }])
    clearCartCache()
    renderNavbar('/cart')
    const one = await screen.findByRole('link', { name: 'Cart, 1 item' })
    expect(one).toHaveTextContent('1')
    expect(one).toHaveAttribute('aria-current', 'page')
  })

  it("totals the guest cart's quantities, without deleting anything from storage", async () => {
    syncCart([
      { variantId: 'p02-m-black', productId: 'p02', qty: 4 },
      { variantId: 'p03-30-black', productId: 'p03', qty: 2 },
    ])
    clearCartCache()
    renderNavbar()
    expect(await screen.findByRole('link', { name: 'Cart, 6 items' })).toHaveTextContent('6')
    expect(JSON.parse(localStorage.getItem(CART_KEY)!)).toHaveLength(2)
  })

  it("shows the server's totalItems when signed in", async () => {
    const server = createCartStore(() => storeProducts(PIECES))
    wireCartApi(server)
    server.seed('p01-m-navy', 2)
    server.seed('p03-30-black', 3)
    act(() => setSession({ name: 'Ana Reyes', email: 'ana@example.com' }))
    renderNavbar()
    expect(await screen.findByRole('link', { name: 'Cart, 5 items' })).toBeInTheDocument()
    expect(fetchCart).toHaveBeenCalled()
  })

  it('has no menu button: the theme toggle sits in the bar', () => {
    renderNavbar()
    expect(screen.queryByRole('button', { name: /menu/i })).toBeNull()
    expect(screen.queryByRole('navigation', { name: 'Mobile' })).toBeNull()
    expect(screen.getByRole('checkbox', { name: /Switch to (dark|light) mode/ })).toBeInTheDocument()
  })

  it('shows tooltips on keyboard focus with live counts and no native titles', async () => {
    syncWishlist(['p01', 'p02'])
    syncCart([{ variantId: 'p01-m-navy', productId: 'p01', qty: 1 }])
    clearCartCache()
    const user = userEvent.setup()
    renderNavbar()
    const wishlist = await screen.findByRole('link', { name: 'Wishlist, 2 saved' })
    const cart = screen.getByRole('link', { name: 'Cart, 1 item' })
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
