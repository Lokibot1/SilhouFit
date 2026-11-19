import { expect, test, type Page } from '@playwright/test'
import { ADDRESS } from '../fixtures/addresses'
import { setupOrderShop, signInViaForm, type OrderShop } from '../shared/checkoutOrders'
import { NAVY_M } from '../shared/checkoutShop'
import { mockOrders, order, orderId } from '../shared/ordersApi'
import { signedIn } from '../shared/session'

// The customer's two notes (sellerNotes, courierNotes) and what they never see (internalNotes).
// Placing an order omits an empty note's key; the order page shows each note under its own heading.

const ORDER_URL = /\/checkout\/success\?order=[0-9a-f-]{36}$/
const placeOrderButton = (page: Page) => page.getByRole('button', { name: /Place order|Placing order/ })

test.describe('checkout posts only the notes that were typed', () => {
  let shop: OrderShop
  test.beforeEach(async ({ page }) => {
    shop = await setupOrderShop(page)
    shop.cart.seed(NAVY_M.id, 1)
    await signInViaForm(page)
    await page.goto('/checkout?source=cart')
    await expect(page.getByRole('heading', { name: 'Heritage Polo' })).toBeVisible({ timeout: 15000 })
    await expect(page.getByRole('heading', { name: 'Delivery address' }).locator('xpath=ancestor::section')).toContainText('12 Rizal Avenue', { timeout: 15000 })
  })

  test('only a rider note posts courierNotes', async ({ page }) => {
    const lineIds = shop.cart.items.map((line) => line.id)
    await page.getByRole('textbox', { name: 'Delivery notes' }).fill('Gate code 1234.')
    await placeOrderButton(page).click()
    await expect(page).toHaveURL(ORDER_URL, { timeout: 15000 })
    expect(shop.orders.posts).toEqual([{ addressId: ADDRESS.id, cartItemIds: lineIds, quotationId: 'q1', courierNotes: 'Gate code 1234.' }])
    expect(Object.keys(shop.orders.posts[0])).not.toContain('sellerNotes')
  })

  test('no notes posts neither key', async ({ page }) => {
    await placeOrderButton(page).click()
    await expect(page).toHaveURL(ORDER_URL, { timeout: 15000 })
    expect(shop.orders.posts).toHaveLength(1)
    const keys = Object.keys(shop.orders.posts[0])
    expect(keys).not.toContain('sellerNotes')
    expect(keys).not.toContain('courierNotes')
  })
})

test.describe('the customer order page', () => {
  test.beforeEach(async ({ page }) => {
    await signedIn(page)
  })

  test('shows both notes under their own headings and never an internal note', async ({ page }) => {
    // The API never sends internalNotes to a customer; if it wrongly did, the page must still not show it.
    await mockOrders(page, [order(1, { sellerNotes: 'Please gift wrap.', courierNotes: 'Gate code 1234.', internalNotes: 'SECRET staff remark' })])
    await page.goto(`/orders/${orderId(1)}`)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 15000 })

    await expect(page.getByRole('region', { name: 'Note to seller' })).toContainText('Please gift wrap.')
    await expect(page.getByRole('region', { name: 'Delivery notes' })).toContainText('Gate code 1234.')
    await expect(page.getByText('SECRET staff remark')).toHaveCount(0)
    await expect(page.getByText(/internal/i)).toHaveCount(0)
  })

  test('shows no note section when the order has no notes', async ({ page }) => {
    await mockOrders(page, [order(1)])
    await page.goto(`/orders/${orderId(1)}`)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 15000 })
    await expect(page.getByRole('heading', { level: 2, name: 'Note to seller' })).toHaveCount(0)
    await expect(page.getByRole('heading', { level: 2, name: 'Delivery notes' })).toHaveCount(0)
  })
})
