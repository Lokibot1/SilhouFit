import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MotionGlobalConfig } from 'motion/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../../src/components/toast/ToastProvider'
import { PRODUCTS } from '../../src/data/products'
import { primeProductsCache, resetProductsCache } from '../../src/hooks/useProducts'
import { clearSession, setSession } from '../../src/service/session'
import { CartPage } from '../../src/views/private/CartPage'

const KEY = 'silhoufit-cart'
const CATALOGUE = { products: PRODUCTS, syncedAt: '2026-10-10T15:05:00' }

function seed(lines: { id: string; size?: string | null; color?: string | null; qty: number }[]) {
  localStorage.setItem(KEY, JSON.stringify(lines))
  act(() => {
    window.dispatchEvent(new StorageEvent('storage', { key: KEY }))
  })
}
const stored = () => JSON.parse(localStorage.getItem(KEY) ?? '[]')

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} }))
})
beforeEach(() => {
  localStorage.clear()
  act(() => {
    window.dispatchEvent(new StorageEvent('storage', { key: null }))
    clearSession()
  })
  resetProductsCache()
  primeProductsCache(CATALOGUE)
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

describe('CartPage', () => {
  it('shows each line with its spec, price, quantity and line total; the total is for ticked lines only', async () => {
    seed([
      { id: 'p01', size: 'M', color: 'Navy', qty: 2 },
      { id: 'p07', size: 'S', color: 'Blush', qty: 1 }, // 2,890 listed, 2,290 on sale
    ])
    const user = userEvent.setup()
    renderPage()
    expect(screen.getByRole('heading', { name: 'Heritage Polo' })).toBeInTheDocument()
    expect(screen.getByText('Size M · Navy')).toBeInTheDocument()
    expect(screen.getByText('₱1,890.00 each')).toBeInTheDocument()
    expect(screen.getByText('₱3,780.00')).toBeInTheDocument() // 2 × 1,890
    expect(screen.getByText('0 selected')).toBeInTheDocument()
    expect(screen.getByText('Total (0 items)')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Checkout' })).toBeDisabled()

    await user.click(screen.getByRole('checkbox', { name: 'Select Heritage Polo' }))
    await user.click(screen.getByRole('checkbox', { name: 'Select Garden Print Dress' }))
    expect(screen.getByText('Total (3 items)')).toBeInTheDocument()
    expect(screen.getByText('₱6,070.00')).toBeInTheDocument() // the sale price is what counts
    expect(screen.getByRole('button', { name: 'Checkout' })).toBeEnabled()
  })

  it('changes a quantity with the stepper, capped by stock', async () => {
    seed([{ id: 'p02', size: 'M', color: 'Black', qty: 3 }]) // 4 in stock
    const user = userEvent.setup()
    renderPage()
    const up = screen.getByRole('button', { name: 'Increase quantity of Fence-Line Blazer' })
    const down = screen.getByRole('button', { name: 'Decrease quantity of Fence-Line Blazer' })
    await user.click(up)
    expect(stored()[0].qty).toBe(4)
    expect(up).toBeDisabled()
    await user.click(down)
    await user.click(down)
    await user.click(down)
    expect(stored()[0].qty).toBe(1)
    expect(down).toBeDisabled()
  })

  it('changes the size and colour of a line, keeping its quantity and ticked state', async () => {
    seed([{ id: 'p01', size: 'M', color: 'Navy', qty: 2 }])
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByRole('checkbox', { name: 'Select Heritage Polo' }))
    await user.click(screen.getByRole('button', { name: /Change variation of Heritage Polo/ }))
    const dialog = screen.getByRole('dialog', { name: 'Change variation' })
    expect(within(dialog).getByRole('button', { name: 'Update variation' })).toBeDisabled()
    await user.click(within(dialog).getByRole('radio', { name: 'White' }))
    await user.click(within(dialog).getByRole('radio', { name: 'L' }))
    await user.click(within(dialog).getByRole('button', { name: 'Update variation' }))
    expect(stored()).toEqual([{ id: 'p01', size: 'L', color: 'White', qty: 2 }])
    // The old row leaves as the new one arrives, so wait for just one.
    await waitFor(() => expect(screen.getAllByRole('checkbox', { name: 'Select Heritage Polo' })).toHaveLength(1))
    expect(screen.getByText('Size L · White')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Select Heritage Polo' })).toBeChecked()
  })

  it('merges into the line already in the chosen size and colour', async () => {
    seed([
      { id: 'p01', size: 'M', color: 'Navy', qty: 1 },
      { id: 'p01', size: 'L', color: 'Navy', qty: 2 },
    ])
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getAllByRole('button', { name: /Change variation of Heritage Polo/ })[0])
    await user.click(screen.getByRole('radio', { name: 'L' }))
    await user.click(screen.getByRole('button', { name: 'Update variation' }))
    expect(stored()).toEqual([{ id: 'p01', size: 'L', color: 'Navy', qty: 3 }])
  })

  it("caps one line by what the piece's other lines already hold", async () => {
    seed([
      { id: 'p02', size: 'S', color: 'Black', qty: 1 },
      { id: 'p02', size: 'M', color: 'Black', qty: 2 },
    ])
    const user = userEvent.setup()
    renderPage()
    const [first] = screen.getAllByRole('button', { name: 'Increase quantity of Fence-Line Blazer' })
    await user.click(first) // 4 in stock: 2 held by the other line, so this one stops at 2
    expect(first).toBeDisabled()
    expect(stored().find((l: { size: string }) => l.size === 'S').qty).toBe(2)
  })

  it('removes a line at once and offers Undo in a toast, which puts it back', async () => {
    seed([{ id: 'p01', size: 'M', color: 'Navy', qty: 2 }])
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByRole('button', { name: 'More actions for Heritage Polo' }))
    await user.click(screen.getByRole('menuitem', { name: 'Remove' }))
    expect(stored()).toEqual([])
    expect(screen.getByText('Removed Heritage Polo from cart')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Your cart is currently empty' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Undo/ }))
    expect(stored()).toEqual([{ id: 'p01', size: 'M', color: 'Navy', qty: 2 }])
    expect(screen.getByRole('heading', { name: 'Heritage Polo' })).toBeInTheDocument()
  })

  it('shows the empty state for a signed-in user, with Shop now and no Log in', () => {
    act(() => setSession({ name: 'Ana Reyes', email: 'ana@silhoufit.com' }))
    renderPage()
    expect(screen.getByRole('heading', { name: 'Your cart is currently empty' })).toBeInTheDocument()
    expect(screen.getByText('Add items to place an order.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Shop now' })).toHaveAttribute('href', '/shop')
    expect(screen.queryByRole('link', { name: 'Log in' })).toBeNull()
  })

  it('shows the empty state for a guest, with a Log in link that returns to the cart', () => {
    renderPage()
    expect(screen.getByText('Add items to place an order or log in to retrieve your cart.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Shop now' })).toHaveAttribute('href', '/shop')
    expect(screen.getByRole('link', { name: 'Log in' })).toHaveAttribute('href', '/login?next=%2Fcart')
  })

  it('selects and clears every line with Select all items', async () => {
    seed([
      { id: 'p01', size: 'M', color: 'Navy', qty: 1 },
      { id: 'p03', size: 'S', color: 'Black', qty: 1 },
    ])
    const user = userEvent.setup()
    renderPage()
    const all = screen.getByRole('checkbox', { name: 'Select all items' })
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
    seed([
      { id: 'p01', size: 'M', color: 'Navy', qty: 1 },
      { id: 'p03', size: 'S', color: 'Black', qty: 1 },
    ])
    const user = userEvent.setup()
    renderPage()
    expect(screen.getByRole('button', { name: 'Remove selected' })).toBeDisabled()
    await user.click(screen.getByRole('checkbox', { name: 'Select Heritage Polo' }))
    await user.click(screen.getByRole('button', { name: 'Remove selected' }))
    const dialog = await screen.findByRole('dialog', { name: 'Are you sure?' })
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(stored()).toHaveLength(2)

    await user.click(screen.getByRole('button', { name: 'Remove selected' }))
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Remove 1 item' }))
    expect(stored()).toEqual([{ id: 'p03', size: 'S', color: 'Black', qty: 1 }])
    expect(screen.getByText('0 selected')).toBeInTheDocument()
  })

  it('shows lines that cannot be bought with their reason, leaves them out of the total, and lets them be removed', async () => {
    seed([
      { id: 'p03', size: 'S', color: 'Black', qty: 1 }, // 790
      { id: 'gone', size: 'M', color: 'Navy', qty: 1 },
      { id: 'p24', size: 'M', color: 'Indigo', qty: 1 }, // sold out
      { id: 'p01', qty: 1 }, // a line from before sizes existed
    ])
    const user = userEvent.setup()
    renderPage()
    expect(screen.getByText('No longer in the catalogue')).toBeInTheDocument()
    expect(screen.getByText('Sold out')).toBeInTheDocument()
    expect(screen.getByText(/Size and colour were not chosen/)).toBeInTheDocument()

    await user.click(screen.getByRole('checkbox', { name: 'Select all items' }))
    expect(screen.getByText('Total (1 item)')).toBeInTheDocument()
    expect(screen.getByText('₱790.00', { selector: 'span.text-xl' })).toBeInTheDocument()
    expect(screen.getByText(/3 selected pieces cannot be bought/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'More actions for Field Denim Jacket' }))
    await user.click(screen.getByRole('menuitem', { name: 'Remove' }))
    expect(stored()).toHaveLength(3)
    await waitFor(() => expect(screen.queryByText('Sold out')).toBeNull()) // the row slides out first
  })

  it('shows skeleton lines while the catalogue loads, then the lines', async () => {
    seed([{ id: 'p01', size: 'M', color: 'Navy', qty: 1 }])
    resetProductsCache()
    renderPage()
    expect(screen.getByRole('status', { name: 'Loading your cart' })).toBeInTheDocument()
    act(() => primeProductsCache(CATALOGUE))
    expect(await screen.findByRole('heading', { name: 'Heritage Polo' })).toBeInTheDocument()
  })

  it('sends only the ticked buyable lines to the checkout', async () => {
    seed([
      { id: 'p01', size: 'M', color: 'Navy', qty: 1 },
      { id: 'p03', size: 'S', color: 'Black', qty: 1 },
      { id: 'p07', size: 'S', color: 'Blush', qty: 1 },
    ])
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByRole('checkbox', { name: 'Select Heritage Polo' }))
    await user.click(screen.getByRole('checkbox', { name: 'Select Rail Tank Set' }))
    await user.click(screen.getByRole('button', { name: 'Checkout' }))
    const url = new URL(screen.getByTestId('where').textContent!, 'http://x')
    expect(url.pathname).toBe('/checkout')
    expect(url.searchParams.get('source')).toBe('cart')
    expect(url.searchParams.getAll('line')).toEqual(['p01|M|Navy', 'p03|S|Black'])
  })

  it('tells a guest they will sign in before paying, and nobody else', async () => {
    seed([{ id: 'p01', size: 'M', color: 'Navy', qty: 1 }])
    const user = userEvent.setup()
    const { unmount } = renderPage()
    await user.click(screen.getByRole('checkbox', { name: 'Select all items' }))
    expect(screen.getByText("You'll sign in before you pay.")).toBeInTheDocument()
    unmount()

    act(() => setSession({ name: 'Ana Reyes', email: 'ana@silhoufit.com' }))
    renderPage()
    await user.click(screen.getByRole('checkbox', { name: 'Select all items' }))
    expect(screen.queryByText("You'll sign in before you pay.")).toBeNull()
  })
})
