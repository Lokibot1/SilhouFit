import { expect, test, type Locator, type Page } from '@playwright/test'
import { DEMO, signedIn } from '../shared/session'

const MIN_TARGET = 44
const COMPACT_TARGET = 36
const POLO = '/checkout?item=p01&size=M&color=Navy&qty=1' // 1,890, online and in store, Ayala Atelier

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('silhoufit-cookie-consent', 'accepted'))
})

const placeOrderButton = (page: Page) => page.getByRole('button', { name: /Place order|Placing order/ })
const summary = (page: Page) => page.getByRole('complementary')
const overflows = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)

async function openCheckout(page: Page, url = POLO) {
  await page.goto(url)
  await expect(page.getByRole('heading', { name: 'Heritage Polo' })).toBeVisible({ timeout: 15000 })
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

// Radio cards hide the native input; a user clicks the card, so the test does too.
const choose = (page: Page, name: RegExp) => page.getByRole('radio', { name }).locator('xpath=ancestor::label').click()

async function fillAddress(page: Page) {
  await page.getByLabel('Phone number').fill('9171234567')
  await page.getByLabel('Street address').fill('12 Mabini Street, Brgy. San Roque')
  await page.getByLabel('City').fill('Marikina City')
  await page.getByLabel('Postal code').fill('1800')
}

test('a signed-out visitor is sent to login and returns to the same checkout', async ({ page }) => {
  await page.goto(POLO)
  await expect(page).toHaveURL(/\/login\?next=%2Fcheckout%3Fitem%3Dp01%26size%3DM%26color%3DNavy%26qty%3D1$/)
  await page.getByLabel('Email', { exact: true }).fill(DEMO.email)
  await page.getByLabel('Password', { exact: true }).fill(DEMO.password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL(/\/checkout\?item=p01/)
  await expect(page.getByRole('heading', { name: 'Heritage Polo' })).toBeVisible()
})

test('shows "Nothing to check out" for a link that does not match a piece', async ({ page }) => {
  await signedIn(page)
  await page.goto('/checkout?item=p01&size=99&color=Navy&qty=1')
  await expect(page.getByRole('heading', { name: 'Nothing to check out' })).toBeVisible({ timeout: 15000 })
  await page.getByRole('link', { name: 'Back to shop' }).click()
  await expect(page).toHaveURL(/\/shop$/)
})

test('Buy now to success: pickup changes the total and ETA, then Back does not return to the form', async ({ page }) => {
  await signedIn(page)
  await page.goto('/shop')
  await expect(page.getByRole('article').first()).toBeVisible({ timeout: 15000 })
  await page.getByRole('button', { name: 'Buy Heritage Polo' }).click()
  const sheet = page.getByRole('dialog', { name: 'Choose options' })
  await expect(sheet.getByRole('button', { name: 'Buy now' })).toBeInViewport({ ratio: 1 }) // the sheet has finished sliding in
  await sheet.getByRole('radio', { name: 'M', exact: true }).check({ force: true })
  await sheet.getByRole('radio', { name: 'Navy' }).check({ force: true })
  await sheet.getByRole('button', { name: 'Buy now' }).click()
  await expect(page).toHaveURL(/\/checkout\?item=p01&size=M&color=Navy&qty=1$/)

  await expect(summary(page)).toContainText('₱1,989.00') // 1,890 + 99 delivery
  await expect(summary(page)).toContainText(/Arrives \w{3}, \w{3} \d+ – \w{3}, \w{3} \d+/)
  await choose(page, /Pick up in store/)
  await expect(summary(page)).toContainText('₱1,890.00')
  await expect(summary(page)).toContainText('Free')
  await expect(summary(page)).toContainText('Ready at Ayala Atelier tomorrow from 2:00 PM')
  await choose(page, /Pay at pickup/)

  await placeOrderButton(page).click()
  await expect(page).toHaveURL(/\/checkout\/success$/, { timeout: 15000 })
  await expect(page.getByRole('heading', { level: 1, name: 'Order placed' })).toBeFocused()
  await expect(page.getByText(/^SF-\d{6}-[A-Z2-9]{4}$/)).toBeVisible()
  await expect(page.getByText('Pay at pickup')).toBeVisible()
  await expect(page.getByText('Ready at Ayala Atelier tomorrow from 2:00 PM')).toBeVisible()

  await page.goBack()
  await expect(page).toHaveURL(/\/shop$/)

  await page.goForward()
  await page.getByRole('link', { name: 'Back to shop' }).click()
  await expect(page).toHaveURL(/\/shop$/)
})

test('a delivery order needs a valid address, then goes through with cash on delivery', async ({ page }) => {
  await signedIn(page)
  await openCheckout(page)
  await choose(page, /Cash on delivery/)
  await placeOrderButton(page).click()
  await expect(page.getByLabel('Phone number')).toBeFocused()
  await expect(page.getByText('Phone number is required.')).toBeVisible()
  await expect(page).toHaveURL(/\/checkout\?/)

  await fillAddress(page)
  await page.getByRole('textbox', { name: 'Note to seller' }).fill('Please gift wrap.')
  await expect(page.getByText('17/200')).toBeVisible()
  await placeOrderButton(page).click()
  await expect(page).toHaveURL(/\/checkout\/success$/, { timeout: 15000 })
  await expect(page.getByText('Cash on delivery')).toBeVisible()
})

test('a failed order shows an inline alert with the details kept, and Try again recovers', async ({ page }) => {
  await signedIn(page)
  await openCheckout(page, `${POLO}&fail=order`)
  await choose(page, /Pick up in store/)
  await page.getByRole('textbox', { name: 'Note to seller' }).fill('Keep my size aside.')
  await placeOrderButton(page).click()

  const alert = page.getByRole('alert')
  await expect(alert).toContainText("We couldn't place your order.", { timeout: 15000 })
  await expect(alert).toContainText('connection')
  await expect(page.getByRole('textbox', { name: 'Note to seller' })).toHaveValue('Keep my size aside.')

  // The dev-only failure keys off the URL, so drop it before retrying.
  await page.evaluate(() => history.replaceState(null, '', location.pathname + location.search.replace('&fail=order', '')))
  await alert.getByRole('button', { name: 'Try again' }).click()
  await expect(page).toHaveURL(/\/checkout\/success$/, { timeout: 15000 })
})

test('with nothing saved, the success page says there is no recent order', async ({ page }) => {
  await page.goto('/checkout/success')
  await expect(page.getByRole('heading', { level: 1, name: 'No recent order' })).toBeVisible()
  await page.getByRole('link', { name: 'Back to shop' }).click()
  await expect(page).toHaveURL(/\/shop$/)
})

test('can be completed with the keyboard alone, from the sheet to the success page', async ({ page }) => {
  await signedIn(page)
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

  await expect(page).toHaveURL(/\/checkout\?item=p01&size=M&color=Navy/)
  await tabTo(page, page.getByRole('radio', { name: /Delivery/ })) // the checked radio holds the tab stop
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('radio', { name: /Pick up in store/ })).toBeChecked()
  await tabTo(page, placeOrderButton(page))
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/checkout\/success$/, { timeout: 15000 })
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

    for (const name of ['M', 'XS', 'XL']) await expectTarget(sheet.getByRole('radio', { name, exact: true }).locator('xpath=following-sibling::span'), `size ${name}`, true)
    await expectTarget(sheet.getByRole('button', { name: 'Increase quantity' }), 'increase', true)
    await expectTarget(sheet.getByRole('button', { name: 'Add to cart' }), 'Add to cart', true)
    await expect(sheet.getByRole('button', { name: 'Add to cart' })).toBeInViewport({ ratio: 1 }) // the action stays in view
  })

  test('the checkout page fits with no horizontal scroll, in delivery and pickup', async ({ page }) => {
    await signedIn(page)
    await openCheckout(page)
    expect(await overflows(page)).toBe(false)
    await expectTarget(placeOrderButton(page), 'Place order', false)
    await expectTarget(page.locator('#checkout-fullName'), 'Full name', false)
    await expectTarget(page.locator('label:has(input[name="fulfilment"][value="delivery"])'), 'Delivery card', false)
    await choose(page, /Pick up in store/)
    expect(await overflows(page)).toBe(false)
  })

  test('the success page fits with no horizontal scroll', async ({ page }) => {
    await signedIn(page)
    await openCheckout(page)
    await choose(page, /Pick up in store/)
    await placeOrderButton(page).click()
    await expect(page).toHaveURL(/\/checkout\/success$/, { timeout: 15000 })
    expect(await overflows(page)).toBe(false)
  })
})

test.describe('dark mode', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('silhoufit-theme', 'dark'))
  })

  test('renders the checkout and success pages with readable text', async ({ page }) => {
    await signedIn(page)
    await openCheckout(page)
    await expect(page.locator('html')).toHaveClass(/dark/)
    const { heading, background } = await page.evaluate(() => ({
      heading: getComputedStyle(document.querySelector('h1')!).color,
      background: getComputedStyle(document.body).backgroundColor,
    }))
    expect(heading).not.toBe(background)
    await choose(page, /Pick up in store/)
    await placeOrderButton(page).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Order placed' })).toBeVisible({ timeout: 15000 })
  })
})
