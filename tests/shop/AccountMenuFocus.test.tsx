import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MotionGlobalConfig } from 'motion/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { ShopNavbar } from '../../src/components/ShopNavbar'
import { ToastProvider } from '../../src/components/toast/ToastProvider'
import { ThemeProvider } from '../../src/contexts/ThemeContext'
import { PRODUCTS } from '../../src/data/products'
import { primeProductsCache, resetProductsCache } from '../../src/hooks/useProducts'
import { clearSession, setSession } from '../../src/service/session'
import { loadLastOrder, saveLastOrder } from '../../src/utils/checkout'

// The real session store, so signing out really swaps the avatar for the Sign in icon.
beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true
  const observer = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal('IntersectionObserver', observer)
  vi.stubGlobal('ResizeObserver', observer)
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} }))
})
beforeEach(() => {
  sessionStorage.clear()
  resetProductsCache()
  primeProductsCache({ products: PRODUCTS, syncedAt: '2026-10-10T15:05:00' })
  act(() => setSession({ name: 'Ana Reyes', email: 'ana@example.com' }))
})

function renderBar() {
  return render(
    <MemoryRouter initialEntries={['/shop']}>
      <ThemeProvider>
        <ToastProvider>
          <ShopNavbar />
        </ToastProvider>
      </ThemeProvider>
    </MemoryRouter>,
  )
}

describe('account menu focus', () => {
  it('closes on Tab and puts focus back on the avatar, instead of dropping it on the page', async () => {
    const user = userEvent.setup()
    renderBar()
    const avatar = screen.getByRole('button', { name: 'Account, Ana Reyes' })
    await user.click(avatar)
    expect(screen.getByRole('button', { name: 'Sign out' })).toHaveFocus()
    await user.tab()
    await waitFor(() => expect(screen.queryByRole('group', { name: 'Account' })).toBeNull())
    expect(avatar).toHaveFocus()
    expect(document.body).not.toHaveFocus()
  })

  it('also closes on Shift+Tab', async () => {
    const user = userEvent.setup()
    renderBar()
    await user.click(screen.getByRole('button', { name: 'Account, Ana Reyes' }))
    await user.tab({ shift: true })
    await waitFor(() => expect(screen.queryByRole('group', { name: 'Account' })).toBeNull())
    expect(screen.getByRole('button', { name: 'Account, Ana Reyes' })).toHaveFocus()
  })

  it('moves focus to the Sign in icon after signing out, and forgets a placed order', async () => {
    saveLastOrder({
      orderId: 'SF-261011-ABCD',
      items: [{ name: 'Heritage Polo', size: 'M', color: 'Navy', qty: 1, price: 1890, arReady: false }],
      total: 1989,
      shipping: 99,
      payment: 'Cash on delivery',
      fulfilment: 'Delivery',
      eta: 'Arrives Wed, Oct 14 – Fri, Oct 16',
      recipient: 'Ana Reyes',
      address: '12 Mabini Street, Marikina City 1800',
      phone: '+639171234567',
    })
    const user = userEvent.setup()
    renderBar()
    await user.click(screen.getByRole('button', { name: 'Account, Ana Reyes' }))
    await user.click(screen.getByRole('button', { name: 'Sign out' }))
    const signIn = await screen.findByRole('link', { name: 'Sign in' })
    await waitFor(() => expect(signIn).toHaveFocus())
    expect(loadLastOrder()).toBeNull()
    act(() => clearSession())
  })
})
