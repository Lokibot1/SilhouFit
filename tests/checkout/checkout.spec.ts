import { expect, test, type Locator, type Page, type Route } from '@playwright/test'
import { ADDRESS, address } from '../fixtures/addresses'
import manila from '../fixtures/nominatim/manila.json' with { type: 'json' }
import { setupOrderShop, signInViaForm, type OrderShop } from '../shared/checkoutOrders'
import { buyNow, NAVY_M, POLO as POLO_PIECE, TANK } from '../shared/checkoutShop'
import { order } from '../shared/ordersApi'
import { mockPsgc } from '../shared/psgc'
import { DEMO, signedIn } from '../shared/session'

// Checkout places a real order: POST /orders with a saved, pinned address and the cart lines' ids. Cash on delivery is disabled
// (the API has no such method), so Pay online is the one payment (the method is picked on the provider's page), and the order is held as Awaiting payment. Everything is mocked.

const MIN_TARGET = 44
const COMPACT_TARGET = 36
const POLO = buyNow(POLO_PIECE, NAVY_M.id) // 1,890, Ayala Atelier
const TANK_VARIANT = TANK.variants[0].id
const CART = '/checkout?source=cart'
const ORDER_URL = /\/checkout\/success\?order=[0-9a-f-]{36}$/

let shop: OrderShop
test.beforeEach(async ({ page }) => {
  shop = await setupOrderShop(page)
})

const placeOrderButton = (page: Page) => page.getByRole('button', { name: /Place order|Placing order/ })
const summary = (page: Page) => page.getByRole('complementary')
const overflows = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
const addressSheet = (page: Page) => page.getByRole('dialog', { name: 'Delivery address' })
const PIN_MESSAGE = 'Pin your address on the map so we can deliver. Save it here, then place your order.'

/** Opens a checkout URL signed in through the form (the saved addresses and the order API need a real token). */
async function openCheckout(page: Page, url = POLO, heading = 'Heritage Polo') {
  await signInViaForm(page)
  await page.goto(url)
  await expect(page.getByRole('heading', { name: heading })).toBeVisible({ timeout: 15000 })
  // The saved address has filled the card.
  await expect(page.getByRole('heading', { name: 'Delivery address' }).locator('xpath=ancestor::section')).toContainText('12 Rizal Avenue', { timeout: 15000 })
}

// Keyboard-only: press Tab from wherever focus is until the target holds it.
async function tabTo(page: Page, target: Locator) {
  for (let i = 0; i < 80; i++) {
    if (await target.evaluate((el) => el === document.activeElement)) return
    await page.keyboard.press('Tab')
  }
  throw new Error('Never reached the target by pressing Tab')
}

async function expectTarget(control: Locator, label: string, compact: boolean) {
  const coarse = await control.page().evaluate(() => matchMedia('(pointer: coarse)').matches)
  const min = compact && !coarse ? COMPACT_TARGET : MIN_TARGET
  await control.scrollIntoViewIfNeeded()
  const box = (await control.boundingBox())!
  expect(box, `${label} is laid out`).not.toBeNull()
  expect(box.height, `${label} height`).toBeGreaterThanOrEqual(min)
}

const CORS = { 'access-control-allow-origin': '*' }

