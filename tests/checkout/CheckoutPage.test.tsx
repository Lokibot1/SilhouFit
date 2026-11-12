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
import { createOrder, OrdersError, quoteShipping } from '../../src/service/ordersApi'
import { clearSession, setSession } from '../../src/service/session'
import { loadLastOrder } from '../../src/utils/checkout'
import { CheckoutPage } from '../../src/views/private/CheckoutPage'
import { POLO as POLO_PIECE, shopProduct, variant } from '../fixtures/shopProducts'
import { createCartStore } from '../fixtures/cartStore'
import { storeProducts, wireCartApi, wireShopProducts } from '../fixtures/wireCartApi'
import { ADDRESS, address } from '../fixtures/addresses'
import { customerOrder } from '../fixtures/orders'

vi.mock('../../src/service/cartApi')
vi.mock('../../src/service/fetchShopProducts')
const addressApi = vi.hoisted(() => ({ loadAddresses: vi.fn(), onAddressesChanged: vi.fn(() => () => {}) }))
vi.mock('../../src/service/addresses', async (original) => ({ ...(await original<typeof import('../../src/service/addresses')>()), ...addressApi }))
vi.mock('../../src/service/ordersApi', async (original) => ({ ...(await original<typeof import('../../src/service/ordersApi')>()), createOrder: vi.fn(), quoteShipping: vi.fn(), loadAllOrders: vi.fn().mockResolvedValue([]) }))
const fetchMock = vi.mocked(fetchShopProduct)
const placeMock = vi.mocked(createOrder)
const quoteMock = vi.mocked(quoteShipping)
const quoted = (shippingFee = 99, quotationId = 'q1', inMs = 5 * 60_000) => ({ quotationId, shippingFee, expiresAt: new Date(Date.now() + inMs).toISOString() })
const PLACED = customerOrder({ orderNumber: 'SF-261011-ABCD', subtotal: 4200, total: 4299, items: [{ ...customerOrder().items[0], name: 'Heritage Polo', qty: 2, unitPrice: 2100, total: 4200 }] })

const PULLOVER_PIECE = shopProduct('p05', 'Cable Knit Pullover', [variant('p05-m-sand', 'M', 'Sand', { price: 1500 })])
const PIECES = [POLO_PIECE, PULLOVER_PIECE]

const POLO = '/checkout?item=p01&variant=p01-m-navy&qty=2' // 2,100 each

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
  wireCartApi(createCartStore(() => storeProducts(PIECES)))
  wireShopProducts(PIECES)
  addressApi.loadAddresses.mockResolvedValue([])
  placeMock.mockResolvedValue(PLACED)
  quoteMock.mockImplementation(async () => quoted())
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

async function useSavedAddress() {
  addressApi.loadAddresses.mockResolvedValue([ADDRESS])
  renderCheckout()
  await screen.findByRole('heading', { name: 'Heritage Polo' })
  await screen.findByText(/12 Rizal Avenue/)
  // Place order waits for the delivery fee.
  await waitFor(() => expect(placeButton()).toBeEnabled())
}

const openAddress = (user: ReturnType<typeof userEvent.setup>) => user.click(screen.getByRole('button', { name: 'Add address' }))
const saveAddress = (user: ReturnType<typeof userEvent.setup>) => user.click(screen.getByRole('button', { name: 'Save address' }))

