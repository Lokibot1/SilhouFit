import { expect, test, type Page } from '@playwright/test'
import { apiShipment, mockOrders, order, orderId, type OrdersMock } from '../shared/ordersApi'
import { mockAuth, signedIn } from '../shared/session'

// The customer navbar's notification bell: order updates built from the shopper's own orders (mocked orders API), unread until the panel closes.

const num = (n: number) => `SHF-20261001-${String(n).padStart(6, '0')}`
/** The bell by its exact label for `unread` unread entries, or by any label when omitted. */
const bell = (page: Page, unread?: number) =>
  unread === undefined ? page.getByRole('button', { name: /^Notifications/ }) : page.getByRole('button', { name: unread ? `Notifications, ${unread} unread` : 'Notifications', exact: true })
const panel = (page: Page) => page.getByRole('group', { name: 'Notifications' })
const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)

const orders = () => [
  order(1),
  order(2, { status: 'DELIVERED', paymentStatus: 'PAID', paidAt: '2026-10-02T03:00:00.000Z', shipment: apiShipment({ status: 'COMPLETED', deliveredAt: '2026-10-08T05:00:00.000Z' }) }),
]

async function open(page: Page, initial = orders()): Promise<OrdersMock> {
  await mockAuth(page)
  await signedIn(page)
  await page.addInitScript(() => localStorage.setItem('silhoufit-cookie-consent', 'accepted'))
  const mock = await mockOrders(page, initial)
  await page.goto('/wishlist')
  return mock
}

async function insideViewport(page: Page) {
  const box = (await panel(page).boundingBox())!
  const view = page.viewportSize()!
  expect(box.x).toBeGreaterThanOrEqual(0)
  expect(box.y).toBeGreaterThanOrEqual(0)
  expect(box.x + box.width).toBeLessThanOrEqual(view.width)
  expect(box.y + box.height).toBeLessThanOrEqual(view.height)
}

test('the bell shows the unread count, opens on the orders and links each row', async ({ page }) => {
  await open(page)
  await expect(bell(page, 2)).toHaveText('2')
  await bell(page, 2).click()
  await expect(bell(page, 2)).toHaveAttribute('aria-expanded', 'true')
  await expect(panel(page)).toBeVisible()
  await expect(panel(page).getByText('2 unread')).toBeVisible()
  const rows = panel(page).getByRole('link')
  await expect(rows).toHaveCount(3)
  await expect(rows.nth(0)).toHaveAttribute('href', `/orders/${orderId(2)}`)
  await expect(rows.nth(0)).toContainText(num(2))
  await expect(rows.nth(0)).toContainText('Your order was delivered')
  await expect(rows.nth(1)).toHaveAttribute('href', `/orders/${orderId(1)}`)
  await expect(rows.nth(1)).toContainText('Your order is waiting for payment')
  await expect(rows.nth(2)).toHaveAttribute('href', '/orders')
  await insideViewport(page)
})

test('closing clears the badge, a reload keeps it cleared and a status change makes it unread again', async ({ page }) => {
  const mock = await open(page)
  await bell(page, 2).click()
  await expect(panel(page)).toBeVisible()
  await bell(page, 2).click() // the bell again closes it
  await expect(panel(page)).toHaveCount(0)
  await expect(bell(page, 0)).not.toContainText(/\d/)

  await page.reload()
  await expect(bell(page, 0)).toBeVisible()

  Object.assign(mock.orders[0], { status: 'CANCELLED', cancelledAt: '2026-10-09T05:00:00.000Z' })
  await page.reload()
  await bell(page, 1).click()
  const rows = panel(page).getByRole('link')
  await expect(rows.nth(1)).toContainText('Your order was cancelled')
  await expect(rows.nth(1)).toContainText('Unread') // the screen-reader text; the square dot is its visible twin
  await expect(rows.nth(0)).not.toContainText('Unread')
})

test('Escape closes the panel and returns focus to the bell; Tab and the arrows stay inside', async ({ page }) => {
  await open(page)
  await bell(page, 2).click()
  await expect(panel(page).getByRole('button', { name: 'Mark all read' })).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(panel(page).getByRole('link').nth(0)).toBeFocused()
  await page.keyboard.press('Shift+Tab')
  await expect(panel(page).getByRole('button', { name: 'Mark all read' })).toBeFocused()
  await page.keyboard.press('Shift+Tab')
  await expect(panel(page).getByRole('link', { name: 'View all orders' })).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(panel(page).getByRole('button', { name: 'Mark all read' })).toBeFocused()

  await page.keyboard.press('Escape')
  await expect(panel(page)).toHaveCount(0)
  await expect(bell(page, 0)).toBeFocused()
})

test('a row opens its order and closes the panel', async ({ page }) => {
  await open(page)
  await bell(page, 2).click()
  await panel(page).getByRole('link').nth(1).click()
  await expect(page).toHaveURL(new RegExp(`/orders/${orderId(1)}$`))
  await expect(panel(page)).toHaveCount(0)
})

test('with no orders it says so and points to the shop; when the orders fail it offers a retry', async ({ page }) => {
  const mock = await open(page, [])
  await bell(page, 0).click()
  await expect(panel(page).getByText('No notifications yet')).toBeVisible()
  await expect(panel(page).getByRole('link', { name: 'Continue shopping' })).toHaveAttribute('href', '/shop')
  await expect(panel(page).getByRole('button', { name: 'Mark all read' })).toBeDisabled()
  await page.keyboard.press('Escape')

  mock.on.list = () => ({ status: 500, json: { statusCode: 500, message: 'down' } })
  mock.orders.push(...orders())
  await page.reload()
  await bell(page).click()
  await expect(panel(page).getByText(/We couldn.t load your orders/)).toBeVisible()
  mock.on.list = undefined
  await panel(page).getByRole('button', { name: 'Try again' }).click()
  await expect(panel(page).getByRole('link')).toHaveCount(3)
})

test('the bar has no sideways scroll and the panel fits on screen at 320px', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 })
  await open(page)
  await expect(bell(page, 2)).toBeVisible()
  expect(await overflow(page)).toBeLessThanOrEqual(0)
  expect((await bell(page, 2).boundingBox())!.height).toBeGreaterThanOrEqual(44)
  await bell(page, 2).click()
  await expect(panel(page)).toBeVisible()
  await insideViewport(page)
  expect(await overflow(page)).toBeLessThanOrEqual(0)
})

test('a guest gets no bell', async ({ page }) => {
  await mockAuth(page)
  await page.addInitScript(() => localStorage.setItem('silhoufit-cookie-consent', 'accepted'))
  await page.goto('/wishlist')
  await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible()
  await expect(bell(page)).toHaveCount(0)
})