test('a signed-out visitor is sent to login and returns to the same checkout', async ({ page }) => {
  await page.goto(POLO)
  await expect(page).toHaveURL((url) => url.pathname === '/login' && url.searchParams.get('next') === POLO)
  await page.getByLabel('Email', { exact: true }).fill(DEMO.email)
  await page.getByLabel('Password', { exact: true }).fill(DEMO.password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL(/\/checkout\?item=/, { timeout: 15000 })
  await expect(page.getByRole('heading', { name: 'Heritage Polo' })).toBeVisible()
})

test('shows "Nothing to check out" for a link that does not match a piece', async ({ page }) => {
  await signedIn(page)
  await page.goto(`/checkout?item=${POLO_PIECE.id}&variant=no-such-variant&qty=1`)
  await expect(page.getByRole('heading', { name: 'Nothing to check out' })).toBeVisible({ timeout: 15000 })
  await page.getByRole('link', { name: 'Back to shop' }).click()
  await expect(page).toHaveURL(/\/shop$/)
})

test('Buy now to success: delivery total and ETA, the order is Awaiting payment, then Back does not return to the form', async ({ page }) => {
  await signInViaForm(page)
  await page.goto('/shop')
  await expect(page.getByRole('article').first()).toBeVisible({ timeout: 15000 })
  await page.getByRole('button', { name: 'Buy Heritage Polo' }).click()
  const sheet = page.getByRole('dialog', { name: 'Choose options' })
  await expect(sheet.getByRole('button', { name: 'Buy now' })).toBeInViewport({ ratio: 1 }) // the sheet has finished sliding in
  await sheet.getByRole('radio', { name: 'M', exact: true }).check({ force: true })
  await sheet.getByRole('radio', { name: 'Navy' }).check({ force: true })
  await sheet.getByRole('button', { name: 'Buy now' }).click()
  await expect(page).toHaveURL((url) => url.pathname + url.search === POLO)

  await expect(summary(page)).toContainText('₱1,989.00') // 1,890 + 99 delivery
  await expect(summary(page)).toContainText(/Arrives \w{3}, \w{3} \d+ – \w{3}, \w{3} \d+/)
  await expect(page.getByRole('radio', { name: 'Pay online' })).toBeChecked()

  await placeOrderButton(page).click()
  await expect(page).toHaveURL(ORDER_URL, { timeout: 15000 })
  await expect(page.getByRole('heading', { level: 1, name: 'Order placed' })).toBeFocused()
  await expect(page.getByText(/^SHF-\d{8}-\d{6}$/)).toBeVisible()
  await expect(page.getByText('Awaiting payment', { exact: true })).toBeVisible()
  await expect(page.getByText('₱1,989.00').first()).toBeVisible()

  // Buy now put the piece in the cart only for the order, then took it out again.
  expect(shop.orders.posts).toHaveLength(1)
  expect(shop.cart.items).toHaveLength(0)

  await page.goBack()
  await expect(page).toHaveURL(/\/shop$/)

  await page.goForward()
  await page.getByRole('link', { name: 'Back to shop' }).click()
  await expect(page).toHaveURL(/\/shop$/)
})

test('placing an order from the cart sends only the address, the line ids and the quote, then shows the order', async ({ page }) => {
  shop.cart.seed(NAVY_M.id, 1)
  shop.cart.seed(TANK_VARIANT, 2)
  const lineIds = shop.cart.items.map((line) => line.id)
  await openCheckout(page, CART)
  await expect(summary(page)).toContainText('Subtotal (3 items)')
  await page.getByRole('textbox', { name: 'Note to seller' }).fill('Please gift wrap.')
  await placeOrderButton(page).click()

  await expect(page).toHaveURL(ORDER_URL, { timeout: 15000 })
  expect(shop.orders.posts).toEqual([{ addressId: ADDRESS.id, cartItemIds: lineIds, quotationId: 'q1', customerNotes: 'Please gift wrap.' }])
  // The server works out the totals and takes no payment method or shipping fee: none is ever sent.
  expect(Object.keys(shop.orders.posts[0]).sort()).toEqual(['addressId', 'cartItemIds', 'customerNotes', 'quotationId'])

  const placed = shop.orders.orders[0]
  await expect(page).toHaveURL(`/checkout/success?order=${placed.id}`)
  await expect(page.getByRole('heading', { level: 1, name: 'Order placed' })).toBeFocused()
  await expect(page.getByText(placed.orderNumber)).toBeVisible()
  await expect(page.getByText('Awaiting payment', { exact: true })).toBeVisible()
  await expect(page.getByText('Heritage Polo')).toBeVisible()
  await expect(page.getByText('Rail Tank Set')).toBeVisible()
  await expect(page.getByText('Please gift wrap.')).toBeVisible()
  await expect(page.getByText('12 Rizal Avenue, Barangay 176, City of Manila 1000')).toBeVisible()

  // The ordered lines left the cart.
  await expect(page.getByRole('link', { name: 'Cart, 0 items' })).toBeVisible()
  expect(shop.cart.items).toHaveLength(0)

  await page.getByRole('link', { name: 'View order' }).click()
  await expect(page).toHaveURL(`/orders/${placed.id}`)
  await expect(page.getByRole('heading', { level: 1, name: placed.orderNumber })).toBeVisible()
  await expect(page.locator('[data-status="PENDING_PAYMENT"]')).toHaveText('Awaiting payment')
})

test('without a note the order carries no customerNotes key, and My orders opens the list', async ({ page }) => {
  shop.cart.seed(NAVY_M.id, 1)
  await openCheckout(page, CART)
  await placeOrderButton(page).click()
  await expect(page).toHaveURL(ORDER_URL, { timeout: 15000 })
  expect(Object.keys(shop.orders.posts[0]).sort()).toEqual(['addressId', 'cartItemIds', 'quotationId'])

  await page.getByRole('link', { name: 'My orders' }).click()
  await expect(page).toHaveURL(/\/orders$/)
  await expect(page.getByRole('article', { name: shop.orders.orders[0].orderNumber })).toBeVisible()
})

test('Pay online is the default and cash on delivery is shown but unavailable, with a tooltip', async ({ page }) => {
  await openCheckout(page)
  const cod = page.getByRole('radio', { name: 'Cash on delivery' })
  await expect(cod).toBeDisabled()
  await expect(cod).not.toBeChecked()
  await expect(cod).toHaveAccessibleDescription('Unavailable for now')
  await expect(page.getByRole('radio', { name: 'Pay online' })).toBeChecked()
  await expect(page.getByText("You'll pay on a secure payment page after placing your order.")).toBeVisible()
  await expect(page.getByRole('button', { name: 'View all options' })).toHaveCount(0)

  // Clicking the disabled row changes nothing.
  const row = cod.locator('xpath=ancestor::label')
  await row.click({ force: true })
  await expect(page.getByRole('radio', { name: 'Pay online' })).toBeChecked()

  // Hovering anywhere on the row fades the tooltip in; moving off fades it out.
  await page.locator('legend', { hasText: 'Payment method' }).hover() // the click left the pointer on the row
  await row.hover()
  await expect(page.getByRole('tooltip', { name: 'Unavailable for now' })).toHaveText('Unavailable for now')
  await page.locator('legend', { hasText: 'Payment method' }).hover()
  await expect(page.getByRole('tooltip', { name: 'Unavailable for now' })).toHaveCount(0)

  await placeOrderButton(page).click()
  await expect(page).toHaveURL(ORDER_URL, { timeout: 15000 })
  expect(Object.keys(shop.orders.posts[0])).not.toContain('paymentMethod') // the choice is not sent
})

test('keyboard focus on the cash on delivery info button shows its tooltip', async ({ page }) => {
  await openCheckout(page)
  await tabTo(page, page.getByRole('button', { name: 'About Cash on delivery' }))
  await expect(page.getByRole('tooltip', { name: 'Unavailable for now' })).toHaveText('Unavailable for now')
})

test('with no saved address, Place order opens the address sheet asking for a map pin and sends nothing', async ({ page }) => {
  shop.addresses.rows.length = 0
  await signInViaForm(page)
  await page.goto(POLO)
  await expect(page.getByRole('heading', { name: 'Heritage Polo' })).toBeVisible({ timeout: 15000 })
  await expect(page.getByText('Add where we should deliver your order.')).toBeVisible()
  await placeOrderButton(page).click()
  await expect(addressSheet(page)).toBeVisible()
  await expect(addressSheet(page).getByRole('alert')).toHaveText(PIN_MESSAGE)
  await expect(page).toHaveURL(/\/checkout\?/)
  expect(shop.orders.posts).toHaveLength(0)
  expect(shop.cart.calls.filter((call) => call.method === 'POST')).toHaveLength(0) // Buy now did not touch the cart either
  await addressSheet(page).getByRole('button', { name: 'Cancel' }).click()
  await expect(addressSheet(page)).toBeHidden()
})

test('an address edited after it was picked is no longer a saved one: the sheet asks for a pin and nothing is posted', async ({ page }) => {
  shop.cart.seed(NAVY_M.id, 1)
  await openCheckout(page, CART)
  await page.getByRole('button', { name: 'Change delivery address' }).click()
  const street = addressSheet(page).getByRole('textbox', { name: 'Street address', exact: true })
  await street.fill('99 Another Street')
  await addressSheet(page).getByRole('button', { name: 'Save address' }).click()
  await expect(addressSheet(page)).toBeHidden()
  await expect(page.getByText('99 Another Street, City of Manila 1000')).toBeVisible()

  await placeOrderButton(page).click()
  await expect(addressSheet(page).getByRole('alert')).toHaveText(PIN_MESSAGE)
  expect(shop.orders.posts).toHaveLength(0)
  expect(shop.addresses.bodies).toHaveLength(0)
})

test('a saved address that has no map pin asks for a pin before any request: no fee quote, no order', async ({ page }) => {
  shop.addresses.rows[0].latitude = null
  shop.addresses.rows[0].longitude = null
  shop.cart.seed(NAVY_M.id, 1)
  await openCheckout(page, CART)
  await placeOrderButton(page).click()
  const alert = page.getByRole('alert')
  await expect(alert).toContainText('This address has no map pin')
  await expect(alert).toContainText('Pin this address on the map so we can deliver to it. Your order was not placed.')
  await expect(alert.getByRole('button', { name: 'Try again' })).toHaveCount(0)
  expect(shop.orders.posts).toHaveLength(0)
  expect(shop.orders.quotes).toHaveLength(0)
  await alert.getByRole('button', { name: 'Pin this address' }).click()
  await expect(addressSheet(page).getByRole('alert')).toHaveText(PIN_MESSAGE)
})

test('an address saved with a map pin lets the order go through', async ({ page }) => {
  shop.addresses.rows.length = 0
  await mockPsgc(page)
  await page.route('**/nominatim.openstreetmap.org/reverse**', (route) => route.fulfill({ json: manila, headers: CORS }))
  await page.route('**/tile.openstreetmap.org/**', (route: Route) => route.fulfill({ path: 'tests/fixtures/tiles/1x1.png', contentType: 'image/png' }))
  await signInViaForm(page)
  await page.goto(POLO)
  await expect(page.getByRole('heading', { name: 'Heritage Polo' })).toBeVisible({ timeout: 15000 })
  await placeOrderButton(page).click()
  const sheet = addressSheet(page)
  await expect(sheet.getByRole('alert')).toHaveText(PIN_MESSAGE)

  await sheet.getByLabel('Phone number', { exact: true }).fill('917 123 4567')
  await sheet.getByRole('button', { name: 'Pin on a map' }).click()
  await expect(page.locator('.leaflet-container')).toBeVisible()
  await sheet.getByRole('button', { name: 'Pin map center' }).click()
  await sheet.getByRole('button', { name: 'Use this location' }).click()
  await expect(sheet.getByText('Filled in from your pin. Check each field, then save.')).toBeVisible()
  if ((await sheet.getByRole('button', { name: /^Barangay/ }).textContent())?.includes('Select')) {
    await sheet.getByRole('button', { name: /^Barangay/ }).click()
    await page.getByRole('option', { name: 'Barangay 176' }).click()
  }
  await sheet.getByRole('button', { name: 'Save address' }).click()
  await expect(sheet).toBeHidden()

  expect(shop.addresses.bodies).toHaveLength(1)
  expect(typeof shop.addresses.bodies[0].latitude).toBe('number')
  expect(typeof shop.addresses.bodies[0].longitude).toBe('number')
  await placeOrderButton(page).click()
  await expect(page).toHaveURL(ORDER_URL, { timeout: 15000 })
  expect(shop.orders.posts).toHaveLength(1)
  expect(shop.orders.posts[0].addressId).toBe(shop.addresses.rows[0].id)
})

test('a 400 for insufficient stock shows the server message with a way back, and keeps the form', async ({ page }) => {
  shop.orders.on.create = () => ({ status: 400, json: { statusCode: 400, message: 'Insufficient stock for Heritage Polo (M, Navy). Only 1 available', error: 'Bad Request' } })
  shop.cart.seed(NAVY_M.id, 1)
  await openCheckout(page, CART)
  await page.getByRole('textbox', { name: 'Note to seller' }).fill('Keep my size aside.')
  await placeOrderButton(page).click()

  const alert = page.getByRole('alert')
  await expect(alert).toContainText("We couldn't place your order")
  await expect(alert).toContainText('Insufficient stock for Heritage Polo (M, Navy). Only 1 available. Go back to your cart and adjust the quantity.')
  await expect(alert.getByRole('link', { name: 'Back to cart' })).toHaveAttribute('href', '/cart')
  await expect(alert.getByRole('button', { name: 'Try again' })).toHaveCount(0) // retrying cannot fix it
  await expect(page.getByRole('textbox', { name: 'Note to seller' })).toHaveValue('Keep my size aside.')
  await expect(page).toHaveURL(/\/checkout\?source=cart/)
  await expect(placeOrderButton(page)).toBeEnabled()
  expect(shop.cart.items).toHaveLength(1) // nothing left the cart
  expect(shop.orders.orders).toHaveLength(0)
})

test('a server error shows a calm alert with the details kept, and Try again recovers', async ({ page }) => {
  let failing = true
  shop.orders.on.create = () => (failing ? { status: 500, json: { statusCode: 500, message: 'Internal server error' } } : undefined)
  shop.cart.seed(NAVY_M.id, 1)
  await openCheckout(page, CART)
  await page.getByRole('textbox', { name: 'Note to seller' }).fill('Keep my size aside.')
  await placeOrderButton(page).click()

  const alert = page.getByRole('alert')
  await expect(alert).toContainText("We couldn't place your order")
  await expect(alert).toContainText('Something went wrong on our side, so no order was made.')
  await expect(alert).not.toContainText('Internal server error') // no technical text
  await expect(page.getByRole('textbox', { name: 'Note to seller' })).toHaveValue('Keep my size aside.')

  failing = false
  await alert.getByRole('button', { name: 'Try again' }).click()
  await expect(page).toHaveURL(ORDER_URL, { timeout: 15000 })
  expect(shop.orders.posts).toHaveLength(2)
  expect(shop.orders.orders).toHaveLength(1)
})

test('after a dropped connection the account is checked first: no order yet, so Try again places exactly one', async ({ page }) => {
  let dropped = true
  shop.orders.on.create = () => (dropped ? 'abort' : undefined)
  shop.cart.seed(NAVY_M.id, 1)
  await openCheckout(page, CART)
  await placeOrderButton(page).click()

  const alert = page.getByRole('alert')
  await expect(alert).toContainText('The connection dropped before we got a reply, and no new order shows on your account.')
  expect(shop.orders.lists.length).toBeGreaterThan(0) // the recheck GET /orders
  expect(shop.orders.posts).toHaveLength(1)

  dropped = false
  await alert.getByRole('button', { name: 'Try again' }).click()
  await expect(page).toHaveURL(ORDER_URL, { timeout: 15000 })
  expect(shop.orders.posts).toHaveLength(2)
  expect(shop.orders.orders).toHaveLength(1) // one order, not two
})

test('when the dropped request had in fact created the order, it is found and no second POST is sent', async ({ page }) => {
  shop.cart.seed(NAVY_M.id, 1) // 1,890 + 99
  shop.orders.on.create = () => {
    // The server made the order, and the reply never arrived.
    const now = new Date().toISOString()
    shop.orders.orders.push(
      order(999, { id: '00000000-0000-4000-8000-000000000999', orderNumber: 'SHF-20261101-000999', subtotalAmount: 1890, shippingAmount: 99, totalAmount: 1989, createdAt: now, updatedAt: now }),
    )
    return 'abort'
  }
  await openCheckout(page, CART)
  await placeOrderButton(page).click()
  await expect(page).toHaveURL('/checkout/success?order=00000000-0000-4000-8000-000000000999', { timeout: 15000 })
  expect(shop.orders.posts).toHaveLength(1)
})

test('a double click on Place order sends one request', async ({ page }) => {
  let release: () => void = () => {}
  shop.orders.on.gate = new Promise<void>((resolve) => (release = resolve))
  shop.cart.seed(NAVY_M.id, 1)
  await openCheckout(page, CART)
  await placeOrderButton(page).dblclick()
  await expect.poll(() => shop.orders.posts.length).toBe(1)
  await expect(page.getByRole('button', { name: 'Placing order…' })).toBeDisabled()
  await page.keyboard.press('Enter') // a third attempt, from the keyboard, is ignored too
  release()
  await expect(page).toHaveURL(ORDER_URL, { timeout: 15000 })
  expect(shop.orders.posts).toHaveLength(1)
  expect(shop.orders.orders).toHaveLength(1)
})

test('with nothing saved, the success page says there is no recent order', async ({ page }) => {
  await page.goto('/checkout/success')
  await expect(page.getByRole('heading', { level: 1, name: 'No recent order' })).toBeVisible()
  await page.getByRole('link', { name: 'Back to shop' }).click()
  await expect(page).toHaveURL(/\/shop$/)
})

test('can be completed with the keyboard alone, from the sheet to the success page', async ({ page }) => {
  await signInViaForm(page)
  await page.goto('/shop')
  await expect(page.getByRole('article').first()).toBeVisible({ timeout: 15000 })
  const buy = page.getByRole('button', { name: 'Buy Heritage Polo' })
  await tabTo(page, buy)
  await page.keyboard.press('Enter')

  const sheet = page.getByRole('dialog', { name: 'Choose options' })
  await expect(sheet).toBeVisible()
  await tabTo(page, sheet.getByRole('radio', { name: 'White' }))
  await page.keyboard.press('ArrowRight') // radios: the arrows move the choice
  await expect(sheet.getByRole('radio', { name: 'Navy' })).toBeChecked()
  await tabTo(page, sheet.getByRole('radio', { name: 'XS' }))
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  await expect(sheet.getByRole('radio', { name: 'M', exact: true })).toBeChecked()
  await tabTo(page, sheet.getByRole('button', { name: 'Buy now' }))
  await page.keyboard.press('Enter')

  await expect(page).toHaveURL(/\/checkout\?item=/)
  await expect(page.getByRole('heading', { name: 'Delivery address' }).locator('xpath=ancestor::section')).toContainText('12 Rizal Avenue', { timeout: 15000 })
  await tabTo(page, page.getByRole('radio', { name: 'Pay online' })) // the checked radio holds the tab stop
  await page.keyboard.press('ArrowRight') // cash on delivery is disabled, so the arrows skip it
  await expect(page.getByRole('radio', { name: 'Pay online' })).toBeChecked()
  await expect(page.getByRole('radio', { name: 'Cash on delivery' })).not.toBeChecked()
  await tabTo(page, placeOrderButton(page))
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(ORDER_URL, { timeout: 15000 })
})

test.describe('at 320px', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 700 })
  })

  test('the spec sheet fits with no horizontal scroll and compact targets', async ({ page }) => {
    await signedIn(page)
    await page.goto('/shop')
    await expect(page.getByRole('article').first()).toBeVisible({ timeout: 15000 })
    await page.getByRole('button', { name: 'Add Heritage Polo to cart' }).click()
    const sheet = page.getByRole('dialog', { name: 'Choose options' })
    await expect(sheet.getByRole('button', { name: 'Add to cart' })).toBeInViewport({ ratio: 1 }) // fully slid in
    await expect.poll(async () => (await sheet.boundingBox())!.y + (await sheet.boundingBox())!.height).toBeLessThanOrEqual(700) // a bottom sheet inside the viewport
    const box = (await sheet.boundingBox())!
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(320)
    expect(await overflows(page)).toBe(false)

    for (const name of ['M', 'XS', 'S']) await expectTarget(sheet.getByRole('radio', { name, exact: true }).locator('xpath=following-sibling::span'), `size ${name}`, true)
    await expectTarget(sheet.getByRole('button', { name: 'Increase quantity' }), 'increase', true)
    await expectTarget(sheet.getByRole('button', { name: 'Add to cart' }), 'Add to cart', true)
    await expect(sheet.getByRole('button', { name: 'Add to cart' })).toBeInViewport({ ratio: 1 }) // the action stays in view
  })

  test('the checkout page fits with no horizontal scroll, payment section included', async ({ page }) => {
    await openCheckout(page)
    expect(await overflows(page)).toBe(false)
    await expectTarget(placeOrderButton(page), 'Place order', false)
    await expectTarget(page.getByRole('button', { name: 'Change delivery address' }), 'Change delivery address', false)
    await expect(page.getByText('Unavailable for now')).toBeVisible()
    await expectTarget(page.getByRole('radio', { name: 'Pay online' }).locator('xpath=ancestor::label'), 'Pay online', false)
    expect(await overflows(page)).toBe(false)
  })

  test('the pin message and the failure alert fit with no horizontal scroll', async ({ page }) => {
    shop.cart.seed(NAVY_M.id, 1)
    shop.orders.on.create = () => ({ status: 400, json: { message: 'Insufficient stock for Heritage Polo (M, Navy). Only 1 available' } })
    await openCheckout(page, CART)
    await placeOrderButton(page).click()
    await expect(page.getByRole('alert')).toContainText('Insufficient stock')
    expect(await overflows(page)).toBe(false)
    await page.getByRole('button', { name: 'Change delivery address' }).click()
    await addressSheet(page).getByRole('textbox', { name: 'Street address', exact: true }).fill('99 Another Street')
    await addressSheet(page).getByRole('button', { name: 'Save address' }).click()
    await placeOrderButton(page).click()
    await expect(addressSheet(page).getByRole('alert')).toHaveText(PIN_MESSAGE)
    expect(await overflows(page)).toBe(false)
  })

  test('the success page fits with no horizontal scroll', async ({ page }) => {
    await openCheckout(page)
    await placeOrderButton(page).click()
    await expect(page).toHaveURL(ORDER_URL, { timeout: 15000 })
    await expect(page.getByRole('heading', { level: 1, name: 'Order placed' })).toBeVisible()
    expect(await overflows(page)).toBe(false)
    for (const name of ['View order', 'My orders']) await expectTarget(page.getByRole('link', { name }), name, false)
  })
})