async function fillAddress(user: ReturnType<typeof userEvent.setup>) {
  await openAddress(user)
  await user.type(screen.getByLabelText('Phone number'), '9171234567')
  await user.type(screen.getByLabelText('Street address'), '12 Mabini Street, Brgy. San Roque')
  await user.type(screen.getByLabelText('City'), 'Marikina City')
  await user.type(screen.getByLabelText('Postal code'), '1800')
  await saveAddress(user)
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
    // A real account places a real order, so nothing is labelled as sample data.
    expect(screen.queryByText('Sample data')).toBeNull()
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
  it('starts on delivery with the order, the quoted shipping, ETA and total', async () => {
    await useSavedAddress()
    expect(screen.getByText(/Arrives \w{3}, \w{3} \d+ – \w{3}, \w{3} \d+/, { selector: 'p' })).toBeInTheDocument()
    const summary = screen.getByRole('complementary')
    expect(summary).toHaveTextContent('₱4,200.00') // subtotal, 2 × 2,100
    expect(summary).toHaveTextContent('₱99.00')
    expect(summary).toHaveTextContent('₱4,299.00')
    expect(quoteMock).toHaveBeenCalledWith(ADDRESS.id, expect.anything())
  })

  it('holds the shipping and total back with a skeleton while the fee loads, and keeps Place order off', async () => {
    let finish!: (value: ReturnType<typeof quoted>) => void
    quoteMock.mockReturnValue(new Promise((resolve) => (finish = resolve)))
    addressApi.loadAddresses.mockResolvedValue([ADDRESS])
    renderCheckout()
    await screen.findByText(/12 Rizal Avenue/)
    const summary = screen.getByRole('complementary')
    expect(summary).toHaveTextContent('Getting delivery fee')
    expect(summary).not.toHaveTextContent('₱4,299.00')
    expect(placeButton()).toBeDisabled()

    finish(quoted())
    await waitFor(() => expect(summary).toHaveTextContent('₱4,299.00'))
    expect(placeButton()).toBeEnabled()
  })

  it('says why the fee is missing, offers Try again, and recovers', async () => {
    const user = userEvent.setup({ delay: null })
    quoteMock.mockRejectedValueOnce(new OrdersError('rate-limit'))
    addressApi.loadAddresses.mockResolvedValue([ADDRESS])
    renderCheckout()
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Too many fee checks in a minute. Wait a minute, then try again.')
    expect(screen.getByRole('complementary')).toHaveTextContent('Unavailable')
    expect(placeButton()).toBeDisabled()
    await user.click(within(alert).getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(screen.getByRole('complementary')).toHaveTextContent('₱4,299.00'))
    expect(screen.queryByRole('alert')).toBeNull()
    expect(quoteMock).toHaveBeenCalledTimes(2)
    expect(placeButton()).toBeEnabled()
  })

  it('explains a missing pin on a locally pinned address and offers to pin it', async () => {
    quoteMock.mockRejectedValueOnce(new OrdersError('no-coordinates'))
    addressApi.loadAddresses.mockResolvedValue([ADDRESS])
    renderCheckout()
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/no map pin on our side/)
    expect(within(alert).getByRole('button', { name: 'Pin your address' })).toBeInTheDocument()
    expect(within(alert).getByRole('button', { name: 'Try again' })).toBeInTheDocument()
    expect(placeButton()).toBeDisabled()
  })

  it('asks for an address instead of a fee when none is saved', async () => {
    renderCheckout()
    await screen.findByRole('heading', { name: 'Heritage Polo' })
    await waitFor(() => expect(screen.getByRole('complementary')).toHaveTextContent('Add an address'))
    expect(quoteMock).not.toHaveBeenCalled()
  })

  it('opens the form for the picked address, not a blank one, from the no-pin line on a pinned address', async () => {
    const user = userEvent.setup({ delay: null })
    quoteMock.mockRejectedValueOnce(new OrdersError('no-coordinates'))
    addressApi.loadAddresses.mockResolvedValue([ADDRESS])
    renderCheckout()
    const alert = await screen.findByRole('alert')
    await user.click(within(alert).getByRole('button', { name: 'Pin your address' }))
    const sheet = within(await screen.findByRole('dialog', { name: 'Delivery address' }))
    expect(await sheet.findByDisplayValue('12 Rizal Avenue')).toBeInTheDocument()
  })

  it('does not ask for a fee for an address without a pin, and offers to pin it', async () => {
    addressApi.loadAddresses.mockResolvedValue([address({ latitude: null, longitude: null })])
    renderCheckout()
    await screen.findByText(/12 Rizal Avenue/)
    expect(await screen.findByRole('button', { name: 'Pin your address' })).toBeInTheDocument()
    expect(quoteMock).not.toHaveBeenCalled()
  })

  it('offers delivery only: no fulfilment choice, the delivery address and cash on delivery', async () => {
    renderCheckout()
    await screen.findByRole('heading', { name: 'Heritage Polo' })
    expect(screen.queryByText('How do you want to get it?')).toBeNull()
    expect(screen.getByRole('heading', { name: 'Delivery address' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /Cash on delivery/ })).toBeInTheDocument()
  })

  it('has no sale discount line, since the API has no sale price', async () => {
    renderCheckout()
    await screen.findByRole('heading', { name: 'Heritage Polo' })
    expect(screen.getByRole('complementary')).not.toHaveTextContent('Sale discount')
  })

  it('selects Pay online by default and lists the methods the payment page accepts', async () => {
    renderCheckout()
    await screen.findByRole('heading', { name: 'Heritage Polo' })
    const online = screen.getByRole('radio', { name: 'Pay online' })
    expect(online).toBeChecked()
    expect(online).toHaveAccessibleDescription(/GCash, Maya, card, GrabPay, online banking or BillEase/)
    expect(screen.getByAltText('GCash')).toBeInTheDocument()
    expect(screen.getByAltText('Maya')).toBeInTheDocument()
    for (const name of ['Card', 'GrabPay', 'Online banking', 'BillEase']) expect(screen.getByText(name)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /View all options/ })).toBeNull()
  })

  it('shows cash on delivery as unavailable: it cannot be chosen by click or keyboard', async () => {
    const user = userEvent.setup({ delay: null })
    renderCheckout()
    await screen.findByRole('heading', { name: 'Heritage Polo' })
    const cash = screen.getByRole('radio', { name: 'Cash on delivery' })
    expect(cash).toBeDisabled()
    expect(cash).toHaveAccessibleDescription('Unavailable for now')
    await user.click(cash)
    expect(cash).not.toBeChecked()
    await user.click(screen.getByText('Cash on delivery'))
    expect(cash).not.toBeChecked()
    const online = screen.getByRole('radio', { name: 'Pay online' })
    online.focus()
    await user.keyboard('{ArrowDown}')
    expect(online).toBeChecked()
    expect(cash).not.toBeChecked()
  })

  it('explains the unavailable cash on delivery in a tooltip when hovering anywhere on its row', async () => {
    const user = userEvent.setup({ delay: null })
    renderCheckout()
    await screen.findByRole('heading', { name: 'Heritage Polo' })
    await user.hover(screen.getByText('Cash on delivery'))
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Unavailable for now')
    await user.unhover(screen.getByText('Cash on delivery'))
    await waitFor(() => expect(screen.queryByRole('tooltip')).toBeNull())
  })

  it('shows the same tooltip when the cash on delivery info button gets keyboard focus', async () => {
    const user = userEvent.setup({ delay: null })
    renderCheckout()
    await screen.findByRole('heading', { name: 'Heritage Polo' })
    // jsdom's :focus-visible depends on earlier pointer events in the file, so treat a focus here as keyboard focus.
    const matches = Element.prototype.matches
    vi.spyOn(Element.prototype, 'matches').mockImplementation(function (this: Element, selector: string) {
      return selector === ':focus-visible' || matches.call(this, selector)
    })
    const info = screen.getByRole('button', { name: 'About Cash on delivery' })
    for (let i = 0; i < 40 && document.activeElement !== info; i++) await user.tab() // the disabled radio is skipped
    expect(info).toHaveFocus()
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Unavailable for now')
  })
})

