import { act, configure, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MotionGlobalConfig } from 'motion/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../../src/components/toast/ToastProvider'
import { clearCartCache } from '../../src/hooks/useCart'
import { clearProductCache } from '../../src/hooks/useProducts'
import { ProductListError } from '../../src/service/fetchProductList'
import { fetchShopProduct } from '../../src/service/fetchShopProducts'
import { placeOrder } from '../../src/service/placeOrder'
import { clearSession, setSession } from '../../src/service/session'
import { loadLastOrder } from '../../src/utils/checkout'
import { CheckoutPage } from '../../src/views/private/CheckoutPage'
import { POLO as POLO_PIECE, shopProduct, variant } from '../fixtures/shopProducts'
import { wireShopProducts } from '../fixtures/wireCartApi'

vi.mock('../../src/service/fetchShopProducts')
vi.mock('../../src/service/placeOrder', () => ({ placeOrder: vi.fn() }))
const fetchMock = vi.mocked(fetchShopProduct)
const placeMock = vi.mocked(placeOrder)

const JACKET_PIECE = shopProduct('p12', 'Hook Wall Jacket', [variant('p12-m-olive', 'M', 'Olive', { price: 3790, stock: 3 })], { boutique: 'Lumban Loom', channels: ['store'] })
const PULLOVER_PIECE = shopProduct('p05', 'Cable Knit Pullover', [variant('p05-m-sand', 'M', 'Sand', { price: 1500 })], { channels: ['online'] })
const PIECES = [POLO_PIECE, JACKET_PIECE, PULLOVER_PIECE]

const POLO = '/checkout?item=p01&variant=p01-m-navy&qty=2' // 2,100 each, no channels listed
const JACKET = '/checkout?item=p12&variant=p12-m-olive&qty=1' // store only

vi.setConfig({ testTimeout: 30000 }) // typing a whole address is slow when the suite runs in parallel

beforeAll(() => {
  configure({ asyncUtilTimeout: 5000 }) // typing a whole address is slow when the suite runs in parallel
  MotionGlobalConfig.skipAnimations = true
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} }))
  Element.prototype.scrollIntoView = vi.fn()
})

beforeEach(() => {
  vi.resetAllMocks()
  sessionStorage.clear()
  localStorage.clear()
  clearProductCache()
  act(() => setSession({ name: 'Demo Shopper', email: 'demo@silhoufit.com' }))
  clearCartCache()
  wireShopProducts(PIECES)
  placeMock.mockResolvedValue({ orderId: 'SF-261011-ABCD' })
})
afterEach(() => vi.clearAllMocks())

function Where() {
  const { pathname, search } = useLocation()
  return <span data-testid="where">{pathname + search}</span>
}

function renderCheckout(url = POLO) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <ToastProvider>
        <Where />
        <Routes>
          <Route path="/checkout" element={<CheckoutPage />} />
          <Route path="*" element={<p>another page</p>} />
        </Routes>
      </ToastProvider>
    </MemoryRouter>,
  )
}

const where = () => screen.getByTestId('where').textContent
const placeButton = () => screen.getByRole('button', { name: /Place order|Placing order/ })
const form = () => document.querySelector('form')!

async function fillAddress(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Phone number'), '9171234567')
  await user.type(screen.getByLabelText('Street address'), '12 Mabini Street, Brgy. San Roque')
  await user.type(screen.getByLabelText('City'), 'Marikina City')
  await user.type(screen.getByLabelText('Postal code'), '1800')
}

