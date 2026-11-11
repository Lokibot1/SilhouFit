import { expect, test, type Locator, type Page } from '@playwright/test'
import { setupOrderShop, signInViaForm, type OrderShop } from '../shared/checkoutOrders'
import { buyNow, DRESS, JACKET, JEAN, NAVY_M, POLO, TROUSERS } from '../shared/checkoutShop'
import type { CartMock, ProductsMock } from '../shared/products'
import { DEMO, signedIn } from '../shared/session'

const MIN_TARGET = 44
const COMPACT_TARGET = 32

let api: ProductsMock
let cart: CartMock
let shop: OrderShop
const ORDER_URL = /\/checkout\/success\?order=[0-9a-f-]{36}$/
test.beforeEach(async ({ page }) => {
  shop = await setupOrderShop(page) // the cart, one saved pinned address and the orders API
  ;({ api, cart } = shop)
})

// A piece's only variant, for seeding the server cart.
const only = (p: { variants: { id: string }[] }) => p.variants[0].id

const overflows = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
const placeOrderButton = (page: Page) => page.getByRole('button', { name: /Place order|Placing order/ })
const cartButton = (page: Page, label: string) => page.getByRole('link', { name: `Cart, ${label}` })
// Radio cards hide the native input; a user clicks the card, so the test does too.
// Its visible text is 'Select all items' in the toolbar and 'All' in the phone bottom bar, so click the label by its checkbox.
const selectAll = (page: Page) => page.locator('label', { has: page.getByRole('checkbox', { name: 'Select all items' }) }).click()