describe('CheckoutPage address and note', () => {
  it('prefills the full name from the signed-in user', async () => {
    const user = userEvent.setup({ delay: null })
    renderCheckout()
    await screen.findByRole('heading', { name: 'Heritage Polo' })
    await openAddress(user)
    expect(screen.getByLabelText('Full name')).toHaveValue('Demo Shopper')
  })

  it('validates inline after a field is left, with specific messages, then live', async () => {
    const user = userEvent.setup({ delay: null })
    renderCheckout()
    await screen.findByRole('heading', { name: 'Heritage Polo' })
    await openAddress(user)
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
    await openAddress(user)
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
    await openAddress(user)
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
    await openAddress(user)
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
    await openAddress(user)
    await user.type(screen.getByLabelText('Street address'), '12 Mabini')
    expect(screen.getByText('9/120')).toBeInTheDocument()

    const note = screen.getByRole('textbox', { name: 'Note to seller' })
    // One count each for the delivery notes and the note to seller.
    expect(screen.getAllByText('0/200')).toHaveLength(2)
    await user.click(note)
    await user.paste('x'.repeat(260))
    expect(note).toHaveValue('x'.repeat(200))
    expect(screen.getByText('200/200')).toBeInTheDocument()

    const rider = screen.getByRole('textbox', { name: 'Delivery notes' })
    await user.click(rider)
    await user.paste('y'.repeat(260))
    expect(rider).toHaveValue('y'.repeat(200))
  })

  it('allows emoji in the note, strips control characters, and sends the cleaned note', async () => {
    const user = userEvent.setup({ delay: null })
    await useSavedAddress()
    const note = screen.getByRole('textbox', { name: 'Note to seller' })
    await user.click(note)
    await user.paste('  Gift wrap please 🎁 \u0007  thanks ')
    expect(note).toHaveValue('  Gift wrap please 🎁   thanks ')
    await user.click(placeButton())
    await waitFor(() => expect(placeMock).toHaveBeenCalled())
    expect(placeMock.mock.calls[0][0].customerNotes).toBe('Gift wrap please 🎁 thanks')
  })

  it('opens the address sheet instead of placing the order when there is no saved, pinned address', async () => {
    const user = userEvent.setup({ delay: null })
    renderCheckout()
    await screen.findByRole('heading', { name: 'Heritage Polo' })
    await user.click(placeButton())
    expect(placeMock).not.toHaveBeenCalled()
    expect(await screen.findByRole('dialog', { name: 'Delivery address' })).toBeInTheDocument()
  })
})