describe('CheckoutPage gate and states', () => {
  it('sends a signed-out visitor to login and back to this checkout', async () => {
    act(() => clearSession())
    renderCheckout()
    await waitFor(() => expect(where()).toMatch(/^\/login\?next=/))
    expect(new URLSearchParams(where()!.split('?')[1]).get('next')).toBe(POLO)
  })

  it('shows a skeleton while the pieces load, then the form', async () => {
    let resolve!: (value: typeof POLO_PIECE) => void
    fetchMock.mockReturnValueOnce(new Promise((r) => (resolve = r)))
    renderCheckout()
    expect(screen.getByRole('status', { name: 'Loading your order' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Checkout' })).toBeInTheDocument()
    resolve(POLO_PIECE)
    expect(await screen.findByRole('heading', { name: 'Heritage Polo' })).toBeInTheDocument()
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('explains a failed catalogue load and recovers on retry', async () => {
    const user = userEvent.setup({ delay: null })
    fetchMock.mockRejectedValueOnce(new ProductListError('network'))
    renderCheckout()
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/couldn't load your order/i)
    await user.click(within(alert).getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('heading', { name: 'Heritage Polo' })).toBeInTheDocument()
  })

  it.each([
    ['an unknown piece', '/checkout?item=nope&variant=p01-m-navy&qty=1'],
    ['no item at all', '/checkout'],
    ['a variant the piece does not have', '/checkout?item=p01&variant=p05-m-sand&qty=1'],
    ['too many', '/checkout?item=p01&variant=p01-m-navy&qty=99'],
  ])('shows "Nothing to check out" for %s', async (_label, url) => {
    renderCheckout(url)
    expect(await screen.findByRole('heading', { name: 'Nothing to check out' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to shop' })).toHaveAttribute('href', '/shop')
  })

  it('has a breadcrumb and a Change link back to the sheet', async () => {
    renderCheckout()
    await screen.findByRole('heading', { name: 'Heritage Polo' })
    const crumbs = screen.getByRole('navigation', { name: 'Breadcrumb' })
    expect(within(crumbs).getByRole('link', { name: 'Shop' })).toHaveAttribute('href', '/shop')
    expect(screen.getByRole('link', { name: /Change/ })).toHaveAttribute('href', '/shop?item=p01&action=buy')
  })

  it('has a unique title and a 150-160 character description', async () => {
    document.title = 'Before'
    renderCheckout()
    await screen.findByRole('heading', { name: 'Heritage Polo' })
    expect(document.title).toBe('Checkout — SilhouFit')
    const description = document.querySelector<HTMLMetaElement>('meta[name="description"]')!.content
    expect(description.length).toBeGreaterThanOrEqual(150)
    expect(description.length).toBeLessThanOrEqual(160)
  })
})

describe('CheckoutPage options and totals', () => {
  it('starts on delivery with the order, shipping, ETA and total', async () => {
    renderCheckout()
    await screen.findByRole('heading', { name: 'Heritage Polo' })
    expect(screen.getByRole('radio', { name: /Delivery/ })).toBeChecked()
    expect(screen.getByText(/Arrives \w{3}, \w{3} \d+ – \w{3}, \w{3} \d+/, { selector: 'p' })).toBeInTheDocument()
    const summary = screen.getByRole('complementary')
    expect(summary).toHaveTextContent('₱4,200.00') // subtotal, 2 × 2,100
    expect(summary).toHaveTextContent('₱99.00')
    expect(summary).toHaveTextContent('₱4,299.00')
  })

  it('switches to pickup: no shipping, the pickup ETA, no address, and "Pay at pickup"', async () => {
    const user = userEvent.setup({ delay: null })
    renderCheckout()
    await screen.findByRole('heading', { name: 'Heritage Polo' })
    expect(screen.getByRole('radio', { name: /Cash on delivery/ })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Delivery address' })).toBeInTheDocument()

    await user.click(screen.getByRole('radio', { name: /Pick up in store/ }))
    const summary = screen.getByRole('complementary')
    expect(summary).toHaveTextContent('Free')
    expect(summary).toHaveTextContent('₱4,200.00')
    expect(summary).toHaveTextContent('Ready at Ayala Atelier tomorrow from 2:00 PM')
    expect(screen.queryByRole('heading', { name: 'Delivery address' })).toBeNull()
    expect(screen.getByRole('radio', { name: /Pay at pickup/ })).toBeInTheDocument()
  })

  it('has no sale discount line, since the API has no sale price', async () => {
    renderCheckout()
    await screen.findByRole('heading', { name: 'Heritage Polo' })
    expect(screen.getByRole('complementary')).not.toHaveTextContent('Sale discount')
  })

  it('disables delivery for a store-only piece, says why, and preselects pickup', async () => {
    renderCheckout(JACKET)
    await screen.findByRole('heading', { name: 'Hook Wall Jacket' })
    expect(screen.getByRole('radio', { name: /Delivery/ })).toBeDisabled()
    expect(screen.getByText('Store-only piece. Pick it up at Lumban Loom.')).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /Pick up in store/ })).toBeChecked()
    expect(screen.queryByRole('heading', { name: 'Delivery address' })).toBeNull()
  })

  it('disables pickup for an online-only piece', async () => {
    renderCheckout('/checkout?item=p05&variant=p05-m-sand&qty=1')
    await screen.findByRole('heading', { name: 'Cable Knit Pullover' })
    expect(screen.getByRole('radio', { name: /Pick up in store/ })).toBeDisabled()
    expect(screen.getByText('Sold online only.')).toBeInTheDocument()
  })

  it('offers GCash and Maya under E-Wallet', async () => {
    const user = userEvent.setup({ delay: null })
    renderCheckout()
    await screen.findByRole('heading', { name: 'Heritage Polo' })
    expect(screen.getByRole('radio', { name: 'GCash' })).toBeChecked()
    await user.click(screen.getByRole('radio', { name: 'Maya' }))
    expect(screen.getByRole('radio', { name: 'Maya' })).toBeChecked()
    await user.click(screen.getByRole('radio', { name: /Cash on delivery/ }))
    expect(screen.queryByRole('radio', { name: 'Maya' })).toBeNull()
  })
})

describe('CheckoutPage address and note', () => {
  it('prefills the full name from the signed-in user', async () => {
    renderCheckout()
    await screen.findByRole('heading', { name: 'Heritage Polo' })
    expect(screen.getByLabelText('Full name')).toHaveValue('Demo Shopper')
  })

  it('validates inline after a field is left, with specific messages, then live', async () => {
    const user = userEvent.setup({ delay: null })
    renderCheckout()
    await screen.findByRole('heading', { name: 'Heritage Polo' })
    const street = screen.getByLabelText('Street address')
    await user.click(street)
    await user.tab()
    expect(screen.getByText('Street address is required.')).toBeInTheDocument()
    await user.type(street, '12 Mabini')
    expect(screen.queryByText('Street address is required.')).toBeNull()

    await user.type(screen.getByLabelText('Postal code'), '18')
    await user.tab()
    expect(screen.getByText('Postal code is 4 digits, like 1100.')).toBeInTheDocument()
    await user.type(screen.getByLabelText('Postal code'), '00')
    expect(screen.queryByText('Postal code is 4 digits, like 1100.')).toBeNull()

    await user.clear(screen.getByLabelText('Full name'))
    await user.tab()
    expect(screen.getByText('Full name is required.')).toBeInTheDocument()
  })

  it('keeps only letters in the name and city, digits in the postal code and phone, with a cap', async () => {
    const user = userEvent.setup({ delay: null })
    renderCheckout()
    await screen.findByRole('heading', { name: 'Heritage Polo' })
    await user.clear(screen.getByLabelText('Full name'))
    await user.type(screen.getByLabelText('Full name'), 'Ana 123 Reyes!')
    expect(screen.getByLabelText('Full name')).toHaveValue('Ana Reyes')
    await user.type(screen.getByLabelText('City'), 'Quezon 2 City')
    expect(screen.getByLabelText('City')).toHaveValue('Quezon City')
    await user.type(screen.getByLabelText('Postal code'), '18a00999')
    expect(screen.getByLabelText('Postal code')).toHaveValue('1800')
    await user.type(screen.getByLabelText('Phone number'), '+63 (917) 123-4567-8999')
    expect(screen.getByLabelText('Phone number')).toHaveValue('91712345678') // the +63 is dropped, digits only, 11 at most
  })

  it('drops the dial code from a pasted international number, and keeps the national number', async () => {
    const user = userEvent.setup({ delay: null })
    renderCheckout()
    await screen.findByRole('heading', { name: 'Heritage Polo' })
    const phone = screen.getByLabelText('Phone number')
    await user.click(phone)
    await user.paste('+63 (917) 123-4567')
    expect(phone).toHaveValue('9171234567')
    await user.clear(phone)
    await user.paste('639171234567')
    expect(phone).toHaveValue('9171234567')
    await user.clear(phone)
    await user.paste('0917 123 4567')
    expect(phone).toHaveValue('9171234567') // the trunk 0 is dropped, as the +63 is
  })

  it('lets a typed +63 finish without losing the number that follows', async () => {
    const user = userEvent.setup({ delay: null })
    renderCheckout()
    await screen.findByRole('heading', { name: 'Heritage Polo' })
    const phone = screen.getByLabelText('Phone number')
    await user.type(phone, '+6')
    expect(phone).toHaveValue('+6')
    await user.type(phone, '39171234567')
    expect(phone).toHaveValue('9171234567')
  })

  it('counts the street address and the note, capping the note at 200', async () => {
    const user = userEvent.setup({ delay: null })
    renderCheckout()
    await screen.findByRole('heading', { name: 'Heritage Polo' })
    await user.type(screen.getByLabelText('Street address'), '12 Mabini')
    expect(screen.getByText('9/120')).toBeInTheDocument()

    const note = screen.getByRole('textbox', { name: 'Note to seller' })
    expect(screen.getByText('0/200')).toBeInTheDocument()
    await user.click(note)
    await user.paste('x'.repeat(260))
    expect(note).toHaveValue('x'.repeat(200))
    expect(screen.getByText('200/200')).toBeInTheDocument()
  })

  it('allows emoji in the note, strips control characters, and sends the cleaned note', async () => {
    const user = userEvent.setup({ delay: null })
    renderCheckout(JACKET) // pickup: no address to fill
    await screen.findByRole('heading', { name: 'Hook Wall Jacket' })
    const note = screen.getByRole('textbox', { name: 'Note to seller' })
    await user.click(note)
    await user.paste('  Gift wrap please 🎁 \u0007  thanks ')
    expect(note).toHaveValue('  Gift wrap please 🎁   thanks ')
    await user.click(placeButton())
    await waitFor(() => expect(placeMock).toHaveBeenCalled())
    expect(placeMock.mock.calls[0][0].note).toBe('Gift wrap please 🎁 thanks')
  })

  it('focuses the first invalid field when placing the order with a bad address', async () => {
    const user = userEvent.setup({ delay: null })
    renderCheckout()
    await screen.findByRole('heading', { name: 'Heritage Polo' })
    await user.click(placeButton())
    expect(placeMock).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Phone number')).toHaveFocus()
    expect(screen.getByText('Phone number is required.')).toBeInTheDocument()
  })
})

describe('CheckoutPage placing the order', () => {
  it('places a delivery order with a normalised phone and goes to the success page, replacing the form', async () => {
    const user = userEvent.setup({ delay: null })
    renderCheckout()
    await screen.findByRole('heading', { name: 'Heritage Polo' })
    await fillAddress(user)
    await user.click(placeButton())

    await waitFor(() => expect(where()).toBe('/checkout/success'))
    const order = placeMock.mock.calls[0][0]
    expect(order).toMatchObject({
      fulfilment: 'delivery',
      payment: 'E-Wallet (GCash)',
      total: 4299,
      items: [{ id: 'p01', size: 'M', color: 'Navy', qty: 2 }],
      address: { fullName: 'Demo Shopper', phone: '+639171234567', city: 'Marikina City', postal: '1800' },
    })
    expect(loadLastOrder()).toMatchObject({ orderId: 'SF-261011-ABCD', total: 4299, payment: 'E-Wallet (GCash)', fulfilment: 'Delivery' })
    expect(loadLastOrder()).toMatchObject({ recipient: 'Demo Shopper', address: '12 Mabini Street, Brgy. San Roque, Marikina City 1800', phone: '+639171234567', shipping: 99 })
  })

  it('sends one request on a double click, disabling the button and marking the form busy', async () => {
    const user = userEvent.setup({ delay: null })
    let finish!: (value: { orderId: string }) => void
    placeMock.mockReturnValue(new Promise((resolve) => (finish = resolve)))
    renderCheckout(JACKET)
    await screen.findByRole('heading', { name: 'Hook Wall Jacket' })
    await user.dblClick(placeButton())
    expect(placeMock).toHaveBeenCalledTimes(1)
    expect(placeButton()).toBeDisabled()
    expect(placeButton()).toHaveTextContent('Placing order…')
    expect(form()).toHaveAttribute('aria-busy', 'true')

    finish({ orderId: 'SF-261011-WXYZ' })
    await waitFor(() => expect(where()).toBe('/checkout/success'))
  })

  it('says what happened, why and what to do on failure, keeps the details and retries', async () => {
    const user = userEvent.setup({ delay: null })
    placeMock.mockRejectedValueOnce(new Error('network'))
    renderCheckout()
    await screen.findByRole('heading', { name: 'Heritage Polo' })
    await fillAddress(user)
    await user.type(screen.getByRole('textbox', { name: 'Note to seller' }), 'Leave with the guard')
    await user.click(placeButton())

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent("We couldn't place your order.")
    expect(alert).toHaveTextContent(/connection/i)
    expect(alert).toHaveTextContent(/try again/i)
    expect(placeButton()).toBeEnabled()
    expect(screen.getByLabelText('Street address')).toHaveValue('12 Mabini Street, Brgy. San Roque')
    expect(screen.getByRole('textbox', { name: 'Note to seller' })).toHaveValue('Leave with the guard')
    expect(where()).toMatch(/^\/checkout\?/)

    await user.click(within(alert).getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(where()).toBe('/checkout/success'))
    expect(placeMock).toHaveBeenCalledTimes(2)
  })

  it('pays cash at pickup for a pickup order, with no address in the request', async () => {
    const user = userEvent.setup({ delay: null })
    renderCheckout(JACKET)
    await screen.findByRole('heading', { name: 'Hook Wall Jacket' })
    await user.click(screen.getByRole('radio', { name: /Pay at pickup/ }))
    await user.click(placeButton())
    await waitFor(() => expect(placeMock).toHaveBeenCalled())
    expect(placeMock.mock.calls[0][0]).toMatchObject({ fulfilment: 'pickup', payment: 'Pay at pickup', address: undefined, total: 3790 })
  })
})
