import { expect, test, type Page } from '@playwright/test'
import { ADDRESS, address } from '../fixtures/addresses'
import { setupOrderShop, signInViaForm, type OrderShop } from '../shared/checkoutOrders'
import { NAVY_M } from '../shared/checkoutShop'
import type { OrderReply } from '../shared/ordersApi'
import { DEMO } from '../shared/session'

// The delivery fee is quoted by the courier for the picked saved address (POST /orders/quote-shipping) and shown in the Order summary.
// The orders API is mocked (mockOrders answers quotationId 'q1', fee 99, valid for 5 minutes unless a test overrides `on.quote`).

const CART = '/checkout?source=cart'
const ORDER_URL = /\/checkout\/success\?order=[0-9a-f-]{36}$/
const OFFICE = address({ id: '22222222-2222-4222-8222-222222222222', label: 'Office', recipientName: 'Ben Reyes', phone: '+639181112222', streetAddress: '9 Ayala Avenue', postalCode: '1226', isDefault: false, createdAt: '2026-04-01T08:00:00.000Z' })

let shop: OrderShop
test.beforeEach(async ({ page }) => {
  shop = await setupOrderShop(page)
  shop.cart.seed(NAVY_M.id, 1) // 1,890
})

const placeOrderButton = (page: Page) => page.getByRole('button', { name: /Place order|Placing order/ })
const summary = (page: Page) => page.getByRole('complementary')
const shippingRow = (page: Page) => summary(page).locator('div').filter({ has: page.getByText('Shipping', { exact: true }) }).last()
const totalRow = (page: Page) => summary(page).locator('div').filter({ has: page.getByText('Total', { exact: true }) }).last()
const addressSheet = (page: Page) => page.getByRole('dialog', { name: 'Delivery address' })
const overflows = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
const PIN_MESSAGE = 'Pin your address on the map so we can deliver. Save it here, then place your order.'

const quote = (quotationId: string, shippingFee: number, ms = 5 * 60_000): OrderReply => ({
  status: 201,
  json: { quotationId, courier: 'Lalamove', serviceType: 'MOTORCYCLE', shippingFee, currency: 'PHP', expiresAt: new Date(Date.now() + ms).toISOString() },
})

async function openCheckout(page: Page) {
  await signInViaForm(page)
  await page.goto(CART)
  await expect(page.getByRole('heading', { name: 'Heritage Polo' })).toBeVisible({ timeout: 15000 })
  await expect(page.getByRole('heading', { name: 'Delivery address' }).locator('xpath=ancestor::section')).toContainText('12 Rizal Avenue', { timeout: 15000 })
}

test('the picked address is quoted once, its fee fills the summary, and typing a note asks nothing more', async ({ page }) => {
  await openCheckout(page)
  await expect(shippingRow(page)).toContainText('₱99.00')
  await expect(totalRow(page)).toContainText('₱1,989.00') // 1,890 + 99
  await expect(placeOrderButton(page)).toBeEnabled()
  expect(shop.orders.quotes).toEqual([{ addressId: ADDRESS.id }])

  await page.getByRole('textbox', { name: 'Note to seller' }).fill('Please gift wrap.')
  await page.getByRole('textbox', { name: 'Delivery notes' }).fill('Gate code 1234.')
  await expect(page.getByRole('textbox', { name: 'Note to seller' })).toHaveValue('Please gift wrap.')
  expect(shop.orders.quotes).toHaveLength(1)
})

test('picking a different address asks for exactly one new quote, and its fee replaces the old one', async ({ page }) => {
  shop.addresses.rows.push(OFFICE)
  shop.orders.on.quote = (body) => quote(body.addressId === OFFICE.id ? 'q-office' : 'q-home', body.addressId === OFFICE.id ? 120 : 99)
  await openCheckout(page)
  await expect(shippingRow(page)).toContainText('₱99.00')

  await page.getByRole('button', { name: 'Change delivery address' }).click()
  await page.getByRole('combobox', { name: 'Deliver to' }).click()
  await page.getByRole('option', { name: 'Office' }).click()
  await addressSheet(page).getByRole('button', { name: 'Save address' }).click()
  await expect(addressSheet(page)).toBeHidden()

  await expect(shippingRow(page)).toContainText('₱120.00')
  await expect(totalRow(page)).toContainText('₱2,010.00')
  expect(shop.orders.quotes).toEqual([{ addressId: ADDRESS.id }, { addressId: OFFICE.id }])
})

