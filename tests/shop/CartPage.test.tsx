import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MotionGlobalConfig } from 'motion/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../../src/components/toast/ToastProvider'
import { clearCartCache } from '../../src/hooks/useCart'
import { clearProductCache } from '../../src/hooks/useProducts'
import { addCartItem, clearCart, fetchCart, setCartItemQuantity } from '../../src/service/cartApi'
import { ProductListError } from '../../src/service/fetchProductList'
import { fetchShopProduct } from '../../src/service/fetchShopProducts'
import { clearSession, setSession } from '../../src/service/session'
import { CartPage } from '../../src/views/private/CartPage'
import { createCartStore, type CartStore, type StoreProduct } from '../fixtures/cartStore'
import { BLAZER, POLO, SOLD_OUT, TROUSERS } from '../fixtures/shopProducts'
import { storeProducts, wireCartApi, wireShopProducts } from '../fixtures/wireCartApi'

vi.mock('../../src/service/cartApi')
vi.mock('../../src/service/fetchShopProducts')

const KEY = 'silhoufit-cart'
const PIECES = [POLO, BLAZER, SOLD_OUT, TROUSERS]
const NAVY = 'p01-m-navy' // 2,100, 5 in stock
const WHITE_S = 'p01-s-white' // 1,890
const BLACK = 'p02-m-black' // 4,990, 4 in stock
const TROUSER = 'p03-30-black' // 2,600

const seed = (entries: { variantId: string; productId: string; qty: number }[]) => {
  localStorage.setItem(KEY, JSON.stringify(entries))
  clearCartCache() // the store reads storage when it starts, and on a storage event
}
const stored = () => JSON.parse(localStorage.getItem(KEY) ?? '[]')
const signIn = () => act(() => setSession({ name: 'Ana Reyes', email: 'ana@silhoufit.com' }))

let rows: StoreProduct[]
let server: CartStore

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true
})
// Wide by default (the sm layout); the phone tests call showOn(false).
const showOn = (wide: boolean) =>
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: wide && query.includes('min-width'), media: query, addEventListener() {}, removeEventListener() {} }))
beforeEach(() => {
  showOn(true)
  vi.resetAllMocks()
  localStorage.clear()
  act(() => clearSession())
  clearProductCache()
  rows = storeProducts(PIECES)
  server = createCartStore(() => rows)
  wireCartApi(server)
  wireShopProducts(PIECES)
  clearCartCache()
})

function Where() {
  const { pathname, search } = useLocation()
  return <span data-testid="where">{pathname + search}</span>
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/cart']}>
      <ToastProvider>
        <Where />
        <Routes>
          <Route path="/cart" element={<CartPage />} />
          <Route path="*" element={<p>another page</p>} />
        </Routes>
      </ToastProvider>
    </MemoryRouter>,
  )
}

