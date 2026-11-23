import { expect, test } from '@playwright/test'
import { NAVY_M, setupShop } from '../shared/checkoutShop'
import type { CartMock, ProductsMock } from '../shared/products'
import { signedIn } from '../shared/session'

// SHF-CRT-2: the "Quantity lowered" notice was missing on a phone, because the cart loaded once and a phone keeps the tab open for hours.
// The cart page now reads the cart again when the tab comes back, so stock that dropped meanwhile is explained.

let cart: CartMock
let api: ProductsMock

test.beforeEach(async ({ page }) => {
  ;({ api, cart } = await setupShop(page))
})

test('stock cut while the cart page is open is explained when the tab becomes visible again', async ({ page }) => {
  await signedIn(page)
  cart.seed(NAVY_M.id, 15)
  await page.goto('/cart')
  await expect(page.getByRole('heading', { name: 'Heritage Polo' })).toBeVisible({ timeout: 15000 })
  await expect(page.getByText(/Quantity lowered/)).toHaveCount(0)

  // Staff cut the stock in the shop's data (the mock keeps its own copy of the rows).
  api.rows.flatMap((row) => row.variants).find((v) => v.id === NAVY_M.id)!.stock = 10
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))

  await expect(page.getByText('Quantity lowered from 15 to 10: only 10 are in stock now.')).toBeVisible()
})