test('while the fee loads the row is a skeleton, Total is a dash and Place order is disabled', async ({ page }) => {
  let release: () => void = () => {}
  const gate = new Promise<void>((resolve) => (release = resolve))
  await page.route('**/orders/quote-shipping', async (route) => {
    if (route.request().method() === 'POST') await gate
    await route.fallback()
  })
  await signInViaForm(page)
  await page.goto(CART)
  await expect(page.getByRole('heading', { name: 'Delivery address' }).locator('xpath=ancestor::section')).toContainText('12 Rizal Avenue', { timeout: 15000 })

  await expect(shippingRow(page).getByText('Getting delivery fee')).toBeAttached()
  await expect(shippingRow(page)).not.toContainText('₱')
  await expect(totalRow(page)).toContainText('—')
  await expect(placeOrderButton(page)).toBeDisabled()

  release()
  await expect(shippingRow(page)).toContainText('₱99.00')
  await expect(shippingRow(page).getByText('Getting delivery fee')).toHaveCount(0)
  await expect(totalRow(page)).toContainText('₱1,989.00')
  await expect(placeOrderButton(page)).toBeEnabled()
})

test('with no saved address the row says "Add an address" and nothing is quoted', async ({ page }) => {
  shop.addresses.rows.length = 0
  await openCheckoutWithoutAddress(page)
  await expect(shippingRow(page)).toContainText('Add an address')
  expect(shop.orders.quotes).toHaveLength(0)
})

test('an address without a map pin shows "Pin your address", which opens the pin sheet, and nothing is quoted', async ({ page }) => {
  shop.addresses.rows[0].latitude = null
  shop.addresses.rows[0].longitude = null
  await openCheckout(page)
  await expect(shippingRow(page)).not.toContainText('₱')
  await shippingRow(page).getByRole('button', { name: 'Pin your address' }).click()
  await expect(addressSheet(page).getByRole('alert')).toHaveText(PIN_MESSAGE)
  expect(shop.orders.quotes).toHaveLength(0)
  expect(shop.orders.posts).toHaveLength(0)
})

async function openCheckoutWithoutAddress(page: Page) {
  await signInViaForm(page)
  await page.goto(CART)
  await expect(page.getByRole('heading', { name: 'Heritage Polo' })).toBeVisible({ timeout: 15000 })
  await expect(page.getByText('Add where we should deliver your order.')).toBeVisible()
}

test('a failed quote says "Unavailable", disables Place order, and Try again recovers', async ({ page }) => {
  let failing = true
  shop.orders.on.quote = () => (failing ? { status: 500, json: { statusCode: 500, message: 'Internal server error' } } : undefined)
  await openCheckout(page)

  await expect(shippingRow(page)).toContainText('Unavailable')
  await expect(totalRow(page)).toContainText('—')
  const alert = summary(page).getByRole('alert')
  await expect(alert).toContainText("We couldn't get the delivery fee because our servers had a problem. Try again in a moment.")
  await expect(placeOrderButton(page)).toBeDisabled()

  failing = false
  await alert.getByRole('button', { name: 'Try again' }).click()
  await expect(shippingRow(page)).toContainText('₱99.00')
  await expect(summary(page).getByRole('alert')).toHaveCount(0)
  await expect(placeOrderButton(page)).toBeEnabled()
  expect(shop.orders.quotes).toHaveLength(2)
})

const FAILURES: { name: string; reply: OrderReply | 'abort'; copy: string; pin?: boolean }[] = [
  { name: 'too many requests (429)', reply: { status: 429, json: { statusCode: 429, message: 'ThrottlerException: Too Many Requests' } }, copy: 'Too many fee checks in a minute. Wait a minute, then try again.' },
  { name: 'a dropped connection', reply: 'abort', copy: "We couldn't get the delivery fee because the connection dropped. Check your connection, then try again." },
  {
    name: 'an address the server has no coordinates for',
    reply: { status: 400, json: { statusCode: 400, message: 'Address coordinates (latitude and longitude) are required', error: 'Bad Request' } },
    copy: "This address has no map pin on our side, so we can't work out delivery. Pin it on the map, then your fee loads.",
    pin: true,
  },
]
for (const { name, reply, copy, pin } of FAILURES) {
  test(`${name} has its own message and keeps Place order disabled`, async ({ page }) => {
    shop.orders.on.quote = () => reply
    await openCheckout(page)
    await expect(shippingRow(page)).toContainText('Unavailable')
    await expect(summary(page).getByRole('alert')).toContainText(copy)
    await expect(summary(page).getByRole('alert').getByRole('button', { name: 'Try again' })).toBeVisible()
    await expect(summary(page).getByRole('alert').getByRole('button', { name: 'Pin your address' })).toHaveCount(pin ? 1 : 0)
    await expect(placeOrderButton(page)).toBeDisabled()
    expect(shop.orders.posts).toHaveLength(0)
  })
}