describe('CartPage on a phone', () => {
  beforeEach(signIn)
  const seedTwo = () => {
    server.seed(NAVY, 2)
    server.seed(TROUSER, 1)
  }

  it('shows Edit and Checkout (N), without Remove selected or the toolbar', async () => {
    showOn(false)
    seedTwo()
    const user = userEvent.setup()
    renderPage()
    expect(await screen.findByRole('heading', { name: 'Your cart (2)' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Edit cart' })).toHaveTextContent('Edit')
    expect(screen.getByRole('button', { name: 'Checkout (0)' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Remove selected' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Clear cart' })).toBeNull()
    await user.click(screen.getByRole('checkbox', { name: 'Select all items' }))
    expect(screen.getByRole('button', { name: 'Checkout (3)' })).toBeEnabled()
    expect(screen.getByText('₱2,100.00 each')).toBeInTheDocument() // only the quantity-2 line
    expect(screen.getAllByText(/ each$/)).toHaveLength(1)
  })

  it('Edit swaps Checkout for Remove selected and Clear cart, and Done brings it back with the selection kept', async () => {
    showOn(false)
    seedTwo()
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('checkbox', { name: 'Select Heritage Polo' }))
    const toggle = screen.getByRole('button', { name: 'Edit cart' })
    await user.click(toggle)
    expect(toggle).toHaveAccessibleName('Done editing')
    expect(toggle).toHaveTextContent('Done')
    expect(toggle).toHaveFocus()
    expect(screen.queryByRole('button', { name: /^Checkout/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /quantity of/ })).toBeNull()
    expect(screen.getByRole('button', { name: 'Remove selected' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Clear cart' })).toBeEnabled()
    await user.click(toggle)
    expect(screen.getByRole('button', { name: 'Edit cart' })).toHaveFocus()
    expect(screen.getByRole('button', { name: 'Checkout (2)' })).toBeEnabled()
    expect(screen.getByRole('checkbox', { name: 'Select Heritage Polo' })).toBeChecked()
  })
})

describe('CartPage as a guest', () => {
  it('shows each line with its spec, price, quantity and line total; the total is for ticked lines only', async () => {
    seed([{ variantId: NAVY, productId: 'p01', qty: 2 }, { variantId: TROUSER, productId: 'p03', qty: 1 }])
    const user = userEvent.setup()
    renderPage()
    expect(await screen.findByRole('heading', { name: 'Heritage Polo' })).toBeInTheDocument()
    expect(screen.getByText('Size M · Navy')).toBeInTheDocument()
    expect(screen.getByText('₱2,100.00 each')).toBeInTheDocument()
    expect(screen.getByText('₱4,200.00')).toBeInTheDocument() // 2 × 2,100
    expect(screen.getByText('0 selected')).toBeInTheDocument()
    expect(screen.getByText('Total (0 items)')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Checkout' })).toBeDisabled()

    await user.click(screen.getByRole('checkbox', { name: 'Select Heritage Polo' }))
    await user.click(screen.getByRole('checkbox', { name: 'Select Wool Trousers' }))
    expect(screen.getByText('Total (3 items)')).toBeInTheDocument()
    expect(screen.getByText('₱6,800.00', { selector: 'span.text-xl' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Checkout' })).toBeEnabled()
  })

  it("changes a quantity with the stepper, capped by the variant's stock", async () => {
    seed([{ variantId: BLACK, productId: 'p02', qty: 3 }])
    const user = userEvent.setup()
    renderPage()
    const up = await screen.findByRole('button', { name: 'Increase quantity of Fence-Line Blazer' })
    const down = screen.getByRole('button', { name: 'Decrease quantity of Fence-Line Blazer' })
    await user.click(up)
    await waitFor(() => expect(stored()[0].qty).toBe(4))
    expect(up).toBeDisabled()
    await user.click(down)
    await user.click(down)
    await user.click(down)
    await waitFor(() => expect(stored()[0].qty).toBe(1))
    expect(down).toBeDisabled()
  })

  it('changes the size and colour of a line, keeping its quantity and ticked state', async () => {
    seed([{ variantId: NAVY, productId: 'p01', qty: 2 }])
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('checkbox', { name: 'Select Heritage Polo' }))
    await user.click(screen.getByRole('button', { name: /Change variation of Heritage Polo/ }))
    const dialog = await screen.findByRole('dialog', { name: 'Change variation' })
    expect(within(dialog).getByRole('button', { name: 'Update variation' })).toBeDisabled()
    await user.click(within(dialog).getByRole('radio', { name: 'White' }))
    await user.click(within(dialog).getByRole('radio', { name: 'S' }))
    await user.click(within(dialog).getByRole('button', { name: 'Update variation' }))
    await waitFor(() => expect(stored()).toEqual([{ variantId: WHITE_S, productId: 'p01', qty: 2 }]))
    // The old row leaves as the new one arrives, so wait for just one.
    await waitFor(() => expect(screen.getAllByRole('checkbox', { name: 'Select Heritage Polo' })).toHaveLength(1))
    expect(screen.getByText('Size S · White')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Select Heritage Polo' })).toBeChecked()
  })

  it('will not update to a size and colour that no variant has', async () => {
    seed([{ variantId: NAVY, productId: 'p01', qty: 1 }])
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('button', { name: /Change variation of Heritage Polo/ }))
    const dialog = await screen.findByRole('dialog', { name: 'Change variation' })
    await user.click(within(dialog).getByRole('radio', { name: 'Navy' }))
    await user.click(within(dialog).getByRole('radio', { name: 'S' })) // Navy comes in M only
    expect(within(dialog).getByText(/That size and colour is not available/)).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Update variation' })).toBeDisabled()
  })

  it('merges into the line already in the chosen size and colour', async () => {
    seed([{ variantId: NAVY, productId: 'p01', qty: 1 }, { variantId: WHITE_S, productId: 'p01', qty: 2 }])
    const user = userEvent.setup()
    renderPage()
    await user.click((await screen.findAllByRole('button', { name: /Change variation of Heritage Polo/ }))[0])
    await user.click(await screen.findByRole('radio', { name: 'White' }))
    await user.click(screen.getByRole('radio', { name: 'S' }))
    await user.click(screen.getByRole('button', { name: 'Update variation' }))
    await waitFor(() => expect(stored()).toEqual([{ variantId: WHITE_S, productId: 'p01', qty: 3 }]))
  })

  it('removes a line at once and offers Undo in a toast, which puts it back', async () => {
    seed([{ variantId: NAVY, productId: 'p01', qty: 2 }])
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('button', { name: 'More actions for Heritage Polo' }))
    await user.click(screen.getByRole('menuitem', { name: 'Remove' }))
    await waitFor(() => expect(stored()).toEqual([]))
    expect(screen.getByText('Removed Heritage Polo from cart')).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'Your cart is currently empty' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Undo/ }))
    await waitFor(() => expect(stored()).toEqual([{ variantId: NAVY, productId: 'p01', qty: 2 }]))
    expect(await screen.findByRole('heading', { name: 'Heritage Polo' })).toBeInTheDocument()
  })

  it('shows the empty state for a guest, with a Log in link that returns to the cart', async () => {
    renderPage()
    expect(await screen.findByText('Add items to place an order or log in to retrieve your cart.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Shop now' })).toHaveAttribute('href', '/shop')
    expect(screen.getByRole('link', { name: 'Log in' })).toHaveAttribute('href', '/login?next=%2Fcart')
  })

  it('selects and clears every line with Select all items', async () => {
    seed([{ variantId: NAVY, productId: 'p01', qty: 1 }, { variantId: TROUSER, productId: 'p03', qty: 1 }])
    const user = userEvent.setup()
    renderPage()
    const all = await screen.findByRole('checkbox', { name: 'Select all items' })
    await user.click(all)
    expect(all).toBeChecked()
    expect(screen.getByText('2 selected')).toBeInTheDocument()
    await user.click(screen.getByRole('checkbox', { name: 'Select Heritage Polo' }))
    expect(all).not.toBeChecked()
    await user.click(all)
    await user.click(all)
    expect(screen.getByText('0 selected')).toBeInTheDocument()
  })

  it('asks before removing the selected lines, and Cancel keeps them', async () => {
    seed([{ variantId: NAVY, productId: 'p01', qty: 1 }, { variantId: TROUSER, productId: 'p03', qty: 1 }])
    const user = userEvent.setup()
    renderPage()
    expect(await screen.findByRole('button', { name: 'Remove selected' })).toBeDisabled()
    await user.click(screen.getByRole('checkbox', { name: 'Select Heritage Polo' }))
    await user.click(screen.getByRole('button', { name: 'Remove selected' }))
    const dialog = await screen.findByRole('dialog', { name: 'Are you sure?' })
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(stored()).toHaveLength(2)

    await user.click(screen.getByRole('button', { name: 'Remove selected' }))
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Remove 1 item' }))
    await waitFor(() => expect(stored()).toEqual([{ variantId: TROUSER, productId: 'p03', qty: 1 }]))
    expect(screen.getByText('0 selected')).toBeInTheDocument()
  })

  it('shows lines that cannot be bought with their reason, leaves them out of the total, and lets them be removed', async () => {
    seed([
      { variantId: TROUSER, productId: 'p03', qty: 1 }, // 2,600
      { variantId: 'gone-v', productId: 'gone', qty: 1 },
      { variantId: 'p24-m-indigo', productId: 'p24', qty: 1 }, // sold out
    ])
    const user = userEvent.setup()
    renderPage()
    expect(await screen.findByText('No longer available')).toBeInTheDocument()
    expect(screen.getByText('Sold out')).toBeInTheDocument()

    await user.click(screen.getByRole('checkbox', { name: 'Select all items' }))
    expect(screen.getByText('Total (1 item)')).toBeInTheDocument()
    expect(screen.getByText('₱2,600.00', { selector: 'span.text-xl' })).toBeInTheDocument()
    expect(screen.getByText(/2 selected pieces cannot be bought/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'More actions for Field Denim Jacket' }))
    await user.click(screen.getByRole('menuitem', { name: 'Remove' }))
    await waitFor(() => expect(stored()).toHaveLength(2))
    await waitFor(() => expect(screen.queryByText('Sold out')).toBeNull()) // the row slides out first
  })

  it('shows skeleton lines while the pieces load, then the lines', async () => {
    seed([{ variantId: NAVY, productId: 'p01', qty: 1 }])
    renderPage()
    expect(screen.getByRole('status', { name: 'Loading your cart' })).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'Heritage Polo' })).toBeInTheDocument()
  })

  it('shows an error with a retry when the pieces cannot be loaded', async () => {
    seed([{ variantId: NAVY, productId: 'p01', qty: 1 }])
    const { fetchShopProduct } = await import('../../src/service/fetchShopProducts')
    vi.mocked(fetchShopProduct).mockRejectedValueOnce(new ProductListError('network'))
    const user = userEvent.setup()
    renderPage()
    expect(await screen.findByRole('heading', { name: 'Your cart did not load' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('heading', { name: 'Heritage Polo' })).toBeInTheDocument()
  })

  it('sends only the ticked buyable lines to the checkout, keyed by variant', async () => {
    seed([
      { variantId: NAVY, productId: 'p01', qty: 1 },
      { variantId: TROUSER, productId: 'p03', qty: 1 },
      { variantId: BLACK, productId: 'p02', qty: 1 },
    ])
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('checkbox', { name: 'Select Heritage Polo' }))
    await user.click(screen.getByRole('checkbox', { name: 'Select Wool Trousers' }))
    await user.click(screen.getByRole('button', { name: 'Checkout' }))
    const url = new URL(screen.getByTestId('where').textContent!, 'http://x')
    expect(url.pathname).toBe('/checkout')
    expect(url.searchParams.get('source')).toBe('cart')
    expect(url.searchParams.getAll('line')).toEqual([NAVY, TROUSER])
  })

  it('tells a guest they will sign in before paying', async () => {
    seed([{ variantId: NAVY, productId: 'p01', qty: 1 }])
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('checkbox', { name: 'Select all items' }))
    expect(screen.getByText("You'll sign in before you pay.")).toBeInTheDocument()
  })
})

