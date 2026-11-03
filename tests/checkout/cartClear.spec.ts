import { expect, test, type Page } from '@playwright/test'
import { NAVY_M, POLO, setupShop, TROUSERS } from '../shared/checkoutShop'
import type { CartMock } from '../shared/products'
import { signedIn } from '../shared/session'

// Feature "Cart – Clear cart" (DELETE /cart): on the cart page, Clear cart asks first, then empties the server cart, and Undo puts every line back.

let cart: CartMock
const TROUSERS_VARIANT = TROUSERS.variants[0].id

test.beforeEach(async ({ page }) => {
  ;({ cart } = await setupShop(page))
})

const clearCartButton = (page: Page) => page.getByRole('button', { name: 'Clear cart', exact: true })
const deletes = (cart: CartMock) => cart.calls.filter((c) => c.method === 'DELETE' && c.itemId === null)
const posts = (cart: CartMock) => cart.calls.filter((c) => c.method === 'POST')

test.describe('Cart – Clear cart', () => {
  test('asks first, Cancel changes nothing, confirming sends one DELETE /cart and the empty state shows', async ({ page }) => {
    await signedIn(page)
    cart.seed(NAVY_M.id, 1)
    cart.seed(TROUSERS_VARIANT, 2)
    await page.goto('/cart')
    await expect(page.getByRole('heading', { name: 'Heritage Polo' })).toBeVisible({ timeout: 15000 })

    await clearCartButton(page).click()
    const dialog = page.getByRole('dialog', { name: 'Clear your cart?' })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByText('Are you sure?')).toBeVisible()
    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await expect(dialog).toBeHidden()
    await expect(page.getByRole('heading', { name: 'Heritage Polo' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Wool Trousers' })).toBeVisible()
    expect(deletes(cart)).toHaveLength(0)

    await clearCartButton(page).click()
    await dialog.getByRole('button', { name: 'Clear cart' }).click()
    await expect(page.getByRole('heading', { name: 'Your cart is currently empty' })).toBeVisible()
    await expect(page.getByText('Cleared your cart')).toBeVisible()
    expect(deletes(cart)).toHaveLength(1)
    expect(cart.items).toHaveLength(0)
    await expect(page.getByRole('link', { name: 'Cart, 0 items' })).toBeVisible()
    // The button is gone with the lines.
    await expect(clearCartButton(page)).toHaveCount(0)
  })

  test('Undo adds every line back, one POST /cart/items per line', async ({ page }) => {
    await signedIn(page)
    cart.seed(NAVY_M.id, 1)
    cart.seed(TROUSERS_VARIANT, 2)
    await page.goto('/cart')
    await expect(page.getByRole('heading', { name: 'Heritage Polo' })).toBeVisible({ timeout: 15000 })

    await clearCartButton(page).click()
    await page.getByRole('dialog', { name: 'Clear your cart?' }).getByRole('button', { name: 'Clear cart' }).click()
    await expect(page.getByText('Cleared your cart')).toBeVisible()
    await page.getByRole('button', { name: 'Undo' }).click()

    await expect(page.getByText('Put your cart back')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Heritage Polo' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Wool Trousers' })).toBeVisible()
    expect(posts(cart).map((c) => c.body)).toEqual([
      { variantId: NAVY_M.id, quantity: 1 },
      { variantId: TROUSERS_VARIANT, quantity: 2 },
    ])
    expect(cart.items.map((i) => [i.variantId, i.quantity])).toEqual([
      [NAVY_M.id, 1],
      [TROUSERS_VARIANT, 2],
    ])
  })

  test('a failed DELETE /cart keeps the lines and shows the error', async ({ page }) => {
    await signedIn(page)
    cart.seed(NAVY_M.id, 1)
    await page.goto('/cart')
    await expect(page.getByRole('heading', { name: 'Heritage Polo' })).toBeVisible({ timeout: 15000 })

    let attempts = 0
    await page.route(
      (url) => url.origin !== 'http://localhost:5173' && url.pathname === '/cart',
      (route) => {
        if (route.request().method() !== 'DELETE') return route.fallback()
        attempts++
        return route.fulfill({ status: 500, json: { message: 'Internal server error' }, headers: { 'access-control-allow-origin': '*' } })
      },
    )
    await clearCartButton(page).click()
    await page.getByRole('dialog', { name: 'Clear your cart?' }).getByRole('button', { name: 'Clear cart' }).click()

    await expect(page.getByText(/Couldn't update your cart\. The request failed.*Check your connection, then try again\./)).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Heritage Polo' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Your cart is currently empty' })).toHaveCount(0)
    await expect(page.getByText('Cleared your cart')).toHaveCount(0)
    await expect(page.getByRole('dialog', { name: 'Clear your cart?' })).toBeHidden()
    expect(attempts).toBe(1)
    expect(cart.items).toHaveLength(1)
  })

  test('the button is absent for a guest and in the empty state', async ({ page }) => {
    await page.goto('/cart')
    await expect(page.getByRole('heading', { name: 'Your cart is currently empty' })).toBeVisible({ timeout: 15000 })
    await expect(clearCartButton(page)).toHaveCount(0)

    await signedIn(page)
    await page.goto('/cart')
    await expect(page.getByRole('heading', { name: 'Your cart is currently empty' })).toBeVisible({ timeout: 15000 })
    await expect(clearCartButton(page)).toHaveCount(0)
  })
})
