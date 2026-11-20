import { expect, test, type Page } from '@playwright/test'
import { mockAdminOrders, adminOrder } from '../shared/adminOrders'
import { mockNotifications, notification, orderId } from '../shared/notificationsApi'
import { mockStaffMe } from '../shared/products'
import { DEMO, mockAuth } from '../shared/session'

// The staff top bar's notification bell with stock alerts (PRODUCT_LOW_STOCK / PRODUCT_SOLD_OUT): each opens Inventory on its product,
// an order notification still opens Online orders on its order, and an alert with no productId is a plain row. The API is mocked; sign-in goes through the real form.

const AREAS = ['staff', 'admin'] as const
const ORDER_NUMBER = adminOrder(1).orderNumber

const stock = (productId?: string) => ({ productName: 'Heritage Polo', previousStock: 6, currentStock: 3, threshold: 5, occurredAt: '2026-11-04T01:00:00.000Z', ...(productId ? { productId } : {}) })
const items = () => [
  notification(1, { title: 'Order paid', body: 'SHF is paid.', data: { orderId: orderId(1), orderNumber: ORDER_NUMBER } }),
  notification(2, { type: 'PRODUCT_LOW_STOCK', title: 'Low stock: Heritage Polo', body: '3 left.', data: stock('prod 1') }),
  notification(3, { type: 'PRODUCT_SOLD_OUT', title: 'Sold out: Denim Jacket', body: '0 left.', data: { ...stock('prod-2'), currentStock: 0 } }),
  notification(4, { type: 'PRODUCT_LOW_STOCK', title: 'Low stock: No product', body: null, data: stock() }),
]

const bell = (page: Page, unread: number) => page.getByRole('button', { name: unread ? `Notifications, ${unread} unread` : 'Notifications', exact: true })
const panel = (page: Page) => page.getByRole('group', { name: 'Notifications' })
const row = (page: Page, title: string) => panel(page).getByRole('listitem').filter({ hasText: title })
const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)

async function open(page: Page, area: (typeof AREAS)[number]) {
  await mockAuth(page)
  await mockStaffMe(page, area)
  await page.addInitScript(() => localStorage.setItem('silhoufit-cookie-consent', 'accepted'))
  await mockAdminOrders(page, [])
  const mock = await mockNotifications(page, items())
  await page.goto(`/login?next=${encodeURIComponent(`/${area}/online-orders`)}`)
  await page.getByLabel('Email', { exact: true }).fill(DEMO.email)
  await page.getByLabel('Password', { exact: true }).fill(DEMO.password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Online orders' })).toBeVisible({ timeout: 20_000 })
  await expect(bell(page, 4)).toBeVisible()
  await bell(page, 4).click()
  await expect(panel(page).getByRole('listitem')).toHaveCount(4)
  return mock
}

for (const area of AREAS) {
  test(`${area}: stock alerts link to Inventory on the product, the order to Online orders, and an alert with no product is a plain row`, async ({ page }) => {
    await open(page, area)
    await expect(row(page, 'Low stock: Heritage Polo').getByRole('link')).toHaveAttribute('href', `/${area}/inventory?q=prod%201`)
    await expect(row(page, 'Sold out: Denim Jacket').getByRole('link')).toHaveAttribute('href', `/${area}/inventory?q=prod-2`)
    await expect(row(page, 'Order paid').getByRole('link')).toHaveAttribute('href', `/${area}/online-orders?q=${ORDER_NUMBER}`)
    await expect(row(page, 'Low stock: No product')).toBeVisible()
    await expect(row(page, 'Low stock: No product').getByRole('link')).toHaveCount(0)
    // The alert icon is aria-hidden, so it is found by its amber ring (no accessible locator exists): low stock has it, an order does not.
    await expect(row(page, 'Low stock: Heritage Polo').locator('.border-warning')).toHaveCount(1)
    await expect(row(page, 'Order paid').locator('.border-warning')).toHaveCount(0)
  })
}

test('clicking a stock alert opens Inventory on the product, marks it read and lowers the count', async ({ page }) => {
  const mock = await open(page, 'staff')
  await row(page, 'Low stock: Heritage Polo').getByRole('link').click()
  await expect(page).toHaveURL(/\/staff\/inventory\?q=prod(%20|\+)1$/)
  await expect(panel(page)).toHaveCount(0)
  await expect(bell(page, 3)).toBeVisible()
  expect(mock.marks).toEqual([notification(2).id])
})

test('on a phone a sold-out alert opens Inventory and the panel and bar have no sideways scroll', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const mock = await open(page, 'admin')
  expect(await overflow(page)).toBeLessThanOrEqual(0)
  await row(page, 'Sold out: Denim Jacket').getByRole('link').click()
  await expect(page).toHaveURL(/\/admin\/inventory\?q=prod-2$/)
  await expect(bell(page, 3)).toBeVisible()
  expect(mock.marks).toEqual([notification(3).id])
  expect(await overflow(page)).toBeLessThanOrEqual(0)
})