describe('CartPage signed in', () => {
  beforeEach(signIn)

  it("shows the server's cart, with the empty state for a signed-in user", async () => {
    renderPage()
    expect(await screen.findByText('Add items to place an order.')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Log in' })).toBeNull()
    expect(fetchCart).toHaveBeenCalled()
  })

  it('shows the lines, sends the quantity change to the API, and does not say they will sign in', async () => {
    server.seed(NAVY, 2)
    const user = userEvent.setup()
    renderPage()
    expect(await screen.findByRole('heading', { name: 'Heritage Polo' })).toBeInTheDocument()
    expect(screen.getByText('₱4,200.00')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Increase quantity of Heritage Polo' }))
    await waitFor(() => expect(server.items[0].quantity).toBe(3))
    expect(setCartItemQuantity).toHaveBeenCalledWith(server.items[0].id, 3)
    await user.click(screen.getByRole('checkbox', { name: 'Select all items' }))
    expect(screen.queryByText("You'll sign in before you pay.")).toBeNull()
  })

  it('shows "No longer available" for an archived piece and does not let it be checked out', async () => {
    server.seed(NAVY, 1)
    rows[0].isActive = false
    const user = userEvent.setup()
    renderPage()
    expect(await screen.findByText('No longer available')).toBeInTheDocument()
    await user.click(screen.getByRole('checkbox', { name: 'Select all items' }))
    expect(screen.getByText(/1 selected piece cannot be bought/)).toBeInTheDocument()
    expect(screen.getByText('Total (0 items)')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Checkout' })).toBeDisabled()
  })

  it('toasts the reason when the server refuses a change, and keeps the cart as the server has it', async () => {
    server.seed(NAVY, 2)
    const user = userEvent.setup()
    renderPage()
    await screen.findByRole('heading', { name: 'Heritage Polo' })
    vi.mocked(setCartItemQuantity).mockRejectedValueOnce(new ProductListError('validation', 'Only 2 in stock'))
    await user.click(screen.getByRole('button', { name: 'Increase quantity of Heritage Polo' }))
    expect(await screen.findByText(/Couldn't update your cart: Only 2 in stock/)).toBeInTheDocument()
    expect(addCartItem).not.toHaveBeenCalled()
  })

  describe('Clear cart', () => {
    const askToClear = async (user: ReturnType<typeof userEvent.setup>) => {
      await user.click(await screen.findByRole('button', { name: 'Clear cart' }))
      return screen.findByRole('dialog', { name: 'Clear your cart?' })
    }

    it('is not offered for an empty cart', async () => {
      renderPage()
      await screen.findByText('Add items to place an order.')
      expect(screen.queryByRole('button', { name: 'Clear cart' })).toBeNull()
    })

    it('asks first, and Cancel keeps the cart', async () => {
      server.seed(NAVY, 2)
      const user = userEvent.setup()
      renderPage()
      const dialog = await askToClear(user)
      await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
      expect(clearCart).not.toHaveBeenCalled()
      expect(screen.getByRole('heading', { name: 'Heritage Polo' })).toBeInTheDocument()
    })

    it('empties the cart, says so, and Undo puts the pieces back', async () => {
      server.seed(NAVY, 2)
      server.seed(BLACK, 1)
      const user = userEvent.setup()
      renderPage()
      const dialog = await askToClear(user)
      await user.click(within(dialog).getByRole('button', { name: 'Clear cart' }))
      expect(await screen.findByText('Cleared your cart')).toBeInTheDocument()
      expect(clearCart).toHaveBeenCalledTimes(1)
      expect(server.items).toHaveLength(0)
      expect(await screen.findByText('Add items to place an order.')).toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: 'Undo' }))
      expect(await screen.findByText('Put your cart back')).toBeInTheDocument()
      expect(server.items.map((i) => [i.variantId, i.quantity])).toEqual([[NAVY, 2], [BLACK, 1]])
      expect(await screen.findByRole('heading', { name: 'Heritage Polo' })).toBeInTheDocument()
    })

    it('names a piece that sold out meanwhile when Undo cannot put it back', async () => {
      server.seed(NAVY, 2)
      server.seed(BLACK, 1)
      const user = userEvent.setup()
      renderPage()
      const dialog = await askToClear(user)
      await user.click(within(dialog).getByRole('button', { name: 'Clear cart' }))
      await screen.findByText('Cleared your cart')
      // The shop now reports the navy polo sold out.
      vi.mocked(fetchShopProduct).mockImplementation(async (id) => {
        const piece = PIECES.find((p) => p.id === id || p.slug === id)!
        return { ...piece, variants: piece.variants!.map((v) => (v.id === NAVY ? { ...v, stock: 0 } : v)) }
      })
      clearProductCache()
      await user.click(screen.getByRole('button', { name: 'Undo' }))
      expect(await screen.findByText(/Put back 1 of 2 items\. Heritage Polo is out of stock or no longer available\./)).toBeInTheDocument()
      expect(server.items.map((i) => i.variantId)).toEqual([BLACK])
    })

    it('keeps the cart and says why when the request fails', async () => {
      server.seed(NAVY, 2)
      vi.mocked(clearCart).mockRejectedValueOnce(new ProductListError('network'))
      const user = userEvent.setup()
      renderPage()
      const dialog = await askToClear(user)
      await user.click(within(dialog).getByRole('button', { name: 'Clear cart' }))
      expect(await screen.findByText(/Couldn't update your cart\. The request failed/)).toBeInTheDocument()
      expect(screen.queryByText('Cleared your cart')).toBeNull()
      expect(await screen.findByRole('heading', { name: 'Heritage Polo' })).toBeInTheDocument()
      expect(server.items).toHaveLength(1)
    })
  })
})
