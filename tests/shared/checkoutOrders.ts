import { expect, type Page } from '@playwright/test'
import type { Address } from '../../src/service/addresses'
import { ADDRESS } from '../fixtures/addresses'
import { mockAddresses, type AddressesMock } from './addresses'
import { setupShop } from './checkoutShop'
import { mockOrders, type OrdersMock } from './ordersApi'
import type { CartMock, ProductsMock } from './products'
import { DEMO } from './session'

export interface OrderShop {
  api: ProductsMock
  cart: CartMock
  addresses: AddressesMock
  orders: OrdersMock
}

/**
 * Everything a real-order checkout test needs: auth, the shop, the cart API, the saved addresses (one pinned address by default,
 * so Place order can go through) and the orders API, which prices a new order from the cart lines it is sent.
 * Register before the page's first goto.
 */
export async function setupOrderShop(page: Page, saved: Address[] = [ADDRESS]): Promise<OrderShop> {
  const { api, cart } = await setupShop(page)
  const addresses = await mockAddresses(page, saved)
  const orders = await mockOrders(page, [], { cart, products: api })
  return { api, cart, addresses, orders }
}

/**
 * Signs in through the login form. The saved addresses and the order API need a real session token, which the
 * `signedIn` shortcut (it only seeds the display name) does not give.
 */
export async function signInViaForm(page: Page) {
  await page.goto('/login')
  await page.getByLabel('Email', { exact: true }).fill(DEMO.email)
  await page.getByLabel('Password', { exact: true }).fill(DEMO.password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).not.toHaveURL(/\/login/, { timeout: 15000 })
}