async function signInOnLoginPage(page: Page) {
  await page.getByLabel('Email', { exact: true }).fill(DEMO.email)
  await page.getByLabel('Password', { exact: true }).fill(DEMO.password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
}

async function addFromSheet(page: Page, name: string, size: string, color: string | null) {
  await page.getByRole('button', { name: `Add ${name} to cart` }).click()
  const sheet = page.getByRole('dialog', { name: 'Choose options' })
  await expect(sheet.getByRole('button', { name: 'Add to cart' })).toBeInViewport({ ratio: 1 }) // fully slid in
  await sheet.getByRole('radio', { name: size, exact: true }).check({ force: true })
  if (color) await sheet.getByRole('radio', { name: color }).check({ force: true })
  await sheet.getByRole('button', { name: 'Add to cart' }).click()
  await expect(sheet).toBeHidden()
}

// The saved address (pinned) fills the delivery card once the signed-in checkout has read it.
const savedAddress = (page: Page) => expect(page.getByRole('heading', { name: 'Delivery address' }).locator('xpath=ancestor::section')).toContainText('12 Rizal Avenue', { timeout: 15000 })

async function tabTo(page: Page, target: Locator) {
  for (let i = 0; i < 80; i++) {
    if (await target.evaluate((el) => el === document.activeElement)) return
    await page.keyboard.press('Tab')
  }
  throw new Error('Never reached the target by pressing Tab')
}

test('a guest who taps Buy now signs in at checkout and lands on that item', async ({ page }) => {
  await page.goto('/shop')
  await expect(page.getByRole('article').first()).toBeVisible({ timeout: 15000 })
  await page.getByRole('button', { name: 'Buy Heritage Polo' }).click()
  const sheet = page.getByRole('dialog', { name: 'Choose options' })
  await expect(sheet.getByRole('button', { name: 'Buy now' })).toBeInViewport({ ratio: 1 })
  await sheet.getByRole('radio', { name: 'M', exact: true }).check({ force: true })
  await sheet.getByRole('radio', { name: 'Navy' }).check({ force: true })
  await sheet.getByRole('button', { name: 'Buy now' }).click()

  await expect(page).toHaveURL((url) => url.pathname === '/login' && url.searchParams.get('next') === buyNow(POLO, NAVY_M.id))
  await signInOnLoginPage(page)
  await expect(page).toHaveURL((url) => url.pathname + url.search === buyNow(POLO, NAVY_M.id))
  await expect(page.getByRole('heading', { name: 'Heritage Polo' })).toBeVisible()
})

test('a guest builds a cart, signs in at checkout, orders every line, and the badge drops', async ({ page }) => {
  await page.goto('/shop')
  await expect(page.getByRole('article').first()).toBeVisible({ timeout: 15000 })
  await addFromSheet(page, 'Heritage Polo', 'M', 'Navy')
  await addFromSheet(page, 'Rail Tank Set', 'S', 'White')
  await expect(cartButton(page, '2 items')).toBeVisible()

  await cartButton(page, '2 items').click()
  await expect(page).toHaveURL(/\/cart$/)
  await expect(page.getByRole('heading', { name: 'Rail Tank Set' })).toBeVisible()
  await selectAll(page)
  await expect(page.getByText('Total (2 items)')).toBeVisible()
  await page.getByRole('button', { name: 'Checkout' }).click()

  await expect(page).toHaveURL(/\/login\?next=%2Fcheckout%3Fsource%3Dcart%26line%3D/)
  await signInOnLoginPage(page)
  await expect(page).toHaveURL(/\/checkout\?source=cart&line=/)
  await expect(page.getByRole('heading', { name: 'Heritage Polo' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Rail Tank Set' })).toBeVisible()
  expect(cart.items).toHaveLength(2) // the guest's cart moved to the server on sign-in
  await expect(page.getByRole('complementary')).toContainText('Subtotal (2 items)')
  await expect(page.getByRole('link', { name: 'Edit cart' })).toBeVisible()

  await savedAddress(page)
  await page.getByRole('textbox', { name: 'Note to seller' }).fill('Gift wrap, please.')
  await placeOrderButton(page).click()
  await expect(page).toHaveURL(ORDER_URL, { timeout: 15000 })
  expect(shop.orders.posts).toHaveLength(1)
  expect(shop.orders.posts[0]).toMatchObject({ addressId: shop.addresses.rows[0].id, quotationId: 'q1', customerNotes: 'Gift wrap, please.' })

  await expect(page.getByRole('heading', { level: 1, name: 'Order placed' })).toBeFocused()
  await expect(page.getByText('Heritage Polo')).toBeVisible()
  await expect(page.getByText('Rail Tank Set')).toBeVisible()
  await expect(page.getByText('12 Rizal Avenue, Barangay 176, City of Manila 1000')).toBeVisible()
  await expect(page.getByText('+639171234567')).toBeVisible()
  await expect(page.getByText('Awaiting payment', { exact: true })).toBeVisible()
  await expect(page.getByText('Gift wrap, please.')).toBeVisible()
  await expect(cartButton(page, '0 items')).toBeVisible() // the ordered lines left the cart
  expect(cart.items).toHaveLength(0)

  // Personal details do not outlive the page: a reload shows the empty state.
  await page.reload()
  await expect(page.getByRole('heading', { level: 1, name: 'No recent order' })).toBeVisible()
})

test('a signed-in cart checkout with pieces from two boutiques go in one delivery order', async ({ page }) => {
  cart.seed(NAVY_M.id, 1) // Ayala Atelier
  cart.seed(only(TROUSERS), 1) // Lumban Loom
  await signInViaForm(page) // the delivery fee is quoted for a saved address, which needs a real session
  await page.goto('/checkout?source=cart')
  await expect(page.getByRole('heading', { name: 'Heritage Polo' })).toBeVisible({ timeout: 15000 })
  await expect(page.getByRole('complementary')).toContainText('₱99.00') // one quoted fee for the whole order
  expect(shop.orders.quotes).toHaveLength(1)
})

test('a piece archived since it was added shows as no longer available and cannot be checked out', async ({ page }) => {
  await signedIn(page)
  cart.seed(NAVY_M.id, 1)
  api.rows.find((p) => p.id === POLO.id)!.isActive = false
  await page.goto('/cart')
  await expect(page.getByText('No longer available')).toBeVisible({ timeout: 15000 })
  await selectAll(page)
  await expect(page.getByRole('button', { name: 'Checkout' })).toBeDisabled()
})

test('the shopping bar on checkout has the cart and the account menu, and signing out there goes to login', async ({ page }) => {
  await signedIn(page)
  cart.seed(NAVY_M.id, 1)
  await page.goto('/checkout?source=cart')
  await expect(page.getByRole('heading', { name: 'Heritage Polo' })).toBeVisible({ timeout: 15000 })
  await expect(page.getByRole('link', { name: 'Sign Up now!' })).toHaveCount(0)
  await expect(page.getByRole('searchbox')).toHaveCount(0)
  await expect(cartButton(page, '1 item')).toHaveAttribute('href', '/cart')

  await page.getByRole('button', { name: 'Account, Demo Shopper' }).click()
  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page).toHaveURL(/\/login\?next=%2Fcheckout%3Fsource%3Dcart$/)
})

test('can be done with the keyboard alone: cart page to the success page', async ({ page }) => {
  await signInViaForm(page)
  cart.seed(NAVY_M.id, 1)
  await page.goto('/shop')
  await expect(page.getByRole('article').first()).toBeVisible({ timeout: 15000 })
  await tabTo(page, cartButton(page, '1 item'))
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/cart$/)
  await tabTo(page, page.getByRole('checkbox', { name: 'Select all items' }))
  await page.keyboard.press('Space')
  await tabTo(page, page.getByRole('button', { name: 'Checkout' }))
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/checkout\?source=cart&line=/)
  await expect(page.getByRole('heading', { name: 'Heritage Polo' })).toBeVisible({ timeout: 15000 })
  await savedAddress(page)
  await tabTo(page, page.getByRole('radio', { name: 'GCash' }))
  await page.keyboard.press('ArrowRight') // cash on delivery is disabled, so the arrows stay on the e-wallet
  await expect(page.getByRole('radio', { name: 'GCash' })).toBeChecked()
  await expect(page.getByRole('radio', { name: 'Cash on delivery' })).toBeDisabled()
  await tabTo(page, placeOrderButton(page))
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(ORDER_URL, { timeout: 15000 })
  expect(shop.orders.posts).toHaveLength(1)
})

test.describe('narrow screens', () => {
  for (const width of [320, 340, 360, 375]) {
    test(`checkout rows fit ${width}px with big quantities and long names`, async ({ page }) => {
      await page.setViewportSize({ width, height: 700 })
      await signedIn(page)
      cart.seed(only(DRESS), 5)
      cart.seed(only(JACKET), 12) // a long name, a big quantity
      cart.seed(only(JEAN), 9)
      await page.goto('/checkout?source=cart')
      await expect(page.getByRole('heading', { name: 'Showroom Denim Jacket' })).toBeVisible({ timeout: 15000 })
      expect(await overflows(page), `/checkout overflows at ${width}px`).toBe(false)
      for (const name of ['Garden Print Dress', 'Showroom Denim Jacket', 'Weekend Tapered Jean']) {
        const row = page.locator('li', { has: page.getByRole('heading', { name }) })
        const rowBox = (await row.boundingBox())!
        const right = await row.locator('p').evaluateAll((els) => Math.max(...els.map((el) => el.getBoundingClientRect().right)))
        expect(right, `${name} text stays inside its row`).toBeLessThanOrEqual(rowBox.x + rowBox.width + 1)
      }
    })
  }

  test('the single-item repro: a piece in quantity 2 does not overflow at 320px', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 })
    await signedIn(page)
    await page.goto(buyNow(DRESS, only(DRESS), 2))
    await expect(page.getByRole('heading', { name: 'Garden Print Dress' })).toBeVisible({ timeout: 15000 })
    expect(await overflows(page)).toBe(false)
  })

  test('the cart page and the success page fit 320px, with controls of at least 32px (44px on touch)', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 700 })
    await signedIn(page)
    cart.seed(only(DRESS), 2)
    cart.seed(NAVY_M.id, 1)
    await page.goto('/cart')
    const cartPage = page.locator('main')
    await expect(cartPage.getByRole('button', { name: 'Checkout' })).toBeInViewport({ ratio: 1, timeout: 15000 })
    expect(await overflows(page)).toBe(false)
    const coarse = await page.evaluate(() => matchMedia('(pointer: coarse)').matches)
    const min = coarse ? MIN_TARGET : COMPACT_TARGET
    for (const control of await cartPage.getByRole('button').all()) {
      if (!(await control.isVisible())) continue
      const box = (await control.boundingBox())!
      const name = (await control.getAttribute('aria-label')) ?? (await control.textContent())
      if (/^(Remove|Undo)/.test(name ?? '')) continue // text links keep their own hit area
      expect(box.height, `${name} height`).toBeGreaterThanOrEqual(min - 0.5) // fractional pixels on a scaled screen
    }
  })

  test('every control in the spec sheet is at least 32px (44px on touch) at 320px', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 700 })
    await page.goto('/shop')
    await expect(page.getByRole('article').first()).toBeVisible({ timeout: 15000 })
    await page.getByRole('button', { name: 'Add Heritage Polo to cart' }).click()
    const sheet = page.getByRole('dialog', { name: 'Choose options' })
    await expect(sheet.getByRole('button', { name: 'Add to cart' })).toBeInViewport({ ratio: 1 })
    const coarse = await page.evaluate(() => matchMedia('(pointer: coarse)').matches)
    const min = coarse ? MIN_TARGET : COMPACT_TARGET
    const small = await sheet.evaluate((root, floor) => {
      const targets = [...root.querySelectorAll('button')].filter((el) => el.getBoundingClientRect().width > 0)
      for (const input of root.querySelectorAll('input[type=radio]')) targets.push(input.nextElementSibling as HTMLButtonElement)
      return targets
        .map((el) => ({ name: el.getAttribute('aria-label') ?? el.textContent?.trim() ?? '', w: Math.round(el.getBoundingClientRect().width), h: Math.round(el.getBoundingClientRect().height) }))
        .filter((t) => t.h < floor || t.w < floor)
    }, min)
    expect(small, 'controls below the minimum target size').toEqual([])
  })

  test('the success page fits 320px', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 700 })
    await signInViaForm(page)
    cart.seed(only(DRESS), 5)
    await page.goto('/checkout?source=cart')
    await expect(page.getByRole('heading', { name: 'Garden Print Dress' })).toBeVisible({ timeout: 15000 })
    await savedAddress(page)
    await placeOrderButton(page).click()
    await expect(page).toHaveURL(ORDER_URL, { timeout: 15000 })
    await expect(page.getByRole('heading', { level: 1, name: 'Order placed' })).toBeVisible()
    expect(await overflows(page)).toBe(false)
  })
})

test.describe('dark mode', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('silhoufit-theme', 'dark'))
  })

  test('renders the cart page, cart checkout and success page readably', async ({ page }) => {
    await signInViaForm(page)
    cart.seed(NAVY_M.id, 1)
    await page.goto('/cart')
    await expect(page.getByRole('heading', { name: 'Heritage Polo' })).toBeVisible({ timeout: 15000 })
    await page.goto('/checkout?source=cart')
    await expect(page.getByRole('heading', { name: 'Heritage Polo' })).toBeVisible({ timeout: 15000 })
    await expect(page.locator('html')).toHaveClass(/dark/)
    await savedAddress(page)
    await placeOrderButton(page).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Order placed' })).toBeVisible({ timeout: 15000 })
  })
})
