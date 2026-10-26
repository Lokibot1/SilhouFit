import { expect, test, type Page } from '@playwright/test'
import { ADDRESS, address } from '../fixtures/addresses'
import { mockAddresses } from '../shared/addresses'
import { DEMO, mockAuth } from '../shared/session'

// Checkout reads the saved addresses with a real Supabase token, so these specs sign in through the login form
// (mockAuth stands in for Supabase) instead of seeding the session store the way checkout.spec.ts does.
const POLO = '/checkout?item=p01&size=M&color=Navy&qty=1'
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' }

const OFFICE = address({
  id: '22222222-2222-4222-8222-222222222222',
  label: 'Office',
  recipientName: 'Ben Reyes',
  phone: '+639181112222',
  streetAddress: '9 Ayala Avenue',
  postalCode: '1226',
  isDefault: false,
  createdAt: '2026-04-01T08:00:00.000Z',
})

test.beforeEach(async ({ page }) => {
  await mockAuth(page)
  await page.addInitScript(() => localStorage.setItem('silhoufit-cookie-consent', 'accepted'))
})

async function openCheckout(page: Page) {
  await page.goto(POLO)
  await expect(page).toHaveURL(/\/login\?next=/)
  await page.getByLabel('Email', { exact: true }).fill(DEMO.email)
  await page.getByLabel('Password', { exact: true }).fill(DEMO.password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Heritage Polo' })).toBeVisible({ timeout: 15000 })
}

const picker = (page: Page) => page.getByRole('combobox', { name: 'Deliver to' })

test('the default saved address fills the delivery form, and there is no picker for one address', async ({ page }) => {
  await mockAddresses(page, [ADDRESS])
  await openCheckout(page)
  await expect(page.getByRole('textbox', { name: 'Full name', exact: true })).toHaveValue('Anne Santos')
  await expect(page.getByRole('textbox', { name: 'Phone number', exact: true })).toHaveValue('9171234567')
  await expect(page.getByRole('textbox', { name: 'Street address', exact: true })).toHaveValue(/^12 Rizal Avenue/)
  await expect(page.getByRole('textbox', { name: 'City', exact: true })).toHaveValue(/Manila/)
  await expect(page.getByRole('textbox', { name: 'Postal code', exact: true })).toHaveValue('1000')
  await expect(picker(page)).toHaveCount(0)
})

test('with several addresses a Deliver to picker lists them, defaults first, and choosing one refills the form', async ({ page }) => {
  await mockAddresses(page, [OFFICE, ADDRESS])
  await openCheckout(page)
  await expect(picker(page)).toContainText('Home (Default)')
  await expect(page.getByRole('textbox', { name: 'Full name', exact: true })).toHaveValue('Anne Santos')

  await picker(page).click()
  await expect(page.getByRole('option')).toHaveText([/Home \(Default\)/, /Office/])
  await page.getByRole('option', { name: 'Office' }).click()
  await expect(picker(page)).toContainText('Office')
  await expect(page.getByRole('textbox', { name: 'Full name', exact: true })).toHaveValue('Ben Reyes')
  await expect(page.getByRole('textbox', { name: 'Street address', exact: true })).toHaveValue(/^9 Ayala Avenue/)
  await expect(page.getByRole('textbox', { name: 'Postal code', exact: true })).toHaveValue('1226')
})

test('a prefilled address goes through to the success page', async ({ page }) => {
  await mockAddresses(page, [ADDRESS])
  await openCheckout(page)
  await expect(page.getByRole('textbox', { name: 'Postal code', exact: true })).toHaveValue('1000')
  await page.getByRole('radio', { name: /Cash on delivery/ }).locator('xpath=ancestor::label').click()
  await page.getByRole('button', { name: /Place order/ }).click()
  await expect(page).toHaveURL(/\/checkout\/success$/, { timeout: 15000 })
})

test('with nothing saved the form starts empty except the account name', async ({ page }) => {
  await mockAddresses(page, [])
  await openCheckout(page)
  await expect(page.getByRole('textbox', { name: 'Full name', exact: true })).toHaveValue('Demo Shopper')
  await expect(page.getByRole('textbox', { name: 'Phone number', exact: true })).toHaveValue('')
  await expect(page.getByRole('textbox', { name: 'Street address', exact: true })).toHaveValue('')
  await expect(picker(page)).toHaveCount(0)
})

test('when the saved addresses cannot load it says so and the form can still be typed', async ({ page }) => {
  await mockAddresses(page, [ADDRESS])
  await page.route('**/users/me/addresses', (route) =>
    route.request().method() === 'OPTIONS' ? route.fallback() : route.fulfill({ status: 500, json: {}, headers: CORS }),
  )
  await openCheckout(page)
  await expect(page.getByText("We couldn't load your saved addresses, so type your delivery address below.")).toBeVisible()
  await page.getByRole('textbox', { name: 'Phone number', exact: true }).fill('9171234567')
  await expect(page.getByRole('textbox', { name: 'Phone number', exact: true })).toHaveValue('9171234567')
})

test('Try again after a failed read fills the form from the saved address, never over what was typed', async ({ page }) => {
  await mockAddresses(page, [ADDRESS])
  let failing = true
  await page.route('**/users/me/addresses', (route) =>
    failing && route.request().method() === 'GET' ? route.fulfill({ status: 500, json: {}, headers: CORS }) : route.fallback(),
  )
  await openCheckout(page)
  await expect(page.getByText("We couldn't load your saved addresses, so type your delivery address below.")).toBeVisible()
  await page.getByRole('textbox', { name: 'Street address', exact: true }).fill('My own street')
  failing = false
  await page.getByRole('button', { name: 'Try again' }).click()
  await expect(page.getByRole('textbox', { name: 'Postal code', exact: true })).toHaveValue('1000')
  await expect(page.getByRole('textbox', { name: 'Street address', exact: true })).toHaveValue('My own street')
  await expect(page.getByText("We couldn't load your saved addresses")).toHaveCount(0)
})

test('the fields do not move when the Deliver to picker arrives', async ({ page }) => {
  await mockAddresses(page, [OFFICE, ADDRESS])
  let release: () => void = () => {}
  const gate = new Promise<void>((resolve) => (release = resolve))
  await page.route('**/users/me/addresses', async (route) => {
    if (route.request().method() === 'GET') await gate
    await route.fallback()
  })
  await openCheckout(page)
  const street = page.getByRole('textbox', { name: 'Street address', exact: true })
  await expect(page.getByText('Deliver to')).toBeVisible()
  const before = (await street.boundingBox())!.y
  release()
  await expect(picker(page)).toBeVisible()
  await expect.poll(async () => Math.abs((await street.boundingBox())!.y - before)).toBeLessThanOrEqual(1)
})

test('with one saved address the reserved slot folds away', async ({ page }) => {
  await mockAddresses(page, [ADDRESS])
  await openCheckout(page)
  await expect(page.getByRole('textbox', { name: 'Postal code', exact: true })).toHaveValue('1000')
  await expect(page.getByText('Deliver to')).toHaveCount(0)
})

test('what the shopper has typed is not overwritten by a late saved address', async ({ page }) => {
  await mockAddresses(page, [ADDRESS])
  let release: () => void = () => {}
  const gate = new Promise<void>((resolve) => (release = resolve))
  await page.route('**/users/me/addresses', async (route) => {
    if (route.request().method() === 'GET') await gate
    await route.fallback()
  })
  await openCheckout(page)
  await page.getByRole('textbox', { name: 'Street address', exact: true }).fill('My own street')
  release()
  await expect(page.getByRole('textbox', { name: 'Postal code', exact: true })).toHaveValue('1000')
  await expect(page.getByRole('textbox', { name: 'Street address', exact: true })).toHaveValue('My own street')
})

test('has no horizontal scroll at 320px with the picker showing', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 })
  await mockAddresses(page, [OFFICE, ADDRESS])
  await openCheckout(page)
  await expect(picker(page)).toBeVisible()
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(0)
})
