import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MotionGlobalConfig } from 'motion/react'
import { useState } from 'react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { CartSheet } from '../../src/components/shop/CartSheet'
import { PRODUCTS } from '../../src/data/products'
import { primeProductsCache, resetProductsCache } from '../../src/hooks/useProducts'

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
  })
  resetProductsCache()
  primeProductsCache(CATALOGUE)
})

function Where() {
  const { pathname, search } = useLocation()
  return <span data-testid="where">{pathname + search}</span>
}

function Harness({ guest = false }: { guest?: boolean }) {
  const [open, setOpen] = useState(false)
  return (
    <MemoryRouter initialEntries={['/shop']}>
      <Where />
      <button type="button" onClick={() => setOpen(true)}>
        Open cart
      </button>
      <CartSheet open={open} onClose={() => setOpen(false)} guest={guest} />
      <Routes>
        <Route path="*" element={null} />
      </Routes>
    </MemoryRouter>
  )
}

async function openCart(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Open cart' }))
  return screen.findByRole('dialog', { name: 'Your cart' })
}

describe('CartSheet', () => {
  it('shows each line with its spec, price, quantity and line total, and the subtotal', async () => {
    seed([
      { id: 'p01', size: 'M', color: 'Navy', qty: 2 },
      { id: 'p07', size: 'S', color: 'Blush', qty: 1 }, // 2,890 listed, 2,290 on sale
    ])
    const user = userEvent.setup()
    render(<Harness />)
    const cart = await openCart(user)
    expect(within(cart).getByRole('heading', { name: 'Heritage Polo' })).toBeInTheDocument()
    expect(within(cart).getByText('Size M · Navy')).toBeInTheDocument()
    expect(within(cart).getByText('₱1,890.00 each')).toBeInTheDocument()
    expect(within(cart).getByText('₱3,780.00')).toBeInTheDocument() // 2 × 1,890
    expect(within(cart).getAllByText('₱2,290.00').length).toBeGreaterThan(0) // the sale price is what counts
    expect(within(cart).getByText('Subtotal (3 items)')).toBeInTheDocument()
    expect(within(cart).getByText('₱6,070.00')).toBeInTheDocument()
    expect(within(cart).getByRole('button', { name: 'Checkout' })).toBeEnabled()
  })

  it('changes a quantity with the stepper, capped by stock', async () => {
    seed([{ id: 'p02', size: 'M', color: 'Black', qty: 3 }]) // 4 in stock
    const user = userEvent.setup()
    render(<Harness />)
    const cart = await openCart(user)
    const up = within(cart).getByRole('button', { name: 'Increase quantity of Fence-Line Blazer' })
    const down = within(cart).getByRole('button', { name: 'Decrease quantity of Fence-Line Blazer' })
    await user.click(up)
    expect(stored()[0].qty).toBe(4)
    expect(up).toBeDisabled()
    await user.click(down)
    await user.click(down)
    await user.click(down)
    expect(stored()[0].qty).toBe(1)
    expect(down).toBeDisabled()
  })

  it("caps one line by what the piece's other lines already hold", async () => {
    seed([
      { id: 'p02', size: 'S', color: 'Black', qty: 1 },
      { id: 'p02', size: 'M', color: 'Black', qty: 2 },
    ])
    const user = userEvent.setup()
    render(<Harness />)
    const cart = await openCart(user)
    const [first] = within(cart).getAllByRole('button', { name: 'Increase quantity of Fence-Line Blazer' })
    await user.click(first) // 4 in stock: 2 held by the other line, so this one stops at 2
    expect(first).toBeDisabled()
    expect(stored().find((l: { size: string }) => l.size === 'S').qty).toBe(2)
  })

  it('removes a line and offers Undo inside the drawer, which puts it back', async () => {
    seed([{ id: 'p01', size: 'M', color: 'Navy', qty: 2 }])
    const user = userEvent.setup()
    render(<Harness />)
    const cart = await openCart(user)
    await user.click(within(cart).getByRole('button', { name: 'Remove Heritage Polo' }))
    expect(stored()).toEqual([])
    expect(within(cart).getByRole('status')).toHaveTextContent('Removed Heritage Polo.')
    expect(within(cart).getByRole('heading', { name: 'Your cart is empty' })).toBeInTheDocument()

    await user.click(within(cart).getByRole('button', { name: /Undo/ }))
    expect(stored()).toEqual([{ id: 'p01', size: 'M', color: 'Navy', qty: 2 }])
    expect(within(cart).queryByText(/Removed Heritage Polo/)).toBeNull()
    expect(within(cart).getByRole('heading', { name: 'Heritage Polo' })).toBeInTheDocument()
  })

  it('forgets the Undo when the drawer closes', async () => {
    seed([{ id: 'p01', size: 'M', color: 'Navy', qty: 1 }])
    const user = userEvent.setup()
    render(<Harness />)
    let cart = await openCart(user)
    await user.click(within(cart).getByRole('button', { name: 'Remove Heritage Polo' }))
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    cart = await openCart(user)
    expect(within(cart).queryByText(/Removed Heritage Polo/)).toBeNull()
  })

  it('shows the empty state, disables Checkout and closes with Keep shopping', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    const cart = await openCart(user)
    expect(within(cart).getByRole('heading', { name: 'Your cart is empty' })).toBeInTheDocument()
    expect(within(cart).getByText('Subtotal (0 items)')).toBeInTheDocument()
    expect(within(cart).getByRole('button', { name: 'Checkout' })).toBeDisabled()
    await user.click(within(cart).getByRole('button', { name: 'Keep shopping' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('shows lines that cannot be bought with their reason, leaves them out of the subtotal, and lets them be removed', async () => {
    seed([
      { id: 'p03', size: 'S', color: 'Black', qty: 1 }, // 790
      { id: 'gone', size: 'M', color: 'Navy', qty: 1 },
      { id: 'p24', size: 'M', color: 'Indigo', qty: 1 }, // sold out
      { id: 'p01', qty: 1 }, // a line from before sizes existed
    ])
    const user = userEvent.setup()
    render(<Harness />)
    const cart = await openCart(user)
    expect(within(cart).getByText('No longer in the catalogue')).toBeInTheDocument()
    expect(within(cart).getByText('Sold out')).toBeInTheDocument()
    expect(within(cart).getByText(/Size and colour were not chosen/)).toBeInTheDocument()
    expect(within(cart).getByText('Subtotal (1 item)')).toBeInTheDocument()
    expect(within(cart).getAllByText('₱790.00').length).toBeGreaterThan(0)

    await user.click(within(cart).getByRole('button', { name: 'Remove Field Denim Jacket' }))
    expect(stored()).toHaveLength(3)
    expect(within(cart).queryByText('Sold out')).toBeNull()
  })

  it('shows skeleton lines while the catalogue loads', async () => {
    seed([{ id: 'p01', size: 'M', color: 'Navy', qty: 1 }])
    resetProductsCache()
    const user = userEvent.setup()
    render(<Harness />)
    const cart = await openCart(user)
    expect(within(cart).getByRole('status', { name: 'Loading your cart' })).toBeInTheDocument()
    expect(within(cart).getByRole('button', { name: 'Checkout' })).toBeDisabled()
    act(() => primeProductsCache(CATALOGUE))
    expect(await within(cart).findByRole('heading', { name: 'Heritage Polo' })).toBeInTheDocument()
  })

  it('goes to /checkout?source=cart from Checkout and closes', async () => {
    seed([{ id: 'p01', size: 'M', color: 'Navy', qty: 1 }])
    const user = userEvent.setup()
    render(<Harness />)
    const cart = await openCart(user)
    await user.click(within(cart).getByRole('button', { name: 'Checkout' }))
    expect(screen.getByTestId('where')).toHaveTextContent('/checkout?source=cart')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('tells a guest they will sign in before paying, and nobody else', async () => {
    seed([{ id: 'p01', size: 'M', color: 'Navy', qty: 1 }])
    const user = userEvent.setup()
    const { unmount } = render(<Harness guest />)
    expect(within(await openCart(user)).getByText("You'll sign in before you pay.")).toBeInTheDocument()
    unmount()

    render(<Harness />)
    expect(within(await openCart(user)).queryByText("You'll sign in before you pay.")).toBeNull()
  })

  it('traps focus, closes on Escape and returns focus to the opener', async () => {
    seed([{ id: 'p01', size: 'M', color: 'Navy', qty: 1 }])
    const user = userEvent.setup()
    render(<Harness />)
    const opener = screen.getByRole('button', { name: 'Open cart' })
    const cart = await openCart(user)
    for (let i = 0; i < 15; i++) {
      await user.tab()
      expect(cart.contains(document.activeElement)).toBe(true)
    }
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(opener).toHaveFocus()
  })
})