describe('CheckoutPage placing the order', () => {
  it('places the order for the saved address with only the whitelisted fields and goes to the success page', async () => {
    const user = userEvent.setup({ delay: null })
    await useSavedAddress()
    await user.click(placeButton())

    await waitFor(() => expect(where()).toBe(`/checkout/success?order=${PLACED.id}`))
    expect(placeMock.mock.calls[0][0]).toEqual({ addressId: ADDRESS.id, cartItemIds: ['item-1'], shippingFee: 99, quotationId: 'q1', customerNotes: '' })
    expect(loadLastOrder()).toMatchObject({ orderId: 'SF-261011-ABCD', total: 4299, quotedTotal: 4299, fulfilment: 'Delivery' })
  })

  it('asks for a new fee when the shown one is about to run out, and stops when it changed', async () => {
    const user = userEvent.setup({ delay: null })
    quoteMock.mockResolvedValueOnce(quoted(99, 'q1', 10_000)).mockResolvedValue(quoted(120, 'q2'))
    await useSavedAddress()
    await user.click(placeButton())

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('The delivery fee changed')
    expect(alert).toHaveTextContent('Delivery is now ₱120.00')
    expect(placeMock).not.toHaveBeenCalled()
    await waitFor(() => expect(screen.getByRole('complementary')).toHaveTextContent('₱4,320.00'))

    await waitFor(() => expect(placeButton()).toBeEnabled())
    await user.click(placeButton())
    await waitFor(() => expect(placeMock).toHaveBeenCalledTimes(1))
    expect(placeMock.mock.calls[0][0]).toMatchObject({ quotationId: 'q2' })
    expect(quoteMock).toHaveBeenCalledTimes(2) // the first quote and the one at submit; none more after the change
  })

  it('refreshes the fee after the API says the quote ran out', async () => {
    const user = userEvent.setup({ delay: null })
    placeMock.mockRejectedValueOnce(new OrdersError('quote-expired'))
    await useSavedAddress()
    quoteMock.mockResolvedValue(quoted(120, 'q2'))
    await user.click(placeButton())
    expect(await screen.findByText('The delivery fee changed')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('complementary')).toHaveTextContent('₱4,320.00'))
  })

  it('sends one request on a double click, disabling the button and marking the form busy', async () => {
    const user = userEvent.setup({ delay: null })
    let finish!: (value: typeof PLACED) => void
    placeMock.mockReturnValue(new Promise((resolve) => (finish = resolve)))
    await useSavedAddress()
    await user.dblClick(placeButton())
    expect(placeMock).toHaveBeenCalledTimes(1)
    expect(placeButton()).toBeDisabled()
    expect(placeButton()).toHaveTextContent('Placing order…')
    expect(form()).toHaveAttribute('aria-busy', 'true')

    finish(PLACED)
    await waitFor(() => expect(where()).toMatch(/^\/checkout\/success/))
  })

  it('says what happened, why and what to do on failure, keeps the note and retries', async () => {
    const user = userEvent.setup({ delay: null })
    placeMock.mockRejectedValueOnce(new OrdersError('validation', 'Insufficient stock for "Heritage Polo". Go back to your cart and adjust the quantity.'))
    await useSavedAddress()
    await user.type(screen.getByRole('textbox', { name: 'Note to seller' }), 'Leave with the guard')
    await user.click(placeButton())

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/Insufficient stock/)
    expect(alert).toHaveTextContent(/couldn't place your order/i)
    expect(placeButton()).toBeEnabled()
    expect(screen.getByRole('textbox', { name: 'Note to seller' })).toHaveValue('Leave with the guard')
    expect(where()).toMatch(/^\/checkout\?/)
  })

  it('offers a retry after a dropped connection, and places the order on retry', async () => {
    const user = userEvent.setup({ delay: null })
    placeMock.mockRejectedValueOnce(new OrdersError('network'))
    await useSavedAddress()
    await user.click(placeButton())
    const alert = await screen.findByRole('alert')
    await user.click(within(alert).getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(where()).toMatch(/^\/checkout\/success/))
    expect(placeMock).toHaveBeenCalledTimes(2)
  })

  it('points at the map pin when the address has none', async () => {
    placeMock.mockRejectedValueOnce(new OrdersError('no-coordinates', 'Pin this address on the map so we can deliver to it.'))
    const user = userEvent.setup({ delay: null })
    await useSavedAddress()
    await user.click(placeButton())
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/no map pin/i)
    expect(within(alert).getByRole('button', { name: 'Pin this address' })).toBeInTheDocument()
  })
})