test.describe('dark mode', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('silhoufit-theme', 'dark'))
  })

  test('renders the checkout and success pages with readable text', async ({ page }) => {
    await openCheckout(page)
    await expect(page.locator('html')).toHaveClass(/dark/)
    const { heading, background } = await page.evaluate(() => ({
      heading: getComputedStyle(document.querySelector('h1')!).color,
      background: getComputedStyle(document.body).backgroundColor,
    }))
    expect(heading).not.toBe(background)
    expect(await overflows(page)).toBe(false)
    await placeOrderButton(page).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Order placed' })).toBeVisible({ timeout: 15000 })
    await expect(page.getByText('Awaiting payment', { exact: true })).toBeVisible()
    expect(await overflows(page)).toBe(false)
  })
})

// Kept for readers of the old tests: a second saved address does not change what is posted.
test('with two saved addresses the one on screen is the one posted', async ({ page }) => {
  const office = address({ id: '22222222-2222-4222-8222-222222222222', label: 'Office', recipientName: 'Ben Reyes', phone: '+639181112222', streetAddress: '9 Ayala Avenue', postalCode: '1226', isDefault: false, createdAt: '2026-04-01T08:00:00.000Z' })
  shop.addresses.rows.push(office)
  await openCheckout(page)
  await page.getByRole('button', { name: 'Change delivery address' }).click()
  await page.getByRole('combobox', { name: 'Deliver to' }).click()
  await page.getByRole('option', { name: 'Office' }).click()
  await addressSheet(page).getByRole('button', { name: 'Save address' }).click()
  await placeOrderButton(page).click()
  await expect(page).toHaveURL(ORDER_URL, { timeout: 15000 })
  expect(shop.orders.posts[0].addressId).toBe(office.id)
})
