import { act, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import { clearSession, setSession } from '../../src/service/session'
import { loadLastOrder, saveLastOrder, type PlacedOrder } from '../../src/utils/checkout'
import { OrderSuccessPage } from '../../src/views/private/OrderSuccessPage'

const DELIVERY: PlacedOrder = {
  orderId: 'SF-261011-ABCD',
  items: [
    { name: 'Heritage Polo', size: 'M', color: 'Navy', qty: 2, price: 1890, arReady: false },
    { name: 'Garden Print Dress', size: 'S', color: 'Blush', qty: 1, price: 2290, arReady: false },
  ],
  total: 6169,
  shipping: 99,
  payment: 'E-Wallet (GCash)',
  fulfilment: 'Delivery',
  eta: 'Arrives Wed, Oct 14 – Fri, Oct 16',
  recipient: 'Demo Shopper',
  address: '12 Mabini Street, Brgy. San Roque, Marikina City 1800',
  phone: '+639171234567',
  note: 'Please gift wrap.',
}

const PICKUP: PlacedOrder = {
  orderId: 'SF-261011-WXYZ',
  items: [{ name: 'Heritage Polo', size: 'M', color: 'Navy', qty: 1, price: 1890, arReady: false }],
  total: 1890,
  shipping: 0,
  payment: 'Pay at pickup',
  fulfilment: 'Pick up in store',
  eta: 'Ready at Ayala Atelier tomorrow from 2:00 PM',
  pickupAt: 'Ayala Atelier',
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/checkout/success']}>
      <Routes>
        <Route path="/checkout/success" element={<OrderSuccessPage />} />
        <Route path="*" element={<p>another page</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  sessionStorage.clear()
  act(() => setSession({ name: 'Demo Shopper', email: 'demo@silhoufit.com' }))
})

describe('OrderSuccessPage', () => {
  it('celebrates, with the on-brand copy and the reference', () => {
    saveLastOrder(DELIVERY)
    renderPage()
    expect(screen.getByRole('heading', { level: 1, name: 'Order placed' })).toHaveFocus()
    expect(screen.getByText("Reserved for you. We'll keep you posted until it's in your hands.")).toBeInTheDocument()
    expect(screen.getByText('SF-261011-ABCD')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to shop' })).toHaveAttribute('href', '/shop')
  })

  it('lists every item with its price, then shipping and the total', () => {
    saveLastOrder(DELIVERY)
    renderPage()
    expect(screen.getByText('Heritage Polo')).toBeInTheDocument()
    expect(screen.getByText(/Size M · Navy · ₱1,890.00 ×/)).toBeInTheDocument()
    expect(screen.getByText('₱3,780.00')).toBeInTheDocument() // 2 × 1,890
    expect(screen.getByText('Garden Print Dress')).toBeInTheDocument()
    expect(screen.getByText('₱2,290.00', { selector: 'span.font-semibold' })).toBeInTheDocument()
    expect(screen.getByText('₱99.00')).toBeInTheDocument()
    expect(screen.getByText('₱6,169.00')).toBeInTheDocument()
  })

  it('shows where a delivery goes: name, address, phone, payment, ETA and the note as plain text', () => {
    saveLastOrder({ ...DELIVERY, note: '<img src=x onerror=alert(1)> Leave at the gate' })
    renderPage()
    expect(screen.getByRole('heading', { name: 'On its way to' })).toBeInTheDocument()
    expect(screen.getByText('Demo Shopper')).toBeInTheDocument()
    expect(screen.getByText('12 Mabini Street, Brgy. San Roque, Marikina City 1800')).toBeInTheDocument()
    expect(screen.getByText('+639171234567')).toBeInTheDocument()
    expect(screen.getByText('E-Wallet (GCash)')).toBeInTheDocument()
    expect(screen.getByText('Arrives Wed, Oct 14 – Fri, Oct 16')).toBeInTheDocument()
    // The note is text, never markup.
    expect(screen.getByText('<img src=x onerror=alert(1)> Leave at the gate')).toBeInTheDocument()
    expect(document.querySelector('img')).toBeNull()
  })

  it('shows the boutique, free shipping and no address for a pickup order', () => {
    saveLastOrder(PICKUP)
    renderPage()
    expect(screen.getByRole('heading', { name: 'Waiting for you at' })).toBeInTheDocument()
    expect(screen.getByText('Ayala Atelier')).toBeInTheDocument()
    expect(screen.getByText('Free')).toBeInTheDocument()
    expect(screen.getByText('Ready at Ayala Atelier tomorrow from 2:00 PM')).toBeInTheDocument()
    expect(screen.queryByText('Phone')).toBeNull()
    expect(screen.queryByText('Your note')).toBeNull()
  })

  it('has a unique title and a 150-160 character description', () => {
    saveLastOrder(PICKUP)
    renderPage()
    expect(document.title).toBe('Order placed — SilhouFit')
    const description = document.querySelector<HTMLMetaElement>('meta[name="description"]')!.content
    expect(description.length).toBeGreaterThanOrEqual(150)
    expect(description.length).toBeLessThanOrEqual(160)
  })

  it('offers the AR try-on link only when an item is AR-ready', () => {
    saveLastOrder(PICKUP)
    const { unmount } = renderPage()
    expect(screen.queryByRole('link', { name: 'Try it on with AR' })).toBeNull()
    unmount()

    saveLastOrder({ ...PICKUP, items: [{ ...PICKUP.items[0], arReady: true }] })
    renderPage()
    expect(screen.getByRole('link', { name: 'Try it on with AR' })).toHaveAttribute('href', '/#ar-fitting')
  })

  it('drops the order from session storage when the page is left, so personal details do not linger', () => {
    saveLastOrder(DELIVERY)
    const { unmount } = renderPage()
    expect(loadLastOrder()).not.toBeNull()
    unmount()
    expect(loadLastOrder()).toBeNull()
    expect(sessionStorage.getItem('silhoufit-last-order')).toBeNull()
  })

  it('shows an empty state when there is no saved order, with a way back to the shop', () => {
    renderPage()
    expect(screen.getByRole('heading', { level: 1, name: 'No recent order' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to shop' })).toHaveAttribute('href', '/shop')
  })

  it('treats corrupt saved data as no order', () => {
    sessionStorage.setItem('silhoufit-last-order', '{"orderId":5}')
    renderPage()
    expect(screen.getByRole('heading', { level: 1, name: 'No recent order' })).toBeInTheDocument()
  })

  it('shows "No recent order" at once when the session ends, dropping the name, address, phone and note', async () => {
    saveLastOrder(DELIVERY)
    renderPage()
    expect(screen.getByText('+639171234567')).toBeInTheDocument()

    act(() => clearSession()) // signing out, here or in another tab
    expect(await screen.findByRole('heading', { level: 1, name: 'No recent order' })).toBeInTheDocument()
    for (const detail of ['Demo Shopper', '12 Mabini Street, Brgy. San Roque, Marikina City 1800', '+639171234567', 'Please gift wrap.']) {
      expect(screen.queryByText(detail)).toBeNull()
    }
    await waitFor(() => expect(loadLastOrder()).toBeNull())
  })

  it('shows nothing of an order to someone who is not signed in', () => {
    act(() => clearSession())
    saveLastOrder(DELIVERY)
    renderPage()
    expect(screen.getByRole('heading', { level: 1, name: 'No recent order' })).toBeInTheDocument()
    expect(loadLastOrder()).toBeNull()
  })
})