describe('CheckoutPage delivery address card', () => {
  it('shows a prompt and Add address when nothing usable is filled in', async () => {
    renderCheckout()
    await screen.findByRole('heading', { name: 'Heritage Polo' })
    expect(screen.getByText('Add where we should deliver your order.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Change delivery address' })).toBeNull()
  })

  it('keeps the fields out of the page until Change is clicked, and closes the sheet with Cancel', async () => {
    const user = userEvent.setup({ delay: null })
    renderCheckout()
    await screen.findByRole('heading', { name: 'Heritage Polo' })
    await fillAddress(user)
    expect(screen.queryByLabelText('Street address')).toBeNull()
    const card = screen.getByRole('heading', { name: 'Delivery address' }).closest('section')!
    expect(card).toHaveTextContent('Demo Shopper')
    expect(card).toHaveTextContent('+63 9171234567')
    expect(card).toHaveTextContent('12 Mabini Street, Brgy. San Roque, Marikina City 1800')

    await user.click(screen.getByRole('button', { name: 'Change delivery address' }))
    expect(screen.getByLabelText('Street address')).toHaveValue('12 Mabini Street, Brgy. San Roque')
    await user.clear(screen.getByLabelText('City'))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByLabelText('Street address')).toBeNull())
    // Edits are kept, so the incomplete address is asked for again.
    expect(screen.getByText('Add where we should deliver your order.')).toBeInTheDocument()
  })

  it('keeps the sheet open on Save address with an error, and closes it and updates the summary when valid', async () => {
    const user = userEvent.setup({ delay: null })
    renderCheckout()
    await screen.findByRole('heading', { name: 'Heritage Polo' })
    await openAddress(user)
    await user.type(screen.getByLabelText('Phone number'), '9171234567')
    await saveAddress(user)
    expect(screen.getByRole('dialog', { name: 'Delivery address' })).toBeInTheDocument()
    await waitFor(() => expect(screen.getByLabelText('Street address')).toHaveFocus())
    expect(screen.getByText('Street address is required.')).toBeInTheDocument()

    await user.type(screen.getByLabelText('Street address'), '12 Mabini Street')
    await user.type(screen.getByLabelText('City'), 'Marikina City')
    await user.type(screen.getByLabelText('Postal code'), '1800')
    await saveAddress(user)
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Delivery address' })).toBeNull())
    expect(screen.getByText('12 Mabini Street, Marikina City 1800')).toBeInTheDocument()
    expect(screen.getByText('Delivery address saved.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Change delivery address' })).toHaveFocus()
  })
})

describe('CheckoutPage consent line', () => {
  it('links the Terms of Service and the Privacy Policy, opening in a new tab', async () => {
    renderCheckout()
    await screen.findByRole('heading', { name: 'Heritage Polo' })
    const summary = screen.getByRole('complementary')
    expect(summary).toHaveTextContent(
      'By placing an order, you agree to the SilhouFit Terms of Service and sale, and acknowledge that you have read the Privacy Policy.',
    )
    const terms = within(summary).getByRole('link', { name: 'Terms of Service' })
    expect(terms).toHaveAttribute('href', '/terms-of-service')
    expect(terms).toHaveAttribute('target', '_blank')
    expect(terms).toHaveAttribute('rel', expect.stringContaining('noopener'))
    expect(within(summary).getByRole('link', { name: 'Privacy Policy' })).toHaveAttribute('href', '/privacy-policy')
  })
})