test('Place order sends the quote and no shipping fee, and the order is priced with that quote', async ({ page }) => {
  shop.orders.on.quote = () => quote('q-120', 120)
  const lineIds = shop.cart.items.map((line) => line.id)
  await openCheckout(page)
  await page.getByRole('textbox', { name: 'Note to seller' }).fill('Please gift wrap.')
  await placeOrderButton(page).click()
  await expect(page).toHaveURL(ORDER_URL, { timeout: 15000 })

  expect(shop.orders.posts).toEqual([{ addressId: ADDRESS.id, cartItemIds: lineIds, quotationId: 'q-120', customerNotes: 'Please gift wrap.' }])
  expect(shop.orders.quotes).toHaveLength(1) // a fee that is still good is not asked for again
  await expect(page.getByText('₱2,010.00').first()).toBeVisible() // 1,890 + 120
})

test('a quote about to expire is asked again on submit: a changed fee stops with a panel, and the next press orders with the new quote', async ({ page }) => {
  const replies = [quote('q-old', 99, 10_000), quote('q-new', 120)] // the first has under 30 seconds left
  shop.orders.on.quote = () => replies.shift()
  await openCheckout(page)
  await expect(shippingRow(page)).toContainText('₱99.00')

  await placeOrderButton(page).click()
  const panel = page.getByRole('alert').filter({ hasText: 'The delivery fee changed' })
  await expect(panel).toContainText('Delivery is now ₱120.00.')
  await expect(shippingRow(page)).toContainText('₱120.00')
  await expect(totalRow(page)).toContainText('₱2,010.00')
  expect(shop.orders.posts).toHaveLength(0)
  expect(shop.orders.quotes).toHaveLength(2)

  await placeOrderButton(page).click()
  await expect(page).toHaveURL(ORDER_URL, { timeout: 15000 })
  expect(shop.orders.posts).toHaveLength(1)
  expect(shop.orders.posts[0].quotationId).toBe('q-new')
  expect(shop.orders.quotes).toHaveLength(2) // no third quote after the change
  await expect(page.getByText('₱2,010.00').first()).toBeVisible()
})

test('a quote about to expire is asked again on submit: the same fee goes through at once with the fresh quote', async ({ page }) => {
  const replies = [quote('q-old', 99, 10_000), quote('q-new', 99)]
  shop.orders.on.quote = () => replies.shift()
  await openCheckout(page)
  await expect(shippingRow(page)).toContainText('₱99.00')

  await placeOrderButton(page).click()
  await expect(page).toHaveURL(ORDER_URL, { timeout: 15000 })
  expect(shop.orders.quotes).toHaveLength(2)
  expect(shop.orders.posts).toHaveLength(1)
  expect(shop.orders.posts[0].quotationId).toBe('q-new')
  await expect(page.getByText('₱1,989.00').first()).toBeVisible()
})

test('a simulated account keeps the flat fee and makes no quote request', async ({ page }) => {
  await page.addInitScript((email) => localStorage.setItem('silhoufit-session', JSON.stringify({ name: 'Demo Shopper', email, simulated: true })), DEMO.email)
  await page.goto(CART)
  await expect(page.getByRole('heading', { name: 'Heritage Polo' })).toBeVisible({ timeout: 15000 })
  await expect(shippingRow(page)).toContainText('₱150.00') // 1,890 is under the 2,500 free-shipping line
  await expect(totalRow(page)).toContainText('₱2,040.00')
  expect(shop.orders.quotes).toHaveLength(0)
})

test.describe('at 320px', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 700 })
  })

  test('the pinned Place order bar stays in view and disabled, with no horizontal scroll, while the fee is unavailable', async ({ page }) => {
    shop.orders.on.quote = () => ({ status: 429, json: { statusCode: 429, message: 'Too Many Requests' } })
    await openCheckout(page)
    await expect(summary(page).getByRole('alert')).toContainText('Too many fee checks in a minute.')
    await expect(placeOrderButton(page)).toBeDisabled()
    await expect(placeOrderButton(page)).toBeInViewport({ ratio: 1 })
    expect(await overflows(page)).toBe(false)
  })
})
